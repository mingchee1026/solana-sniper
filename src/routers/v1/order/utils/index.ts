import {PublicKey, VersionedTransaction} from '@solana/web3.js';
import BigNumber from 'bignumber.js';
import {
  db,
  Key,
  Market,
  Order,
  Token,
  User,
  Wallet,
} from '../../../../database';
import {NATIVE_MINT, NATIVE_MINT_2022} from '@solana/spl-token';
import {bs58} from '@coral-xyz/anchor/dist/cjs/utils/bytes';
import {setSelectedOrderDirection} from '../../user';
import {Sequelize, Transaction} from 'sequelize';
import {BlockHash} from '../../../../types';
import {DefaultTransactionExecutor} from '../../../../transaction-executor';

const LOG_PREFIX = 'ORDER: ';

export const getUser = async (telegramId: string) => {
  const user = await User.findOne({
    where: {
      telegramId,
    },
    include: [
      {
        // attributes: ["id", "parentId", "networkId"], // TODO efficiency
        model: Wallet,
        as: 'defaultWallet',
        required: true,
        include: [
          {
            attributes: ['id', 'privateKey'],
            model: Key,
            as: 'key',
            required: true,
          },
        ],
      },
    ],
    nest: true,
  });

  if (!user) throw new Error(`${LOG_PREFIX}User not found.`);

  if (!user.defaultWalletId)
    throw new Error(`${LOG_PREFIX}User has no default wallet.`);

  if (!user.defaultWallet)
    throw new Error(`${LOG_PREFIX}User's default wallet not found!`);

  if (!user.defaultWallet.key)
    throw new Error(`${LOG_PREFIX}User's default wallet's key not found!`);

  if (
    user.selectedOrderDirection !== 'buy' &&
    user.selectedOrderDirection !== 'sell'
  )
    throw new Error('invalid order direction');

  if (!user.selectedInputAmount) throw new Error('user buy amount not set');
  if (!user.selectedSellPercent) throw new Error('user sell percent not set');
  if (!user.selectedPoolAddress) throw new Error('user pool address not set');
  if (!user.selectedInputMint) throw new Error('user input mint not set');
  if (!user.selectedOutputMint) throw new Error('user output mint not set');
  if (!user.selectedEstimatedOutput)
    throw new Error('user estimated output not set');

  if (
    // ! we only support native mint for dex, for other token jupiter is used
    (user.selectedOrderDirection === 'buy' &&
      (user.selectedInputMint === NATIVE_MINT.toBase58() ||
        user.selectedInputMint === NATIVE_MINT_2022.toBase58())) ||
    (user.selectedOrderDirection === 'sell' &&
      (user.selectedOutputMint === NATIVE_MINT.toBase58() ||
        user.selectedOutputMint === NATIVE_MINT_2022.toBase58()))
  ) {
    return user;
  }

  throw new Error(
    `${LOG_PREFIX}Selected user fields for swap are not set correctly.`
  );
};

