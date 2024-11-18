import * as anchor from '@coral-xyz/anchor';
import {v4 as uuidv4} from 'uuid';
import {makeAMMSwapInstruction} from '@raydium-io/raydium-sdk-v2';
import {
  ComputeBudgetProgram,
  PublicKey,
  Signer,
  SystemProgram,
  TransactionMessage,
} from '@solana/web3.js';
import BigNumber from 'bignumber.js';
import {
  ataRentExcemption,
  EXCHANGE_FEE,
  raydiumPoolCache,
  recentBlockhash,
} from '../..';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  createInitializeAccountInstruction,
  getAssociatedTokenAddressSync,
  NATIVE_MINT,
  NATIVE_MINT_2022,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {exchangeSolWallet} from '../../services';

/**
 * Constructs a versioned transaction for swapping tokens using Raydium V4.
 *
 * Operations performed:
 * 1. Retrieves pool keys from the Raydium pool cache using the provided pool address.
 * 2. Scales the input/output amount from UI based on token decimals (for example 0.01 SOL gives 10000000 lamports as rawAmount which the blockchain can operate on).
 * 3. Calculates the minimum output amount considering the specified slippage.
 * 4. Creates a temporary WSOL account to hold WSOL and it will be closed at the end of tx. Having this will help us to avoid checking WSOL account existence and handles to conversion between SOL and WSOL automatically.
 * 5. Computes associated token addresses for the transaction.
 * 6. Calculates the exchange fee in lamports based on the transaction type (buy/sell) and amounts involved.
 * 7. Creates the swap instruction using the Raydium SDK with configured parameters.
 * 8. Constructs the transaction message including: setting compute budgets, creating associated token accounts if not existed, and creating and closing the WSOL token account.
 * 9. Calculates the swap value in USD, this is necessary for calculating PnL.
 *
 * @param {string} poolAddress - Address of the liquidity pool participating in the swap.
 * @param {Signer} payer - The account responsible for signing the transaction.
 * @param {PublicKey} inputTokenMint - The mint address of the input token.
 * @param {PublicKey} outputTokenMint - The mint address of the output token.
 * @param {string} amountIn - The amount of input tokens being swapped, in human-readable units (UI format).
 * @param {string} estimatedAmountOut - The estimated amount of output tokens expected from the swap, in human-readable units (UI format).
 * @param {string} tokenPriceUsd - The current price of the input token in USD.
 * @param {number} slippage - The allowed slippage percentage for the transaction in bps: 1 ~ 0.0001, means 100% ~ 0.01%.
 * @param {'buy' | 'sell'} direction - The direction of the swap ('buy' indicates swapping from SOL to a token, 'sell' from a token to SOL).
 *
 * @returns {Promise<{message: TransactionMessage;inputATA: PublicKey; outputATA: PublicKey; rawInAmount: BigNumber; inAmountInUsd: BigNumber; ourFeeInLamports: bigint;}>} Returns an object containing:
 *   - `message`: The constructed transaction message.
 *   - `inputATA`: The associated token account for the input token.
 *   - `outputATA`: The associated token account for the output token.
 *   - `rawInAmount`: The raw amount of input tokens in blockchain compatible units.
 *   - `inAmountInUsd`: The current price of the input token in USD (current value of the swap).
 *   - `ourFeeInLamports`: The calculated exchange fee in lamports.
 *
 * @throws {Error} Throws an error if WSOL is not a part of the transaction.
 */
