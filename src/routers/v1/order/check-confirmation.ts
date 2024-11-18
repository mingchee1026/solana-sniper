import {Request, Response, NextFunction} from 'express';
import {Joi} from 'express-validation';
import {NATIVE_MINT} from '@solana/spl-token';
import {Token, db, Order, PnL, User, Wallet} from '../../../database';
import {Sequelize, Transaction, where} from 'sequelize';
import BN from 'bn.js';
import * as userUtils from '../user/utils';
import {ParsedTransactionWithMeta} from '@solana/web3.js';
import BigNumber from 'bignumber.js';
import {getConnection} from '../../../services';

const LOG_PREFIX = 'ORDER: ';

// Main function to check transaction confirmation
export const checkConfirmation = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      telegramId,
      transactionId,
    }: {telegramId: string; transactionId: string} = req.body;

    const [user, order] = await getUserAndOrder(telegramId, transactionId);
    if (!user) throw new Error(`${LOG_PREFIX} User not found.`);
    if (!order) throw new Error(`${LOG_PREFIX} Order not found.`);
    if (['confirmed', 'failed'].includes(order.status))
      return res.status(400).json({
        success: false,
        message: 'Transaction already processed.',
      });

    const transactionInfo = await fetchTransactionInfo(transactionId);
    if (!transactionInfo) {
      // TODO what to do in this case? may get accepted.
      // * Sol: wait until max block height, then invalidate it and reverse the balances
      return res.status(400).json({
        success: false,
        message: 'Transaction not found or unconfirmed.',
      });
    }

    if (transactionInfo.meta?.err) {
      await handleTransactionFailure(
        order,
        (transactionInfo.meta?.fee || 0).toString(),
        false
      );

      return res.status(400).json({
        success: false,
        message: 'Transaction failed.',
      });
    }

    // TODO check for double spending the order transaction

    if (
      !transactionInfo.meta ||
      !transactionInfo.meta.preTokenBalances ||
      !transactionInfo.meta.postTokenBalances
    )
      throw new Error('transaction meta information not found');

    const baseWallet =
      order.orderDirection === 'buy' ? order.outputWallet : order.inputWallet;
    if (!baseWallet)
      throw new Error('Base wallet does not exist on the order object');

    const baseTokenBalanceChange = calculateBaseTokenChanges(
      transactionInfo,
      baseWallet.token!.contractAddress,
      user.defaultWallet?.address!
    );

    const quoteTokenBalanceChange = calculateQuoteTokenBalanceChange(
      transactionInfo,
      user.defaultWallet?.address!
    );

    const txFee = calculateTransactionFee(transactionInfo);

    // TODO this is for calculation of a swap that one side is SOL. IS NOT TESTED FOR OTHER PAIRS AND MARKETS

    await updateOrderWalletPnL(
      baseWallet.id,
      order,
      baseTokenBalanceChange,
      txFee,
      quoteTokenBalanceChange,
      true
    );

    res.json({success: true});
  } catch (e) {
    console.error(`${LOG_PREFIX} Error in transaction confirmation check: `, e);
    next(e);
  }
};

// Fetch user and order details
const getUserAndOrder = async (telegramId: string, transactionId: string) => {
  const userPromise = User.findOne({
    where: {
      telegramId,
    },
    include: [
      {
        // attributes: ["id", "parentId", "networkId"], // TODO efficiency
        model: Wallet,
        as: 'defaultWallet',
        required: true,
      },
    ],
    nest: true,
    raw: true,
  });

  const orderPromise = Order.findOne({
    where: {
      transactionId,
    },
    include: [
      {
        model: Wallet,
        as: 'inputWallet',
        required: true,
        include: [
          {
            attributes: ['contractAddress', 'unitDecimals'],
            model: Token,
            as: 'token',
            required: true,
          },
        ],
      },
      {
        model: Wallet,
        as: 'outputWallet',
        required: true,
        include: [
          {
            attributes: ['contractAddress', 'unitDecimals'],
            model: Token,
            as: 'token',
            required: true,
          },
        ],
      },
    ],
    nest: true,
  });

  return Promise.all([userPromise, orderPromise]);
};

