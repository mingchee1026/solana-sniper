import * as anchor from '@coral-xyz/anchor';
import {
  PublicKey,
  Transaction,
  Keypair,
  Signer,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import fetch from 'cross-fetch';
import BigNumber from 'bignumber.js';
import {BlockHash} from '../types';
import {getConnection, exchangeSolWallet} from '../services';
import {recentBlockhash, EXCHANGE_FEE} from '..';

export async function createLimitTransaction(
  payer: Signer,
  inputMint: PublicKey,
  outputMint: PublicKey,
  inAmount: bigint,
  outAmount: bigint,
  startAt: bigint | null,
  orderDirection: 'buy' | 'sell',
  tokenPriceUsd: string,
  computeUnitPrice: number
) {
  if (inAmount === BigInt(0)) {
    throw new Error(`${payer.publicKey.toBase58()}: Empty balance, can't sell`);
  }

  // Get DCA transactions and pubkey
  const {limitTransaction, order} = await getSignedLimitTransactionV2(
    payer,
    inputMint,
    outputMint,
    inAmount,
    outAmount,
    computeUnitPrice
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
      ...limitTransaction,
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
    order,
    message,
    inputATA,
    outputATA,
    rawInAmount,
    inAmountInUsd,
    ourFeeInLamports,
  };
}

async function getSignedLimitTransactionV1(
  payer: Signer,
  inputMint: PublicKey,
  outputMint: PublicKey,
  inAmount: anchor.BN,
  outAmount: anchor.BN,
  recentBlockhash: BlockHash,
  computeUnitPrice: number
) {
  if (inAmount.isZero()) {
    throw new Error(`${payer.publicKey.toBase58()}: Empty balance, can't sell`);
  }

  // Base key are used to generate a unique order id
  const base = Keypair.generate();

  // get serialized transactions
  const {tx} = await (
    await fetch('https://jup.ag/api/limit/v1/createOrder', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        owner: payer.publicKey.toString(),
        inAmount: inAmount.toString(),
        outAmount: outAmount.toString(),
        inputMint: inputMint.toString(),
        outputMint: outputMint.toString(),
        expiredAt: null, // new Date().valueOf() / 1000,
        base: base.publicKey.toString(),
      }),
    })
  ).json();

  // deserialize the transaction
  const transactionBuf = Buffer.from(tx, 'base64');
  var transaction = Transaction.from(transactionBuf);

  // create priority fee instruction
  const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: computeUnitPrice,
  });
  transaction.instructions = [addPriorityFee, ...transaction.instructions];

  // set recent blockhash
  transaction.recentBlockhash = recentBlockhash.blockhash;

  // Sign the transaction
  const v0Transaction = new VersionedTransaction(transaction.compileMessage());
  v0Transaction.sign([payer, base]);

  return v0Transaction;
}

async function getSignedLimitTransactionV2(
  payer: Signer,
  inputMint: PublicKey,
  outputMint: PublicKey,
  inAmount: bigint,
  outAmount: bigint,
  computeUnitPrice: number
) {
  if (inAmount === BigInt(0)) {
    throw new Error(`${payer.publicKey.toBase58()}: Empty balance, can't sell`);
  }

  // Base key are used to generate a unique order id
  const base = Keypair.generate();

  // get serialized transactions
  const {order, tx} = await (
    await fetch('https://api.jup.ag/limit/v2/createOrder', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        maker: payer.publicKey.toBase58(),
        payer: payer.publicKey.toBase58(),
        inputMint: inputMint.toString(),
        outputMint: outputMint.toString(),
        params: {
          makingAmount: inAmount.toString(),
          takingAmount: outAmount.toString(),
          expiredAt: null, // new Date().valueOf() / 1000,
        },
      }),
    })
  ).json();

  // deserialize the transaction
  const transactionBuf = Buffer.from(tx, 'base64');
  var transaction = Transaction.from(transactionBuf);

  // // create priority fee instruction
  // const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
  //   microLamports: computeUnitPrice,
  // });
  // transaction.instructions = [addPriorityFee, ...transaction.instructions];

  return {limitTransaction: transaction.instructions, order};

  // // set recent blockhash
  // transaction.recentBlockhash = recentBlockhash.blockhash;

  // // Sign the transaction
  // const v0Transaction = new VersionedTransaction(transaction.compileMessage());
  // v0Transaction.sign([payer, base]);

  // return v0Transaction;
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
