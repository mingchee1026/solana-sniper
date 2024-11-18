import {NATIVE_MINT} from '@solana/spl-token';
import {
  Finality,
  ParsedTransactionWithMeta,
  RpcResponseAndContext,
  SignatureResult,
  TransactionExpiredBlockheightExceededError,
} from '@solana/web3.js';
import BigNumber from 'bignumber.js';
import {Sequelize, Transaction} from 'sequelize';
import BN from 'bn.js';
import {getConnection} from '../services';
import * as userUtils from '../routers/v1/user/utils';
import {Token, Order, PnL, User, Wallet} from '../database';

const LOG_PREFIX = 'CHECK_CONFIRMATION_CRONJOB: ';

// Main function to check transaction confirmation
export const checkConfirmation = async (
  orderId: string,
  transaction: Transaction,
  commitment: Finality
) => {
  try {
    const order = await getOrderById(orderId, transaction);
    if (!order) throw new Error(`${LOG_PREFIX} Order not found.`);
    if (!order.user)
      throw new Error(
        `${LOG_PREFIX} Order doesn't have any users associated with it.`
      );
    if (!order.user.defaultWallet)
      throw new Error(
        `${LOG_PREFIX} User doesn't have any default wallets associated with it.`
      );
    if (!order.transactionId)
      throw new Error(
        `${LOG_PREFIX} Oder doesn't have any transaction id associated with it.`
      );
    if (
      !(
        order.details &&
        order.details.recentBlockHash &&
        order.details.recentBlockHash.lastValidBlockHeight &&
        order.details.recentBlockHash.blockhash
      )
    )
      throw new Error(
        `${LOG_PREFIX} Oder doesn't have any blockhash associated with it.`
      );

    if (['confirmed', 'failed'].includes(order.status))
      return {
        success: false,
        message: 'Transaction already processed.',
        status: order.status,
      };

    let confirmation: RpcResponseAndContext<SignatureResult>;
    let transactionInfo: ParsedTransactionWithMeta | null = null;
    try {
      confirmation = await getConnection().confirmTransaction(
        {
          signature: order.transactionId,
          lastValidBlockHeight:
            order.details.recentBlockHash.lastValidBlockHeight,
          blockhash: order.details.recentBlockHash.blockhash,
        },
        commitment
      );

      if (!confirmation)
        throw new Error('Transaction not found or unconfirmed');
    } catch (e) {
      if (e instanceof TransactionExpiredBlockheightExceededError) {
        // * if solana network exceeded its last valid block height of this tx, it will return fail!
        // * in some cases it might not be the case and the tx was confirmed but the block height is exceeded.
        // * for example if the server was down. so we handle it by first fetching the tx info:
        transactionInfo = await fetchTransactionInfo(
          order.transactionId,
          commitment
        );
        if (!transactionInfo) {
          // * in this case the transaction is not included in any block and the tx fee is 0.
          // * wait until max block height, then invalidate it and reverse the balances.
          await handleTransactionFailure(order, '0', false, transaction);

          return {
            success: false,
            status: 'failed',
            message: 'Transaction failed.',
          };
        }
      } else {
        throw e;
      }
    }

    if (!transactionInfo) {
      // * if we have already fetched it in above try/catch block, we can skip fetching it again
      transactionInfo = await fetchTransactionInfo(
        order.transactionId,
        commitment
      );
    }

    if (!transactionInfo)
      // * wait until max block height, then invalidate it and reverse the balances. Next iteration will be handled
      throw new Error(
        'Should not happen unless the parsed transaction is not ready, because we already have the tx result in <confirmation> variable.'
      );

    if (transactionInfo.meta?.err) {
      await handleTransactionFailure(
        order,
        (transactionInfo.meta?.fee || 0).toString(),
        false,
        transaction
      );

      return {
        success: false,
        status: 'failed',
        message: 'Transaction failed.',
      };
    }

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
      order.user.defaultWallet.address
    );

    const quoteTokenBalanceChange = calculateQuoteTokenBalanceChange(
      transactionInfo,
      order.user.defaultWallet.address
    );

    const txFee = calculateTransactionFee(transactionInfo);

    // TODO this is for calculation of a swap that one side is SOL. IS NOT TESTED FOR OTHER PAIRS AND MARKETS

    await updateOrderWalletPnL(
      baseWallet.id,
      order,
      baseTokenBalanceChange,
      txFee,
      quoteTokenBalanceChange,
      true,
      transaction
    );

    return {
      success: true,
      status: 'confirmed',
      message: 'Transaction confirmed.',
    };
  } catch (e) {
    console.error(`${LOG_PREFIX} Error in transaction confirmation check: `, e);
  }
};

// Fetch user and order details
const getOrderById = async (orderId: string, transaction: Transaction) => {
  const order = await Order.findOne({
    where: {
      id: orderId,
    },
    include: [
      {
        model: User,
        as: 'user',
        required: true,
        include: [
          {
            // attributes: ["id", "parentId", "networkId"], // TODO efficiency
            model: Wallet,
            as: 'defaultWallet',
            required: true,
          },
        ],
      },
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
    transaction,
  });

  return order;
};

// Fetch transaction info from the blockchain
const fetchTransactionInfo = async (
  transactionId: string,
  commitment: Finality
) => {
  return await getConnection().getParsedTransaction(transactionId, {
    commitment,
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
  transactionSucceeded: boolean,
  transaction: Transaction
) => {
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
    transaction,
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
  transactionSucceeded: boolean,
  transaction: Transaction
) => {
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
};
