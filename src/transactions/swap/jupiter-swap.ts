import * as anchor from '@coral-xyz/anchor';
import {v4 as uuidv4} from 'uuid';
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
  Instruction,
  AccountMeta,
} from '@jup-ag/api';
import BigNumber from 'bignumber.js';
import {ataRentExcemption, EXCHANGE_FEE, recentBlockhash} from '../..';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  createInitializeAccountInstruction,
  getAssociatedTokenAddressSync,
  NATIVE_MINT,
  NATIVE_MINT_2022,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {exchangeSolWallet, getConnection} from '../../services';

const solanaConnection = getConnection();

export async function getSwapTransactionByJupiter(
  metisEndpoint: string,
  payer: Signer,
  inputTokenMint: PublicKey,
  outputTokenMint: PublicKey,
  amountIn: string,
  estimatedAmountOut: string,
  tokenPriceUsd: string,
  slippage: number,
  direction: 'buy' | 'sell'
) {
  try {
    // Check if input amount is bigger than zero
    if (new BigNumber(amountIn).isZero()) {
      throw new Error(
        `${payer.publicKey.toBase58()}: Empty balance, can't buy/sell`
      );
    }

    if (
      (direction === 'buy' &&
        inputTokenMint.toBase58() !== NATIVE_MINT.toBase58() &&
        inputTokenMint.toBase58() !== NATIVE_MINT_2022.toBase58()) ||
      (direction === 'sell' &&
        outputTokenMint.toBase58() !== NATIVE_MINT.toBase58() &&
        outputTokenMint.toBase58() !== NATIVE_MINT_2022.toBase58())
    ) {
      throw new Error(
        'One side should be WSOL. In buy input and in sell output.'
      );
    }

    // scale the input amount to get the raw amount
    const inputDecimalPoints = await getTokenDecimals(inputTokenMint);
    const outputDecimalPoints = await getTokenDecimals(outputTokenMint);

    const inAmountInUsd = new BigNumber(amountIn).multipliedBy(tokenPriceUsd);

    const rawInAmount = new BigNumber(amountIn).multipliedBy(
      new BigNumber(10).pow(inputDecimalPoints)
    );

    const rawOutAmount = new BigNumber(estimatedAmountOut).multipliedBy(
      new BigNumber(10).pow(outputDecimalPoints)
    );

    const minAmountOut = new anchor.BN(rawOutAmount.toString())
      .mul(new anchor.BN(10000 - slippage))
      .div(new anchor.BN(10000));

    // get associated token addresses
    const seed = uuidv4().replace(/-/g, '');
    const wsolATA = await PublicKey.createWithSeed(
      payer.publicKey,
      seed,
      TOKEN_PROGRAM_ID
    );
    const inputATA = getAssociatedTokenAddressSync(
      inputTokenMint,
      payer.publicKey,
      false,
      TOKEN_PROGRAM_ID
    );
    const outputATA = getAssociatedTokenAddressSync(
      outputTokenMint,
      payer.publicKey,
      false,
      TOKEN_PROGRAM_ID
    );

    // calculate out fee
    const ourFeeInLamports = BigInt(
      (direction === 'buy'
        ? rawInAmount
        : new BigNumber(minAmountOut.toString())
      )
        .multipliedBy(EXCHANGE_FEE)
        .toFixed(0, BigNumber.ROUND_DOWN)
    );

    const jupiterApi = createJupiterApiClient(); //{basePath: metisEndpoint});

    const quoteRequest: QuoteGetRequest = {
      inputMint: inputTokenMint.toBase58(),
      outputMint: outputTokenMint.toBase58(),
      amount: Number(amountIn),
      slippageBps: slippage,
    };

    const quote = await getQuote(jupiterApi, quoteRequest);
    const {ixs: swapInstructions, altAccounts: lookupTable} =
      await getSwapInstructions(jupiterApi, quote, payer.publicKey);

    const message = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: recentBlockhash.blockhash,
      instructions: [
        // ComputeBudgetProgram.setComputeUnitPrice({
        //   microLamports: 12_000_000,
        // }),
        // ComputeBudgetProgram.setComputeUnitLimit({
        //   units: 80000, // TODO
        // }),

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
        ...swapInstructions,
        createCloseAccountInstruction(
          wsolATA,
          payer.publicKey,
          payer.publicKey
        ),
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: exchangeSolWallet,
          lamports: ourFeeInLamports,
        }),
      ],
    });

    const transaction = new VersionedTransaction(
      message.compileToV0Message(lookupTable)
    );
    transaction.sign([payer]);

    return {
      message,
      inputATA,
      outputATA,
      rawInAmount,
      inAmountInUsd,
      ourFeeInLamports,
    };
  } catch (error) {
    console.error('Error getting quote:', error);
  }
}