export const transactionalCreateOrderAndSendToNetwork = async (
  userId: string,
  transaction: VersionedTransaction,
  inputATA: PublicKey,
  outputATA: PublicKey,
  rawAmount: BigNumber,
  amountInUsd: string,
  ourFeeInLamports: bigint,
  priorityFee: number,
  txExecutor: DefaultTransactionExecutor,
  recentBlockhash: BlockHash,
  limitOrder: string | null,
  dcaPubKey: PublicKey | null
) => {
  // This transaction blocks other requests.
  return await db.sequelize.transaction(
    {isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED},
    async t => {
      /**
       * ! THIS IS NECESSARY TO PROHIBIT OTHER USER API CALLS TO BE CALLED DURING UPDATING BALANCES
       * ! AND SENDING THE TRANSACTIION TO THE NETWORK (especially in update balance)
       */
      const user = await User.findOne({
        where: {
          id: userId,
        },
        include: [
          {
            // attributes: ["id", "parentId", "networkId"], // TODO efficiency
            model: Wallet,
            as: 'defaultWallet',
            required: true,
            include: [
              {
                attributes: ['id', 'privateKey'],
                model: Key,
                as: 'key',
                required: true,
              },
            ],
          },
        ],
        lock: true, // ! IMPORTANT: It will lock other queries to avoid race conditions.
        skipLocked: true, // ! IMPORTANT: It will lock other queries to avoid race conditions.
        nest: true,
        transaction: t,
      });

      const delay = (ms: number) =>
        new Promise(resolve => setTimeout(resolve, ms));
      await delay(30000);

      if (!user) throw new Error(`${LOG_PREFIX}User not found.`);
      if (!user.defaultWallet)
        throw new Error(`${LOG_PREFIX}User default wallet are not set.`);
      if (!user.defaultWallet.key)
        throw new Error(`${LOG_PREFIX}User default wallet key is not present.`);
      if (!user.selectedPoolAddress)
        throw new Error(`${LOG_PREFIX}User pool address are not set.`);

      // create an order entry in database
      const inputWalletAddr =
        user.selectedInputMint !== 'So11111111111111111111111111111111111111112'
          ? inputATA
          : new PublicKey(user.defaultWallet.address);

      const outputWalletAddr =
        user.selectedOutputMint !==
        'So11111111111111111111111111111111111111112'
          ? outputATA
          : new PublicKey(user.defaultWallet.address);

      let [market, inputWallet, outputWallet] = await Promise.all([
        Market.findOne({
          where: {
            poolAddress: user.selectedPoolAddress,
          },
          include: [
            {
              attributes: ['contractAddress'],
              model: Token,
              as: 'quoteToken',
              required: true,
            },
          ],
          raw: true,
          nest: true,
          transaction: t,
        }),
        Wallet.findOne({
          attributes: ['id'],
          where: {
            address: inputWalletAddr.toBase58(),
          },
          include: [
            {
              attributes: ['contractAddress'],
              model: Token,
              as: 'token',
              required: true,
            },
          ],
          lock: true, // ! IMPORTANT: It will lock other queries to avoid race conditions.
          skipLocked: true, // ! IMPORTANT: It will lock other queries to avoid race conditions.
          raw: true,
          nest: true,
          transaction: t,
        }),
        Wallet.findOne({
          attributes: ['id'],
          where: {
            address: outputWalletAddr.toBase58(),
          },
          raw: true,
          nest: true,
          transaction: t,
        }),
      ]);

      if (!market)
        throw new Error(`${LOG_PREFIX}Provided market does not found/created.`);
      if (!inputWallet)
        // ! IMPORTANT: It will lock other queries to avoid race conditions
        throw new Error(
          `${LOG_PREFIX}Another transaction with this wallet is ongoing.`
        );

      if (!outputWallet) {
        // It is a new buy (OR EVEN SELL: if token is transferred outside of our swap) order and it doesn't have corresponding wallet for it
        const outputTokenId =
          inputWallet.token!.contractAddress ===
          market.quoteToken!.contractAddress
            ? market.baseTokenId
            : market.quoteTokenId;
        outputWallet = await Wallet.create(
          {
            userId: user.id,
            parentId: user.defaultWalletId,
            tokenId: outputTokenId,
            keyId: user.defaultWallet.key.id,
            address: outputWalletAddr.toBase58(),
            confirmedBalance: '0',
            unconfirmedBalance: '0',
            status: 'active',
          },
          {transaction: t}
        );
      }
      user.selectedTransactionId = bs58.encode(transaction.signatures[0]);
      // ------------------------- Reset order direction -------------------------
      user.selectedOrderDirection = 'buy';
      user.selectedOrderType = 'swap';
      user.selectedPoolAddress = null;
      user.selectedInputMint = null;
      user.selectedOutputMint = null;
      user.selectedEstimatedOutput = null;
      user.selectedInputDecimals = 0;
      user.selectedOutputDecimals = 0;
      user.selectedPriceImpact = 0;
      user.selectedSellAmount = '0';
      user.selectedTokenUsdPrice = '0';
      // DCA Orfer
      user.selectedDCAInAmount = 0;
      user.selectedDCAInAmountPerCycle = 0;
      user.selectedDCACycleSecondsApart = 0;
      // ---------------------------------- END ----------------------------------

      await Promise.all([
        user.save({transaction: t}),
        Order.create(
          {
            userId: user.id,
            marketId: market.id,
            inputWalletId: inputWallet.id,
            outputWalletId: outputWallet.id,
            transactionId: bs58.encode(transaction.signatures[0]),
            inAmount: rawAmount.toString(),
            inAmountInUsd: amountInUsd,
            commission: ourFeeInLamports.toString(),
            networkFee: '0',
            orderType: user.selectedOrderType,
            orderDirection: user.selectedOrderDirection,
            // Limit Order String
            limitOrder,
            // DCA Public key
            dcaPubKey: dcaPubKey?.toBase58(),
            succeeded: false,
            status: 'submitted',
            details: {
              recentBlockHash: recentBlockhash,
              estimatedFee: {
                priorityFee: priorityFee.toString(),
                // computeUnit: estimatedComputeUnits, // TODO
              },
            },
          },
          {transaction: t}
        ),
        Wallet.update(
          {
            confirmedBalance: Sequelize.literal(
              `confirmed_balance - ${rawAmount.toString()}`
            ),
            unconfirmedBalance: Sequelize.literal(
              `unconfirmed_balance + ${rawAmount.toString()}`
            ),
          },
          {where: {id: inputWallet.id}, returning: false, transaction: t}
        ),
      ]);
      // send transaction
      return await txExecutor.execute(transaction);
    }
  );
};
