import * as anchor from '@coral-xyz/anchor';
import BigNumber from 'bignumber.js';
import {raydium, raydiumPoolCache} from '..';

/**
 * Compute the output amount for a swap in a Raydium pool AMM V4.
 *
 * This function calculates the amount of output token (outputToken) that can be obtained by swapping
 * a specified amount of input token (inputToken) in a given pool.
 *
 * Note: We only support pools that one side of them are WSOL:
 * in buy: WSOL -> TOKEN
 * in sell: TOKEN -> WSOL
 *
 * @param {string} poolAddress - The address of the Raydium pool.
 * @param {string} inputTokenMint - The mint address of the input token.
 * @param {string} outputTokenMint - The mint address of the output token.
 * @param {string} amountIn - The amount of input token as a string. The amount should be cosidered by its decimals points for example for 100000000 lamports you should pass 0.1 SOL as input.
 * @returns {Promise<{ out: string, priceImpact: string, inputDecimalPoints: number, outputDecimalPoints: number }>} -
 * An object containing the output token amount, price impact, and decimal points for input and output tokens.
 *
 * @throws {Error} - Throws an error if the input amount is zero, if the token mint addresses do not match the pool,
 * or if the pool is not open or swap is disabled.
 */
export async function computeAmountOut(
  poolAddress: string,
  inputTokenMint: string,
  outputTokenMint: string,
  amountIn: string
) {
  const poolKeys = await raydiumPoolCache.get(poolAddress);

  // Check if input amount is bigger than zero
  if (new BigNumber(amountIn).isZero()) {
    throw new Error("Empty balance, can't buy/sell");
  }

  // scale the input amount to get the raw amount
  // getting swap direction
  let inputDecimalPoints, outputDecimalPoints: number;
  if (
    inputTokenMint === poolKeys.mintA.address &&
    outputTokenMint === poolKeys.mintB.address
  ) {
    inputDecimalPoints = poolKeys.mintA.decimals;
    outputDecimalPoints = poolKeys.mintB.decimals;
  } else if (
    inputTokenMint === poolKeys.mintB.address &&
    outputTokenMint === poolKeys.mintA.address
  ) {
    inputDecimalPoints = poolKeys.mintB.decimals;
    outputDecimalPoints = poolKeys.mintA.decimals;
  } else {
    throw new Error(
      'Address of the provided input/output token mints are incorrect.'
    );
  }
  const rawAmount = new BigNumber(amountIn)
    .multipliedBy(new BigNumber(10).pow(inputDecimalPoints))
    .toFixed(0, BigNumber.ROUND_DOWN);

  // get Raydium vault reserves to compute min amount out
  const rpcData = await raydium.liquidity.getRpcPoolInfo(poolKeys.id);

  // check if pool is active and available
  const runTimestamp = Math.floor(new Date().getTime() / 1000);
  if (rpcData.poolOpenTime.gt(new anchor.BN(runTimestamp)))
    throw new Error('Pool open time has not reached.');
  if (rpcData.status.toString() !== '6')
    throw new Error('Pool status is swap disabled.');

  // compute min amount out
  const out = raydium.liquidity.computeAmountOut({
    // todo this contains fee
    poolInfo: {
      ...poolKeys,
      baseReserve: rpcData.baseReserve,
      quoteReserve: rpcData.quoteReserve,
    } as any,
    amountIn: new anchor.BN(rawAmount),
    mintIn: inputTokenMint,
    mintOut: outputTokenMint,
    slippage: 0, // range: 1 ~ 0.0001, means 100% ~ 0.01%
  });

  return {
    out: out.amountOut,
    priceImpact: out.priceImpact,
    inputDecimalPoints,
    outputDecimalPoints,
  };
}
