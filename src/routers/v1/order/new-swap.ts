import bs58 from 'bs58';
import {Request, Response, NextFunction} from 'express';
import {Joi} from 'express-validation';
import {Keypair, VersionedTransaction} from '@solana/web3.js';
import {NATIVE_MINT} from '@solana/spl-token';
import * as orderUtils from './utils';
import * as userUtils from '../user/utils';
import {priorityFeeEstimate, recentBlockhash, txExecutor} from '../../..';
import {createSwapTransaction} from '../../../transactions/swap';
import BigNumber from 'bignumber.js';
import {Wallet} from '../../../database';

const LOG_PREFIX = 'ORDER: ';

/**
 * Creates an order entry in the database and executes the transaction on the Solana network.
 *
 * This function performs the following actions:
 * 1. Retrieves user data using the provided Telegram ID.
 * 2. Verifies user having enough balance.
 * 3. Fetches the user's keypair for signing the transaction
 * 4. Fetches and round priority fee. (previous bug: if not rounded service will fail)
 * 5. Fetches the input token price.
 * 6. Creates and signs a transaction according to the inputs.
 * 7. Creates the order entry, destination wallet (if not existed), and sends it to the network. This is done atomically using database transactions.
 * 8. Resets the order direction in the user's record to 'buy'.
 * 9. Retrieves and prepares data for UI.
 *
 * @param {Request} req - The Express request object, containing the user's telegramId in the body.
 * @param {Response} res - The Express response object, used to send the response back to the client.
 * @param {NextFunction} next - The Express next middleware function, used to handle errors.
 *
 * @returns {Promise<Response>} Returns a JSON response containing:
 *   - `success` (boolean): Indicates if the order was created and the transaction was successfully sent.
 *   - `result` (object): Contains relevant data for UI, including:
 *     - `isRevoked` (boolean): Whether the market is revoked.
 *     - `user` (object): Updated user data with the new transaction id that has been just sent.
 *     - `wallet` (object): User's wallet balance.
 *     - `pnl` (object): PnL object from database containing potential profit and loss information. PnL only exists if user is doing a sell order.
 * @throws {Error} Throws an error if any of the process steps fail, including issues with the transaction or user data.
 */
