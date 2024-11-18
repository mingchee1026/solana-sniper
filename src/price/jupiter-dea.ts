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
  createJupiterApiClient,
  DefaultApi,
  ResponseError,
  QuoteGetRequest,
  QuoteResponse,
} from '@jup-ag/api';
import BigNumber from 'bignumber.js';
import {getConnection} from '../services';

/**
 * Compute the output amount for a swap using a Jupiter aggregator.
 *
 * This function get the amount of output token (outputToken) that can be obtained by swapping
 * a specified amount of input token (inputToken)using a Jupiter aggregator.
 *
 * Note: We only support pairs that one side of them are WSOL:
 * in buy: WSOL -> TOKEN
 * in sell: TOKEN -> WSOL
 *
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
  inputTokenMint: string,
  outputTokenMint: string,
  amountIn: string
) {
  // Check if input amount is bigger than zero
  if (new BigNumber(amountIn).isZero()) {
    throw new Error("Empty balance, can't buy/sell");
  }

  const solanaConnection = getConnection();
  const jupiterApi = createJupiterApiClient();

  const quoteRequest: QuoteGetRequest = {
    inputMint: inputTokenMint,
    outputMint: outputTokenMint,
    amount: Number(amountIn),
    autoSlippage: true,
  };

  let quote: QuoteResponse | null;
  try {
    quote = await jupiterApi.quoteGet(quoteRequest);
    if (!quote || !quote.routePlan) {
      throw new Error('No quote found');
    }
  } catch (error) {
    if (error instanceof ResponseError) {
      console.log(await error.response.json());
    } else {
      console.error(error);
    }
    throw new Error('Unable to find quote');
  }

  // scale the input amount to get the raw amount
  const inputDecimalPoints = await getTokenDecimals(
    solanaConnection,
    new PublicKey(inputTokenMint)
  );
  const outputDecimalPoints = await getTokenDecimals(
    solanaConnection,
    new PublicKey(outputTokenMint)
  );

  const rawAmount = new BigNumber(amountIn)
    .multipliedBy(new BigNumber(10).pow(inputDecimalPoints))
    .toFixed(0, BigNumber.ROUND_DOWN);

  return {
    out: quote.outAmount,
    priceImpact: quote.priceImpactPct,
    inputDecimalPoints,
    outputDecimalPoints,
  };
}

async function getTokenDecimals(
  solanaConnection: Connection,
  tokenAddress: PublicKey
) {
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
