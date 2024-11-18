import {Program, BN} from '@coral-xyz/anchor';
import {PublicKey, Signer} from '@solana/web3.js';
import {Account, getAssociatedTokenAddressSync} from '@solana/spl-token';
import {CurveCalculator} from '@raydium-io/raydium-sdk-v2';
import {RaydiumCpSwap} from '../types/raydium_cp_swap';
import {getAuthAddress} from './index';
import {RaydiumCpmmConfig, RaydiumCpmmPoolInfo} from '../types';
import {cpmmProgram} from '..';

export async function get_swap_base_input_transaction(
  poolAddress: PublicKey,
  poolData: RaydiumCpmmPoolInfo,
  inputTokenAccount: PublicKey,
  inputVaultAccount: Account,
  inputTokenMint: PublicKey,
  inputTokenProgram: PublicKey,
  outputTokenAccount: PublicKey,
  outputVaultAccount: Account,
  outputTokenMint: PublicKey,
  outputTokenProgram: PublicKey,
  owner: Signer,
  amountIn: BN,
  minAmountOut: BN
) {
  const [auth] = getAuthAddress(cpmmProgram.programId);

  const tx = cpmmProgram.methods
    .swapBaseInput(amountIn, minAmountOut)
    .accounts({
      payer: owner.publicKey,
      authority: auth,
      ammConfig: poolData.ammConfig,
      poolState: poolAddress,
      inputTokenAccount,
      outputTokenAccount,
      inputVault: inputVaultAccount.address,
      outputVault: outputVaultAccount.address,
      inputTokenProgram,
      outputTokenProgram,
      inputTokenMint,
      outputTokenMint,
      observationState: poolData.observationKey,
    })
    .transaction();

  return tx;
}