export const create = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {telegramId} = req.body;

    // TODO prevent from an orderr which has not enough our fee and tx fee
    // ------------------------ Retrieve the user by Telegram ID ------------------------ //
    let user = await orderUtils.getUser(telegramId);
    // save last user status, as we will reset it to 'buy' and default values after each swap
    const {
      selectedOrderDirection,
      selectedOrderType,
      selectedPoolAddress,
      selectedInputMint,
      selectedOutputMint,
      selectedEstimatedOutput,
      selectedInputDecimals,
      selectedOutputDecimals,
      selectedPriceImpact,
      selectedSellAmount,
      selectedTokenUsdPrice,
    } = user;
    // --------------------------------------- END -------------------------------------- //
    // ------------------------- Check user has enough balance -------------------------- //
    let inputWalletBalance = new BigNumber(
      user.defaultWallet!.confirmedBalance
    ).div(new BigNumber(10).pow(user.selectedInputDecimals)); // If it is SOL token in `buy`
    if (user.selectedOrderDirection === 'sell') {
      // In sell it is a non SOL Wallet
      inputWalletBalance = new BigNumber(
        (
          await userUtils.getWalletBalance(user.id, user.selectedInputMint!)
        ).confirmedBalance
      );
    }
    if (
      (user.selectedOrderDirection === 'buy' &&
        new BigNumber(user.selectedInputAmount).gt(inputWalletBalance)) ||
      (user.selectedOrderDirection === 'sell' &&
        new BigNumber(user.selectedSellAmount).gt(inputWalletBalance))
    ) {
      throw new Error("User doesn't have enough balance");
    }
    // --------------------------------------- END -------------------------------------- //
    // ----------------- Get the user's secret key and generate keypair ----------------- //
    const secretKeyString = user.defaultWallet!.key!.privateKey;
    const keypair = Keypair.fromSecretKey(bs58.decode(secretKeyString));
    // --------------------------------------- END -------------------------------------- //
    // -------------------- Get the priority fee for the transaction -------------------- //
    const priorityFee = Math.ceil(
      priorityFeeEstimate.priorityFeeLevels?.high || 0
    ); // previous bug: becareful might be float!
    // --------------------------------------- END -------------------------------------- //
    // ----- Get the USD price of the input token (to calculate order value in USD) ----- //
    const tokenUsdPrice =
      user.selectedOrderDirection === 'buy'
        ? // TODO get SOL price better
          (await userUtils.getPoolInfoByTokenAddress(NATIVE_MINT.toBase58())) // ! we only support sol as input in buy orders
            .priceUsd
        : user.selectedTokenUsdPrice;
    // --------------------------------------- END -------------------------------------- //
    // ----------- Create the Swap trnasaction and set priority fee for that ------------ //
    const {
      message,
      inputATA,
      outputATA,
      rawInAmount,
      inAmountInUsd,
      ourFeeInLamports,
    } = await createSwapTransaction(
      user.selectedPoolAddress!,
      keypair,
      user.selectedInputMint!,
      user.selectedOutputMint!,
      user.selectedOrderDirection === 'buy'
        ? user.selectedInputAmount
        : user.selectedSellAmount,
      user.selectedEstimatedOutput!,
      tokenUsdPrice,
      user.selectedSlippage,
      user.selectedOrderDirection,
      priorityFee
    );

    // Sign the transaction
    const transaction = new VersionedTransaction(message.compileToV0Message());
    transaction.sign([keypair]);
    // --------------------------------------- END -------------------------------------- //
    // ------ Send the transaction and create the order in DB (it is done atomic) ------- //
    await orderUtils.transactionalCreateOrderAndSendToNetwork(
      user.id,
      transaction,
      inputATA,
      outputATA,
      rawInAmount,
      inAmountInUsd.toString(),
      ourFeeInLamports,
      priorityFee,
      txExecutor,
      recentBlockhash
    );
    // --------------------------------------- END -------------------------------------- //
    // ! Following was tested, although it seems efficient but it took ~21.872 seconds
    // console.time('helius');
    // const result = await helius.rpc.sendSmartTransaction(
    //   message.instructions,
    //   [keypair]
    // );
    // console.timeEnd('helius');

    // const result = await txExecutor.executeAndConfirm(
    //   transaction,
    //   recentBlockhash
    // );

    // console.log(result);

    // Fetch the market, pool, wallet, and PnL data
    // -------------------------- Get data for UI representation ------------------------ //
    const [market, poolInfo, wallet] = await Promise.all([
      userUtils.getMarketByPoolAddress(user.selectedPoolAddress!),
      userUtils.getPoolInfoByPoolAddress(user.selectedPoolAddress!),
      userUtils.getWalletBalance(user.id, user.selectedInputMint!),
    ]);

    const pnl = await Promise.all([
      user.selectedOrderDirection === 'sell'
        ? await userUtils.getCurrentPnL(wallet.id)
        : null,
    ]);

    // ! don't update following in user's table.
    // this is for ui to show slippage percent instead of basis points
    user.selectedSlippage /= 100;
    // as we have reset the user state in previous steps, we should tell the UI how user state was when the user performs the swap.
    user.selectedOrderDirection = selectedOrderDirection;
    user.selectedOrderType = selectedOrderType;
    user.selectedPoolAddress = selectedPoolAddress;
    user.selectedInputMint = selectedInputMint;
    user.selectedOutputMint = selectedOutputMint;
    user.selectedEstimatedOutput = selectedEstimatedOutput;
    user.selectedInputDecimals = selectedInputDecimals;
    user.selectedOutputDecimals = selectedOutputDecimals;
    user.selectedPriceImpact = selectedPriceImpact;
    user.selectedSellAmount = selectedSellAmount;
    user.selectedTokenUsdPrice = selectedTokenUsdPrice;

    return res.json({
      success: true,
      result: {...poolInfo, isRevoked: market.isRevoked, user, wallet, pnl},
    });
    // --------------------------------------- END -------------------------------------- //
  } catch (e) {
    next(e);
  }
};

export const createValidator = {
  body: Joi.object({
    telegramId: Joi.string().required(),
  }),
};
