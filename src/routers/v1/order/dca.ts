import bs58 from 'bs58';
import {Request, Response, NextFunction} from 'express';
import {Joi} from 'express-validation';
import {Keypair, PublicKey, VersionedTransaction} from '@solana/web3.js';
import {NATIVE_MINT} from '@solana/spl-token';
import * as orderUtils from './utils';
import * as userUtils from '../user/utils';
import {priorityFeeEstimate, recentBlockhash, txExecutor} from '../../..';
import {createDCATransaction} from '../../../transactions/dca';
import BigNumber from 'bignumber.js';
import {Wallet} from '../../../database';

export const createDCA = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {telegramId} = req.body;

    // Retrieve the user by Telegram ID
    let user = await orderUtils.getUser(telegramId);

    // Check user has enough balance
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

    // Get the user's secret key and generate keypair
    const secretKeyString = user.defaultWallet!.key!.privateKey;
    const keypair = Keypair.fromSecretKey(bs58.decode(secretKeyString));

    // Get the priority fee for the transaction
    const priorityFee = Math.ceil(
      priorityFeeEstimate.priorityFeeLevels?.high || 0
    ); // previous bug: becareful might be float!

    // Get the USD price of the input token (to calculate order value in USD)
    const tokenUsdPrice =
      user.selectedOrderDirection === 'buy'
        ? // TODO get SOL price better
          (await userUtils.getPoolInfoByTokenAddress(NATIVE_MINT.toBase58())) // ! we only support sol as input in buy orders
            .priceUsd
        : user.selectedTokenUsdPrice;

    // Get dca params from users
    const inAmount = BigInt(user.selectedDCAInAmount); // BigInt(5_000_000); // buy a total of 5 USDC over 5 days
    const inAmountPerCycle = BigInt(user.selectedDCAInAmountPerCycle); // BigInt(1_000_000); // buy using 1 USDC each day
    const cycleSecondsApart = BigInt(user.selectedDCACycleSecondsApart); // BigInt(86400); // 1 day between each order -> 60 * 60 * 24

    const {
      dcaPubKey,
      message,
      inputATA,
      outputATA,
      rawInAmount,
      inAmountInUsd,
      ourFeeInLamports,
    } = await createDCATransaction(
      keypair,
      new PublicKey(user.selectedInputMint!),
      new PublicKey(user.selectedOutputMint!),
      inAmount,
      inAmountPerCycle,
      cycleSecondsApart,
      null,
      user.selectedOrderDirection,
      tokenUsdPrice,
      priorityFee
    );

    // Sign the transaction
    const transaction = new VersionedTransaction(message.compileToV0Message());
    transaction.sign([keypair]);

    // Send the transaction and create the order in DB (it is done atomic)
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
      recentBlockhash,
      null,
      dcaPubKey
    );
  } catch (e) {
    next(e);
  }
};