// Fetch transaction info from the blockchain
const fetchTransactionInfo = async (transactionId: string) => {
  return await getConnection().getParsedTransaction(transactionId, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });
};

// Calculate the base token balance changes
const calculateBaseTokenChanges = (
  transactionInfo: ParsedTransactionWithMeta,
  mintAddress: string,
  ownerAddress: string
) => {
  let baseTokenBalanceChange = new BN(0);
  transactionInfo.meta?.postTokenBalances!.forEach(postTokenBalance => {
    if (
      postTokenBalance.mint.toLowerCase() === mintAddress.toLowerCase() &&
      postTokenBalance.owner?.toLowerCase() === ownerAddress.toLowerCase()
    ) {
      baseTokenBalanceChange = new BN(postTokenBalance.uiTokenAmount.amount);
    }
  });

  transactionInfo.meta?.preTokenBalances!.forEach(preTokenBalance => {
    if (
      preTokenBalance.mint.toLowerCase() === mintAddress.toLowerCase() &&
      preTokenBalance.owner?.toLowerCase() === ownerAddress.toLowerCase()
    ) {
      baseTokenBalanceChange = baseTokenBalanceChange.sub(
        new BN(preTokenBalance.uiTokenAmount.amount)
      );
    }
  });

  return baseTokenBalanceChange;
};

// Calculate the quote token balance change
const calculateQuoteTokenBalanceChange = (
  transactionInfo: ParsedTransactionWithMeta,
  defaultWalletAddress: string
): BN => {
  const defaultWalletIdx =
    transactionInfo.transaction.message.accountKeys.findIndex(
      (el: any) => el.pubkey.toBase58() === defaultWalletAddress
    );

  return new BN(
    transactionInfo.meta?.postBalances[defaultWalletIdx]! -
      transactionInfo.meta?.preBalances[defaultWalletIdx]!
  );
};

// Calculate the transaction fee
const calculateTransactionFee = (
  transactionInfo: ParsedTransactionWithMeta
) => {
  return new BN(
    transactionInfo.meta!.preBalances.reduce((a, b) => a + b, 0) -
      transactionInfo.meta!.postBalances.reduce((a, b) => a + b, 0)
  );
};

// Handle errors in transactions
const handleTransactionFailure = async (
  order: Order,
  txFee: string,
  transactionSucceeded: boolean
) => {
  await db.sequelize.transaction(
    {isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED},
    async transaction => {
      // update order
      order.networkFee = txFee;
      order.status = 'failed';
      order.succeeded = false;

      await Promise.all([
        order.save({transaction}),
        updateWalletBalances(
          order.orderDirection,
          order.inAmount,
          '0',
          txFee,
          '0',
          order.inputWalletId,
          order.inputWallet?.parentId! || order.inputWallet?.id!,
          order.outputWalletId,
          transaction,
          transactionSucceeded
        ),
      ]);
    }
  );
};

// Update wallet balances
const updateWalletBalances = async (
  orderDirection: 'buy' | 'sell',
  orderInAmount: string,
  orderOutAmount: string,
  txFee: string,
  commission: string,
  inputWalletId: string,
  inputParentWalletId: string,
  outputWalletId: string,
  transaction: Transaction,
  transactionSucceeded: boolean
) => {
  return await Promise.all([
    Wallet.update(
      {
        confirmedBalance: Sequelize.literal(
          `confirmed_balance + ${transactionSucceeded ? 0 : orderInAmount}`
        ),
        unconfirmedBalance: Sequelize.literal(
          `unconfirmed_balance - ${orderInAmount}`
        ),
      },
      {where: {id: inputWalletId}, returning: false, transaction}
    ),

    orderDirection === 'buy'
      ? Wallet.update(
          {
            confirmedBalance: Sequelize.literal(
              `confirmed_balance - ${new BN(transactionSucceeded ? commission : '0').add(new BN(txFee)).toString()}`
            ),
          },
          {where: {id: inputParentWalletId}, returning: false, transaction}
        )
      : null,

    transactionSucceeded
      ? Wallet.update(
          {
            confirmedBalance: Sequelize.literal(
              `confirmed_balance + ${orderOutAmount}`
            ),
          },
          {where: {id: outputWalletId}, returning: false, transaction}
        )
      : null,
  ]);
};

