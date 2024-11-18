import {Connection, PublicKey} from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import {wallet} from './wallet';
import {IDL as CPMM, RaydiumCpSwap} from '../types/raydium_cp_swap';
import {IDL as AMM, RaydiumAmm} from '../types/raydium_amm';

const opts = {
  preflightCommitment: 'processed' as anchor.web3.Commitment,
};

// RPC Network
const networkRPC = process.env.MAINNET_CLUSTER_HTTPS || '';
const networkWS = process.env.MAINNET_CLUSTER_WSS || '';

const stakedNetworkRPC = process.env.MAINNET_STAKED_CLUSTER_HTTPS || '';
const stakedNetworkWS = process.env.MAINNET_STAKED_CLUSTER_WSS || '';

export function getStakedConnection() {
  return new Connection(stakedNetworkRPC, {
    wsEndpoint: stakedNetworkWS,
  });
}

export function getConnection() {
  return new Connection(networkRPC, {
    wsEndpoint: networkWS,
    disableRetryOnRateLimit: false,
  });
}

export const RAYDIUM_CPMM_PROGRAM_ID = new PublicKey(
  'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C'
);
export const RAYDIUM_AMM_PROGRAM_ID = new PublicKey(
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'
);

export function raydiumAmmProgram(): anchor.Program<RaydiumAmm> {
  const provider = new anchor.AnchorProvider(getConnection(), wallet, opts); // TODO change wallet
  return new anchor.Program(AMM, RAYDIUM_AMM_PROGRAM_ID, provider);
}

export function raydiumCpmmProgram(): anchor.Program<RaydiumCpSwap> {
  const provider = new anchor.AnchorProvider(getConnection(), wallet, opts); // TODO change wallet
  return new anchor.Program<RaydiumCpSwap>(
    CPMM,
    RAYDIUM_CPMM_PROGRAM_ID,
    provider
  );
}
