import * as anchor from '@coral-xyz/anchor';
import Decimal from 'decimal.js';
import {RaydiumCpmmConfig, RaydiumCpmmPoolInfo} from '../types';
import BigNumber from 'bignumber.js';
import {raydiumCpmmConfigCache, raydiumCpmmPoolCache} from '..';
import {CurveCalculator} from '@raydium-io/raydium-sdk-v2';

// TODO check for token program 2022
/**
 * Compute the output amount for a swap in a Raydium CPMM pool.
 *
 * This function calculates the amount of output token (outputToken) obtainable by swapping
 * a specified amount of input token (inputToken) in a Raydium pool. The function supports
 *
 * Note: We only support pools that one side of them are WSOL:
 * in buy: WSOL -> TOKEN
 * in sell: TOKEN -> WSOL
 *
 * @param {string} poolAddress - The address of the Raydium pool.
 * @param {string} inputTokenMint - The mint address of the input token.
 * @param {string} outputTokenMint - The mint address of the output token.
 * @param {string} amount - The amount of input token as a string. The amount should be cosidered by its decimals points for example for 100000000 lamports you should pass 0.1 SOL as input.
 * @returns {Promise<{ out: anchor.BN, priceImpact: number | null, inputDecimalPoints: number, outputDecimalPoints: number }>} -
 * An object containing the output token amount, potential price impact, and decimal points for input and output tokens.
 *
 * @throws {Error} - Throws an error if the input amount is zero, if the token mint addresses do not match the pool,
 * or if the pool is not open or swap is disabled.
 */
export async function computeAmountOut(
  poolAddress: string,
  inputTokenMint: string,
  outputTokenMint: string,
  amount: string
) {
  if (new BigNumber(amount).isZero()) {
    throw new Error(`Empty balance, can't buy/sell`);
  }

  // get pool info
  const poolData: RaydiumCpmmPoolInfo =
    await raydiumCpmmPoolCache.get(poolAddress);
  const ammConfigData: RaydiumCpmmConfig = await raydiumCpmmConfigCache.get(
    poolData.ammConfig.toBase58()
  );

  // TODO test following
  const runTimestamp = Math.floor(new Date().getTime() / 1000);
  if (poolData.openTime.gt(new anchor.BN(runTimestamp)))
    throw new Error('Pool open time has not reached.');
  if (poolData.status === 4) throw new Error('Pool status is swap disabled.');

  // scale the input amount to get the raw amount
  // getting swap direction
  let inputDecimalPoints, outputDecimalPoints: number;
  if (
    inputTokenMint === poolData.token0Mint.toBase58() &&
    outputTokenMint === poolData.token1Mint.toBase58()
  ) {
    inputDecimalPoints = poolData.mint0Decimals;
    outputDecimalPoints = poolData.mint1Decimals;
  } else if (
    inputTokenMint === poolData.token1Mint.toBase58() &&
    outputTokenMint === poolData.token0Mint.toBase58()
  ) {
    inputDecimalPoints = poolData.mint1Decimals;
    outputDecimalPoints = poolData.mint0Decimals;
  } else {
    throw new Error(
      'Address of the provided input/output token mints are incorrect.'
    );
  }
  const rawAmount = new BigNumber(amount)
    .multipliedBy(new BigNumber(10).pow(inputDecimalPoints))
    .toFixed(0, BigNumber.ROUND_DOWN);

  // calculate minimum output
  const isZeroForOne = outputTokenMint === poolData.token1Mint.toBase58();

  const vault0AmountWithoutFees = new anchor.BN(
    poolData.vault0Account.amount.toString()
  )
    .sub(poolData.fundFeesToken0)
    .sub(poolData.protocolFeesToken0);
  const vault1AmountWithoutFees = new anchor.BN(
    poolData.vault1Account.amount.toString()
  )
    .sub(poolData.fundFeesToken1)
    .sub(poolData.protocolFeesToken1);

  const swapResult = CurveCalculator.swap(
    new anchor.BN(rawAmount), // TODO bug for token 2022 transfer fee
    isZeroForOne ? vault0AmountWithoutFees : vault1AmountWithoutFees,
    isZeroForOne ? vault1AmountWithoutFees : vault0AmountWithoutFees,
    ammConfigData.tradeFeeRate
  );

  // const minAmountOut = swapResult.destinationAmountSwapped
  //   .mul(new anchor.BN(10000 - slippage))
  //   .div(new anchor.BN(10000));

  // console.log('Vault 0 reserve: ', vault0AmountWithoutFees.toString());
  // console.log('Vault 1 reserve: ', vault1AmountWithoutFees.toString());
  // console.log('Input amount: ', rawAmount);
  // console.log(
  //   'Estimated output amount: ',
  //   swapResult.destinationAmountSwapped.toString()
  // );
  // console.log('Minimum expected output amount: ', minAmountOut.toString());

  // const executionPrice = new Decimal(
  //   swapResult.destinationAmountSwapped.toString()
  // ).div(swapResult.sourceAmountSwapped.toString());

  // const poolPrice = new Decimal(quoteReserve.toString())
  //   .div(new Decimal(10).pow(info.mintDecimalB))
  //   .div(
  //     new Decimal(baseReserve.toString()).div(
  //       new Decimal(10).pow(info.mintDecimalA)
  //     )
  //   );

  return {
    out: swapResult.destinationAmountSwapped,
    // priceImpact: poolPrice.sub(executionPrice).div(poolPrice),
    priceImpact: null,
    inputDecimalPoints,
    outputDecimalPoints,
  }; // TODO price impact
}