// Update or create PnL records
const updateOrCreatePnL = async (
  baseWalletId: string,
  order: Order,
  baseTokenBalanceChange: BN,
  quoteTokenBalanceChange: BN,
  transaction: Transaction
) => {
  // create pnl if not exists
  // TODO what if two requests want to modify this?
  let pnl = await PnL.findOne({
    where: {walletId: baseWalletId, isClosed: false},
  });
  if (!pnl) {
    // it is a brand new buy order, so we need to create a pnl associated with that
    pnl = await PnL.create(
      {
        walletId: baseWalletId,
        cumulativeBuyQuantity: baseTokenBalanceChange.toString(),
        cumulativeBuyCostInSol: order.inAmount,
        cumulativeBuyCostInUsd: order.inAmountInUsd,
        cumulativeSellQuantity: '0',
        cumulativeSellProceedsInSol: '0',
        cumulativeSellProceedsInUsd: '0',
      },
      {transaction}
    );
    return;
  }

  if (order.orderDirection === 'buy') {
    // add to the buy part of the PnL
    await PnL.update(
      {
        cumulativeBuyQuantity: Sequelize.literal(
          `cumulative_buy_quantity + ${baseTokenBalanceChange.toString()}`
        ),
        cumulativeBuyCostInSol: Sequelize.literal(
          `cumulative_buy_cost_in_sol + ${order.inAmount}`
        ),
        cumulativeBuyCostInUsd: Sequelize.literal(
          `cumulative_buy_cost_in_usd + ${order.inAmountInUsd}`
        ),
      },
      {
        where: {
          id: pnl.id,
        },
        transaction,
      }
    );
  } else if (order.orderDirection === 'sell') {
    // add to the sell part of the PnL
    const solPrice = (
      await userUtils.getPoolInfoByTokenAddress(NATIVE_MINT.toBase58())
    ).priceUsd;
    await PnL.update(
      {
        cumulativeSellQuantity: Sequelize.literal(
          `cumulative_sell_quantity + ${order.inAmount}`
        ),
        cumulativeSellProceedsInSol: Sequelize.literal(
          `cumulative_sell_proceeds_in_sol + ${quoteTokenBalanceChange.toString()}`
        ),
        cumulativeSellProceedsInUsd: Sequelize.literal(
          `cumulative_sell_proceeds_in_usd + ${new BigNumber(solPrice).multipliedBy(new BigNumber(quoteTokenBalanceChange.toString()).div(1_000_000_000)).toString()}`
        ),
        isClosed:
          new BigNumber(pnl.cumulativeSellQuantity)
            .plus(new BigNumber(order.inAmount))
            .toString() === pnl.cumulativeBuyQuantity,
      },
      {
        where: {
          id: pnl.id,
        },
        transaction,
      }
    );
  }
};

// Update the Order, Wallet balances and Profit and Loss (PnL) records
const updateOrderWalletPnL = async (
  baseWalletId: string,
  order: Order,
  baseTokenBalanceChange: BN,
  txFee: BN,
  quoteTokenBalanceChange: BN,
  transactionSucceeded: boolean
) => {
  await db.sequelize.transaction(
    {isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED},
    async transaction => {
      order.outAmount = (
        order.orderDirection === 'buy'
          ? baseTokenBalanceChange
          : quoteTokenBalanceChange
      ).toString();
      order.networkFee = txFee.toString();
      order.status = 'confirmed';
      order.succeeded = true;

      await Promise.all([
        // update order record
        order.save({transaction}),
        // update wallet balances
        updateWalletBalances(
          order.orderDirection,
          order.inAmount,
          order.outAmount,
          txFee.toString(),
          order.commission,
          order.inputWalletId,
          order.inputWallet?.parentId! || order.inputWallet?.id!,
          order.outputWalletId,
          transaction,
          transactionSucceeded
        ),
        // update PnL state
        updateOrCreatePnL(
          baseWalletId,
          order,
          baseTokenBalanceChange,
          quoteTokenBalanceChange,
          transaction
        ),
      ]);
    }
  );
};

// Validation schema for incoming requests
export const checkConfirmationValidator = {
  body: Joi.object({
    telegramId: Joi.string().required(),
    transactionId: Joi.string().required(),
  }),
};
