import * as anchor from '@coral-xyz/anchor';
import {
  PublicKey,
  Transaction,
  Keypair,
  Signer,
  VersionedTransaction,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import fetch from 'cross-fetch';
import {BlockHash} from '../types';

export async function getSignedLimitTransaction(
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