async function getQuote(
  jupiterApi: any,
  quoteRequest: QuoteGetRequest
): Promise<QuoteResponse> {
  try {
    const quote: QuoteResponse | null = await jupiterApi.quoteGet(quoteRequest);
    if (!quote || !quote.routePlan) {
      throw new Error('No quote found');
    }
    return quote;
  } catch (error) {
    if (error instanceof ResponseError) {
      console.log(await error.response.json());
    } else {
      console.error(error);
    }
    throw new Error('Unable to find quote');
  }
}

async function getSwapInstructions(
  jupiterApi: any,
  route: QuoteResponse,
  payer: PublicKey
) {
  try {
    const {
      computeBudgetInstructions,
      setupInstructions,
      swapInstruction,
      cleanupInstruction,
      addressLookupTableAddresses,
    } = await jupiterApi.swapInstructionsPost({
      swapRequest: {
        quoteResponse: route,
        userPublicKey: payer.toBase58(),
        prioritizationFeeLamports: 'auto',
      },
    });

    const instructions: TransactionInstruction[] = [
      ...computeBudgetInstructions.map(instructionDataToTransactionInstruction),
      ...setupInstructions.map(instructionDataToTransactionInstruction),
      instructionDataToTransactionInstruction(swapInstruction),
      instructionDataToTransactionInstruction(cleanupInstruction),
    ].filter(ix => ix !== null) as TransactionInstruction[];

    const addressLookupTableAccounts = await getAdressLookupTableAccounts(
      addressLookupTableAddresses,
      solanaConnection
    );

    // const {blockhash, lastValidBlockHeight} =
    //   await solanaConnection.getLatestBlockhash();

    // const messageV0 = new TransactionMessage({
    //   payerKey: payer,
    //   recentBlockhash: blockhash,
    //   instructions,
    // }).compileToV0Message(addressLookupTableAccounts);

    // const transaction = new VersionedTransaction(messageV0);
    // return transaction;
    return {ixs: instructions, altAccounts: addressLookupTableAccounts};
  } catch (error) {
    if (error instanceof ResponseError) {
      console.log(await error.response.json());
    } else {
      console.error(error);
    }
    throw new Error('Unable to find quote');
  }
}

function instructionDataToTransactionInstruction(
  instruction: Instruction | undefined
) {
  if (instruction === null || instruction === undefined) return null;
  return new TransactionInstruction({
    programId: new PublicKey(instruction.programId),
    keys: instruction.accounts.map((key: AccountMeta) => ({
      pubkey: new PublicKey(key.pubkey),
      isSigner: key.isSigner,
      isWritable: key.isWritable,
    })),
    data: Buffer.from(instruction.data, 'base64'),
  });
}

async function getAdressLookupTableAccounts(
  keys: string[],
  connection: Connection
): Promise<AddressLookupTableAccount[]> {
  const addressLookupTableAccountInfos =
    await connection.getMultipleAccountsInfo(
      keys.map(key => new PublicKey(key))
    );

  return addressLookupTableAccountInfos.reduce((acc, accountInfo, index) => {
    const addressLookupTableAddress = keys[index];
    if (accountInfo) {
      const addressLookupTableAccount = new AddressLookupTableAccount({
        key: new PublicKey(addressLookupTableAddress),
        state: AddressLookupTableAccount.deserialize(accountInfo.data),
      });
      acc.push(addressLookupTableAccount);
    }

    return acc;
  }, new Array<AddressLookupTableAccount>());
}

async function getTokenDecimals(tokenAddress: PublicKey) {
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
