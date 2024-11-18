import {Request, Response, NextFunction} from 'express';
import {Joi} from 'express-validation';
import BigNumber from 'bignumber.js';
import {computeAmountOut} from '../../../price';
import * as userUtils from './utils';
import {getConnection} from '../../../services';
import {NATIVE_MINT} from '@solana/spl-token';

const LOG_PREFIX = 'USER: ';

/**
 * Updates the user's selected output mint token for swap transactions.
 *
 * This function allows users to set their desired output token based on a provided query,
 * this query can be name, symbol or contract address of the desired token for swap.
 * It updates necessary user and market information and ensuring that the transaction is configured correctly.
 *
 * This function performs several operations:
 * 1. Retrieves user data using the provided Telegram ID.
 * 2. Find the token based on the user's query. If that market is not in our database we will create it.
 * 3. Fetches pool information to obtain the current price of the Non-SOL token in the pair.
 * 4. Check if the market.revoke is true, otherwise fetch the data from blockchain and update it in DB for future use.
 * 4. Update user's input/output token selections based on their order direction, as well as the Non-SOL token's USD price.
 * 5. Computes and sets the estimated output amount based on the sell amount or buy amount (for sell, we should compute the amount based on provided percent).
 * 6. Saves the updated user data and retrieves the required data for UI representation, including the user's profit/loss data (if applicable).
 *
 * @param {Request} req - The Express request object, containing `telegramId` and `tokenQuery` in the body.
 * @param {Response} res - The Express response object used to send back JSON data.
 * @param {NextFunction} next - The Express next middleware function for handling errors.
 *
 * @returns {Promise<Response>} Returns a JSON response containing:
 *   - `success` (boolean): Indicates successful processing of activatinng the token to swap.
 *   - `result` (object): Includes:
 *     - `poolInfo` (object): Information about the trading pool.
 *     - `isRevoked` (boolean): Indicates if the market is revoked.
 *     - `user` (object): Updated user data reflecting the new token selections.
 *     - `wallet` (object): User's wallet balance details.
 *     - `pnl` (object): In 'buy' orders it is null, PnL is for PnL calculations of the current order.
 * @throws {Error} Throws an error if the order direction is invalid.
 */
export const setSelectedOutputMint = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {telegramId, tokenQuery: rawTokenQuery} = req.body;
    const tokenQuery = rawTokenQuery.toLowerCase();
    // ------------------------ Retrieve the user by Telegram ID ------------------------ //
    const user = await userUtils.getUser(telegramId);
    // --------------------------------------- END -------------------------------------- //
    // ------------ Try to find or create the market based on the token query ----------- //
    let market = await userUtils.getMarketByQuery(tokenQuery);
    if (!market) {
      // We will create the market if it doesn't exist
      // ! These two should return market with the same inner objects: getMarketByQuery & createMarketByQuery. BECAREFUL WHEN DEVELOPING
      market = await userUtils.createMarketByQuery(tokenQuery);
    }
    // --------------------------------------- END -------------------------------------- //
    // ------ Fetch pool information, and check & update token's revokation status ------ //
    const [poolInfo, isRevoked] = await Promise.all([
      userUtils.getPoolInfoByPoolAddress(market.poolAddress),
      userUtils.updateMarketRevocationStatus(market, getConnection()),
    ]);
    // --------------------------------------- END -------------------------------------- //
    // --- Update user's input/output token selections based on their order direction --- //
    user.selectedTokenUsdPrice = poolInfo.priceUsd;
    user.selectedPoolAddress = poolInfo.poolAddress;
    const [solAddress, solDecimals, nonSolAddress, nonSolDecimals] =
      poolInfo.baseToken.address === NATIVE_MINT.toBase58()
        ? [
            poolInfo.baseToken.address,
            market.baseToken!.unitDecimals,
            poolInfo.quoteToken.address,
            market.quoteToken!.unitDecimals,
          ]
        : [
            poolInfo.quoteToken.address,
            market.quoteToken!.unitDecimals,
            poolInfo.baseToken.address,
            market.baseToken!.unitDecimals,
          ];

    if (user.selectedOrderDirection === 'buy') {
      user.selectedInputMint = solAddress;
      user.selectedInputDecimals = solDecimals;
      user.selectedOutputMint = nonSolAddress;
      user.selectedOutputDecimals = nonSolDecimals;
    } else if (user.selectedOrderDirection === 'sell') {
      user.selectedInputMint = nonSolAddress;
      user.selectedInputDecimals = nonSolDecimals;
      user.selectedOutputMint = solAddress;
      user.selectedOutputDecimals = solDecimals;
    } else {
      throw new Error('Invalid order direction. Should not happen.');
    }
    // --------------------------------------- END -------------------------------------- //
    // -------------------- Get corresponding user's input wallet ----------------------- //
    const wallet = await userUtils.getWalletBalance(
      user.id,
      user.selectedInputMint
    );
    // --------------------------------------- END -------------------------------------- //
    // -------- Update user input amount and current price of the non SOL token --------- //
    let inputAmount = user.selectedInputAmount; // if user is buying we should get selectedInputAmount
    /**
     * If user is selling the token:
     * Calculates and sets the amount of tokens to sell based on percentage specified by user
     */
    if (user.selectedOrderDirection === 'sell') {
      inputAmount = new BigNumber(wallet.confirmedBalance)
        .multipliedBy(user.selectedSellPercent)
        .div(100) // 100 because of converting percentage
        .toFixed(wallet.token?.unitDecimals!, BigNumber.ROUND_DOWN);
      user.selectedSellAmount = inputAmount;
    }
    // --------------------------------------- END -------------------------------------- //
    // ------------- Compute estimated output amount based on user's input -------------- //
    const estimatedAmountOut = await computeAmountOut(
      `${poolInfo.dexId.toLowerCase()}_${poolInfo.labels[0].toLowerCase()}`,
      user.selectedPoolAddress,
      user.selectedInputMint,
      user.selectedOutputMint,
      inputAmount
    );

    /**
     * Now we will scale the raw output amount into the UI format.
     * For example estimatedAmountOut will give the output in lamports and we should convert it to SOL
     */
    user.selectedEstimatedOutput = new BigNumber(
      estimatedAmountOut.out.toString()
    )
      .div(new BigNumber(10).pow(estimatedAmountOut.outputDecimalPoints))
      .toString();
    // --------------------------------------- END -------------------------------------- //
    // -------- Update user's changes and get other data for UI representation ---------- //
    const [pnl] =
      user.selectedOrderDirection === 'buy'
        ? await Promise.all([[], user.save()])
        : await Promise.all([userUtils.getCurrentPnL(wallet.id), user.save()]);

    // ! don't update this. this is for ui to show slippage percent instead of basis points
    user.selectedSlippage /= 100;

    res.json({
      success: true,
      result: {
        ...poolInfo,
        isRevoked,
        user,
        wallet,
        pnl,
      },
    });
    // --------------------------------------- END -------------------------------------- //
  } catch (e) {
    next(e);
  }
};

export const setSelectedOutputMintValidator = {
  body: Joi.object({
    telegramId: Joi.string().required(),
    tokenQuery: Joi.string().required(),
  }),
};