export async function getSwapTransactionV4(
  poolAddress: string,
  payer: Signer,
  inputTokenMint: PublicKey,
  outputTokenMint: PublicKey,
  amountIn: string,
  estimatedAmountOut: string,
  tokenPriceUsd: string,
  slippage: number,
  direction: 'buy' | 'sell'
) {
  // ------------------ Retrieves pool keys from the Raydium pool cache ------------------- //
  const poolKeys = await raydiumPoolCache.get(poolAddress);
  // ----------------------------------------- END ---------------------------------------- //
  // --------- Scale the UI input/output amount according to mint's decimal points -------- //
  const [inputDecimalPoints, outputDecimalPoints] =
    inputTokenMint.toBase58() === poolKeys.mintA.address
      ? [poolKeys.mintA.decimals, poolKeys.mintB.decimals]
      : [poolKeys.mintB.decimals, poolKeys.mintA.decimals];

  const rawInAmount = new BigNumber(amountIn).multipliedBy(
    new BigNumber(10).pow(inputDecimalPoints)
  );

  const rawOutAmount = new BigNumber(estimatedAmountOut).multipliedBy(
    new BigNumber(10).pow(outputDecimalPoints)
  );
  // ----------------------------------------- END ---------------------------------------- //
  // ------------------ Calculate minimum amount out based on the slippage ---------------- //
  const minAmountOut = new anchor.BN(rawOutAmount.toString())
    .mul(new anchor.BN(10000 - slippage))
    .div(new anchor.BN(10000));
  // ----------------------------------------- END ---------------------------------------- //
  // -------------- Computes required associated token accounts for this swap ------------- //
  /**
   * Create a temporary account to hold SOL tokens until the end of transaction.
   * At the end of transaction there will be a close account instruction, so the WSOL
   * will convert into SOL automatically.
   *
   * This serves another purpose:
   * With this way we don't need to check if the user already has the WSOL token and change SOL to WSOL,
   * because in this way the conversion will be carried out automatically.
   */
  const seed = uuidv4().replace(/-/g, '');
  const wsolATA = await PublicKey.createWithSeed(
    payer.publicKey,
    seed,
    TOKEN_PROGRAM_ID
  );
  // computes the associated token account for input mint
  const inputATA = getAssociatedTokenAddressSync(
    inputTokenMint,
    payer.publicKey,
    false,
    TOKEN_PROGRAM_ID
  );
  // computes the associated token account for output mint
  const outputATA = getAssociatedTokenAddressSync(
    outputTokenMint,
    payer.publicKey,
    false,
    TOKEN_PROGRAM_ID
  );
  // ----------------------------------------- END ---------------------------------------- //
  // --------------------------------- Calculate our fee ---------------------------------- //
  /**
   * We will always receive our fees in SOL.
   * If swap is doing a `buy` we will deduct this from the SOL tokens in input
   * If swap is doing a `sell` we will deduct this from the guaranteed output (minAmountOut). Because it is sell, it tells us how much SOL will be received at minimum.
   */
  const ourFeeInLamports = BigInt(
    (direction === 'buy' ? rawInAmount : new BigNumber(minAmountOut.toString()))
      .multipliedBy(EXCHANGE_FEE)
      .toFixed(0, BigNumber.ROUND_DOWN)
  );
  // ----------------------------------------- END ---------------------------------------- //
  // ------------------------------- Create the instruction ------------------------------- //
  const ix = makeAMMSwapInstruction({
    version: 4,
    poolKeys: poolKeys as any,
    userKeys: {
      tokenAccountIn: direction === 'buy' ? wsolATA : inputATA,
      tokenAccountOut: direction === 'sell' ? wsolATA : outputATA,
      owner: payer.publicKey,
    },
    amountIn: rawInAmount.toString(),
    amountOut: minAmountOut.toString(),
    fixedSide: 'in',
  });
  // ----------------------------------------- END ---------------------------------------- //

  const message = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: recentBlockhash.blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 20_000_000,
      }),
      ComputeBudgetProgram.setComputeUnitLimit({
        units: 80000, // TODO
      }),

      // ! HANDLING SOL/WSOL TOKEN
      SystemProgram.createAccountWithSeed({
        fromPubkey: payer.publicKey,
        basePubkey: payer.publicKey,
        seed,
        newAccountPubkey: wsolATA,
        lamports: (direction === 'buy'
          ? ataRentExcemption.add(new anchor.BN(rawInAmount.toString()))
          : ataRentExcemption
        ).toString() as any,
        space: 165, // Size for a token account
        programId: TOKEN_PROGRAM_ID, // TODO check for token program 2022
      }),
      createInitializeAccountInstruction(
        wsolATA,
        NATIVE_MINT, // Wrapped SOL mint
        payer.publicKey,
        TOKEN_PROGRAM_ID // TODO check for token program 2022
      ),
      ...(direction === 'buy'
        ? [
            createAssociatedTokenAccountIdempotentInstruction(
              payer.publicKey,
              outputATA,
              payer.publicKey,
              outputTokenMint,
              TOKEN_PROGRAM_ID // TODO check for token program 2022
            ),
          ]
        : []),
      ix,
      createCloseAccountInstruction(wsolATA, payer.publicKey, payer.publicKey),
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: exchangeSolWallet,
        lamports: ourFeeInLamports,
      }),
    ],
  });

  return {
    message,
    inputATA,
    outputATA,
    rawInAmount,
    inAmountInUsd: new BigNumber(amountIn).multipliedBy(tokenPriceUsd), // value of the swap in USD
    ourFeeInLamports,
  };
}
