import * as anchor from '@coral-xyz/anchor';
import {v4 as uuidv4} from 'uuid';
import {
  TransactionMessage,
  PublicKey,
  Signer,
  ComputeBudgetProgram,
  SystemProgram,
} from '@solana/web3.js';
import {
  Account,
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  createInitializeAccountInstruction,
  getAssociatedTokenAddressSync,
  NATIVE_MINT,
  NATIVE_MINT_2022,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {get_swap_base_input_transaction} from '../../utils';
import BigNumber from 'bignumber.js';
import {
  ataRentExcemption,
  EXCHANGE_FEE,
  raydiumCpmmPoolCache,
  recentBlockhash,
} from '../..';
import {exchangeSolWallet} from '../../services';

// ! we only support pools that one side of them are WSOL:
// ! in buy: WSOL -> TOKEN
// ! in sell: TOKEN -> WSOL
// TODO check for token program 2022
export async function getSwapTransactionCpmm(
  poolAddress: PublicKey,
  inputTokenMint: PublicKey,
  outputTokenMint: PublicKey,
  payer: Signer,
  amountIn: string,
  estimatedAmountOut: string,
  tokenPriceUsd: string,
  slippage: number,
  direction: 'buy' | 'sell',
  priorityFee: number
) {
  // -------------------- Retrieves pool info from the raydiumCpmmPoolCache --------------------- //
  const poolData = await raydiumCpmmPoolCache.get(poolAddress.toBase58());
  // -------------------------------------------- END ------------------------------------------- //
  // ------------------------------ Check pool activation status -------------------------------- //
  // TODO test following
  const runTimestamp = Math.floor(new Date().getTime() / 1000);
  if (poolData.openTime.gt(new anchor.BN(runTimestamp)))
    throw new Error('Pool open time has not reached.');
  if (poolData.status === 4) throw new Error('Pool status is swap disabled.');
  // -------------------------------------------- END ------------------------------------------- //
  // --------- Determine input/output accounts based on order direction (`buy`, `sell`) --------- //
  let inputDecimalPoints, outputDecimalPoints: number;
  let inputVault, outputVault: Account;
  let inputTokenProgram, outputTokenProgram: PublicKey;
  if (
    inputTokenMint.toBase58() === poolData.token0Mint.toBase58() &&
    outputTokenMint.toBase58() === poolData.token1Mint.toBase58()
  ) {
    inputDecimalPoints = poolData.mint0Decimals;
    outputDecimalPoints = poolData.mint1Decimals;
    inputVault = poolData.vault0Account;
    inputTokenProgram = poolData.token0Program;
    outputVault = poolData.vault1Account;
    outputTokenProgram = poolData.token1Program;
  } else if (
    inputTokenMint.toBase58() === poolData.token1Mint.toBase58() &&
    outputTokenMint.toBase58() === poolData.token0Mint.toBase58()
  ) {
    inputDecimalPoints = poolData.mint1Decimals;
    outputDecimalPoints = poolData.mint0Decimals;
    inputVault = poolData.vault1Account;
    inputTokenProgram = poolData.token1Program;
    outputVault = poolData.vault0Account;
    outputTokenProgram = poolData.token0Program;
  } else {
    throw new Error(
      'Address of the provided input/output token mints are incorrect.'
    );
  }
  // -------------------------------------------- END ------------------------------------------- //
  // ----------- Scale the UI input/output amount according to mint's decimal points ------------ //
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
  const wsolTokenProgram =
    direction === 'buy' ? inputTokenProgram : outputTokenProgram;
  const wsolMint =
    wsolTokenProgram.toBase58() === TOKEN_PROGRAM_ID.toBase58()
      ? NATIVE_MINT
      : NATIVE_MINT_2022; // TODO test: Currently doesn't have any transactions
  const wsolATA = await PublicKey.createWithSeed(
    payer.publicKey,
    seed,
    wsolTokenProgram
  );
  // computes the associated token account for input mint
  const inputATA = getAssociatedTokenAddressSync(
    inputTokenMint,
    payer.publicKey,
    false,
    inputTokenProgram
  );
  // computes the associated token account for output mint
  const outputATA = getAssociatedTokenAddressSync(
    outputTokenMint,
    payer.publicKey,
    false,
    outputTokenProgram
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
  const swapTx = await get_swap_base_input_transaction(
    poolAddress,
    poolData,
    direction === 'buy' ? wsolATA : inputATA,
    inputVault,
    inputTokenMint,
    inputTokenProgram,
    direction === 'sell' ? wsolATA : outputATA,
    outputVault,
    outputTokenMint,
    outputTokenProgram,
    payer,
    new anchor.BN(rawInAmount.toString()),
    minAmountOut
  );
  // ----------------------------------------- END ---------------------------------------- //

  // create transaction msg
  const message = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: recentBlockhash.blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 12_000_000,
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
        space: 165, // Size for a token account // TODO check
        programId: wsolTokenProgram,
      }),
      createInitializeAccountInstruction(
        wsolATA,
        wsolMint, // Wrapped SOL mint
        payer.publicKey,
        wsolTokenProgram
      ),
      ...(direction === 'buy'
        ? [
            createAssociatedTokenAccountIdempotentInstruction(
              payer.publicKey,
              outputATA,
              payer.publicKey,
              outputTokenMint,
              outputTokenProgram
            ),
          ]
        : []),
      ...swapTx.instructions,
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
