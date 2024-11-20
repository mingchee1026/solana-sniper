import * as cpmm from './raydium-cpmm';
import * as amm from './raydium-amm';
import * as jup from './jupiter-dea';

/**
 * Compute the output amount for a swap operation on a specified DEX (Decentralized Exchange).
 *
 * This function calculates the amount of output token (outputToken) that can be obtained by swapping
 * a specified amount of input token (inputToken) in a given pool.
 * This function determines which DEX (either Raydium AMM or Raydium CPMM) to use based on the provided
 * parameters and then calls the appropriate function to calculate the amount of output token that
 * can be acquired by swapping a specified amount of input token.
 *
 * @param {string} dex - The DEX type to use (currently 'raydium_amm' or 'raydium_cpmm').
 * @param {string} poolAddress - The address of the pool on the selected DEX.
 * @param {string} inputTokenMint - The mint address of the input token.
 * @param {string} outputTokenMint - The mint address of the output token.
 * @param {string} amountIn - The amount of input token as a string. The amount should be cosidered by its decimals points for example for 100000000 lamports you should pass 0.1 SOL as input.
 * @returns {Promise<{ out: string, priceImpact: string, inputDecimalPoints: number, outputDecimalPoints: number }>}
 *
 * @throws {Error} - Throws an error if the specified DEX is not supported.
 */
export async function computeAmountOut(
  dex: string,
  poolAddress: string,
  inputTokenMint: string,
  outputTokenMint: string,
  amountIn: string
) {
  switch (dex) {
    case 'raydium_amm':
      return amm.computeAmountOut(
        poolAddress,
        inputTokenMint,
        outputTokenMint,
        amountIn
      );
    case 'raydium_cpmm':
      return cpmm.computeAmountOut(
        poolAddress,
        inputTokenMint,
        outputTokenMint,
        amountIn
      );
    default:
      return await jup.computeAmountOut(
        inputTokenMint,
        outputTokenMint,
        amountIn
      );
  }
}
