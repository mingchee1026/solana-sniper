import {Keypair, PublicKey} from '@solana/web3.js';
import {raydiumPoolCache} from '../..';
import {getSwapTransactionV4} from './amm-swap';
import {getSwapTransactionCpmm} from './cpmm-swap';
import {getSwapTransactionByJupiter} from './jupiter-swap';
import BigNumber from 'bignumber.js';
import {NATIVE_MINT, NATIVE_MINT_2022} from '@solana/spl-token';

export const createSwapTransaction = async (
  poolAddress: string,
  keypair: Keypair,
  inputMint: string,
  outputMint: string,
  inputAmount: string,
  estimatedOutput: string,
  tokenPriceUsd: string,
  slippage: number,
  orderDirection: 'buy' | 'sell',
  priorityFee: number
) => {
  // Check if input amount is bigger than zero
  if (new BigNumber(inputAmount).isZero()) {
    throw new Error(`Empty balance, can't buy/sell`);
  }
  // ------ Check if WSOL is present in swap, as input for buys or output for sells ------- //
  if (
    (orderDirection === 'buy' &&
      new PublicKey(inputMint).toBase58() !== NATIVE_MINT.toBase58() &&
      new PublicKey(inputMint).toBase58() !== NATIVE_MINT_2022.toBase58()) ||
    (orderDirection === 'sell' &&
      new PublicKey(outputMint).toBase58() !== NATIVE_MINT.toBase58() &&
      new PublicKey(outputMint).toBase58() !== NATIVE_MINT_2022.toBase58())
  ) {
    throw new Error(
      'One side should be WSOL. In buy input and in sell output.'
    );
  }
  // ----------------------------------------- END ---------------------------------------- //

  const raydiumPoolInfo = await raydiumPoolCache.get(poolAddress);
  if (raydiumPoolInfo.version === 4 || raydiumPoolInfo.version === 5) {
    console.time('Raydium AMM tx creation');
    const transactionDetails = await getSwapTransactionV4(
      poolAddress,
      keypair,
      new PublicKey(inputMint),
      new PublicKey(outputMint),
      inputAmount,
      estimatedOutput,
      tokenPriceUsd,
      slippage,
      orderDirection
    );
    console.timeEnd('Raydium AMM tx creation');

    return transactionDetails;
  } else if (raydiumPoolInfo.version === 7) {
    console.time('Raydium CPMM tx creation');
    // todo toye simulate skip kon blockhash ro?
    const transactionDetails = await getSwapTransactionCpmm(
      new PublicKey(poolAddress),
      new PublicKey(inputMint),
      new PublicKey(outputMint),
      keypair,
      inputAmount,
      estimatedOutput,
      tokenPriceUsd,
      slippage,
      orderDirection,
      priorityFee
    );
    console.timeEnd('Raydium CPMM tx creation');

    return transactionDetails;
  } else {
    console.time('Jupiter AMM tx creation');
    const transactionDetails = await getSwapTransactionByJupiter(
      'https://quote-api.jup.ag/v6',
      keypair,
      new PublicKey(inputMint),
      new PublicKey(outputMint),
      inputAmount,
      estimatedOutput,
      tokenPriceUsd,
      slippage,
      orderDirection
    );
    console.timeEnd('Jupiter AMM tx creation');

    if (!transactionDetails) {
      throw new Error('Can not get Jupiter transaction.');
    }

    return transactionDetails;
  }
  throw new Error('Unsupported version for pool.');
};
