import * as anchor from '@coral-xyz/anchor';
import {
  CloseDCAParams,
  DCA,
  Network,
  type CreateDCAParamsV2,
  type DepositParams,
  type WithdrawParams,
} from '@jup-ag/dca-sdk';
import {
  Connection,
  ComputeBudgetProgram,
  PublicKey,
  Signer,
  SystemProgram,
  TransactionMessage,
  TransactionInstruction,
  VersionedTransaction,
  AddressLookupTableAccount,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import BigNumber from 'bignumber.js';
import {getConnection, exchangeSolWallet} from '../services';
import {BlockHash} from '../types';
import {recentBlockhash, EXCHANGE_FEE} from '..';

export async function createDCATransaction(
  payer: Signer,
  inputMint: PublicKey,
  outputMint: PublicKey,
  inAmount: bigint,
  inAmountPerCycle: bigint,
  cycleSecondsApart: bigint,
  startAt: bigint | null,
  orderDirection: 'buy' | 'sell',
  tokenPriceUsd: string,
  computeUnitPrice: number
) {
  if (inAmount === BigInt(0)) {
    throw new Error(`${payer.publicKey.toBase58()}: Empty balance, can't sell`);
  }

  // Get DCA transactions and pubkey
  const {dcaTransaction, dcaPubKey} = await getSignedDCATransaction(
    payer,
    inputMint,
    outputMint,
    inAmount,
    inAmountPerCycle,
    cycleSecondsApart,
    startAt
  );

  // scale the input amount to get the raw amount
  const inputDecimalPoints = await getTokenDecimals(inputMint);
  const outputDecimalPoints = await getTokenDecimals(outputMint);

  const inAmountInUsd = new BigNumber(Number(inAmount)).multipliedBy(
    tokenPriceUsd
  );

  const rawInAmount = new BigNumber(Number(inAmount)).multipliedBy(
    new BigNumber(10).pow(inputDecimalPoints)
  );

  const rawOutAmount = new BigNumber(Number(inAmount)).multipliedBy(
    new BigNumber(10).pow(outputDecimalPoints)
  );

  // get associated token addresses
  const inputATA = getAssociatedTokenAddressSync(
    inputMint,
    payer.publicKey,
    false,
    TOKEN_PROGRAM_ID
  );
  const outputATA = getAssociatedTokenAddressSync(
    outputMint,
    payer.publicKey,
    false,
    TOKEN_PROGRAM_ID
  );

  // create priority fee instruction
  const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: computeUnitPrice,
  });

  // calculate out fee
  const ourFeeInLamports = BigInt(
    (orderDirection === 'buy'
      ? rawInAmount
      : new BigNumber(rawOutAmount.toString())
    )
      .multipliedBy(EXCHANGE_FEE)
      .toFixed(0, BigNumber.ROUND_DOWN)
  );

  const message = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: recentBlockhash.blockhash,
    instructions: [
      addPriorityFee,
      ...dcaTransaction,
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: exchangeSolWallet,
        lamports: ourFeeInLamports,
      }),
    ],
  });

  const transaction = new VersionedTransaction(message.compileToV0Message());
  transaction.sign([payer]);

  return {
    dcaPubKey,
    message,
    inputATA,
    outputATA,
    rawInAmount,
    inAmountInUsd,
    ourFeeInLamports,
  };
}

async function getSignedDCATransaction(
  payer: Signer,
  inputMint: PublicKey,
  outputMint: PublicKey,
  inAmount: bigint,
  inAmountPerCycle: bigint,
  cycleSecondsApart: bigint,
  startAt: bigint | null
) {
  const connection = getConnection();

  const dca = new DCA(connection, Network.MAINNET);

  const params: CreateDCAParamsV2 = {
    payer: payer.publicKey,
    user: payer.publicKey,
    inAmount: inAmount,
    inAmountPerCycle,
    cycleSecondsApart,
    inputMint, // sell
    outputMint, // buy
    minOutAmountPerCycle: null,
    maxOutAmountPerCycle: null,
    startAt: startAt,
  };

  const {tx, dcaPubKey} = await dca.createDcaV2(params);

  // create priority fee instruction
  // const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
  //   microLamports: computeUnitPrice,
  // });
  // tx.instructions = [addPriorityFee, ...tx.instructions];

  // // set recent blockhash
  // tx.recentBlockhash = recentBlockhash.blockhash;

  // // Sign the transaction
  // const dcaTransaction = new VersionedTransaction(tx.compileMessage());
  // dcaTransaction.sign([payer]);

  return {dcaTransaction: tx.instructions, dcaPubKey};
}

export async function closeDCA(payer: Signer, dcaPubKey: PublicKey) {
  const params: CloseDCAParams = {
    user: payer.publicKey,
    dca: dcaPubKey,
  };

  const connection = getConnection();
  const dca = new DCA(connection, Network.MAINNET);
  const {tx} = await dca.closeDCA(params);

  return tx;
}

async function getTokenDecimals(tokenAddress: PublicKey) {
  const solanaConnection = getConnection();
  const info = await solanaConnection.getParsedAccountInfo(tokenAddress);

  const accountData = info.value?.data;

  if (accountData && 'parsed' in accountData) {
    const decimals = accountData.parsed.info?.decimals;

    if (decimals !== undefined) {
      return decimals;
    }
  }

  throw new Error(`${tokenAddress.toBase58()}: Can't find token info`);
}
