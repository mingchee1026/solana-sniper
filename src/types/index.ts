import {Account} from '@solana/spl-token';
import {cpmmProgram} from '..';
import {Blockhash} from '@solana/web3.js';

// Define the structure of Pool Data
export type BlockHash = Readonly<{
  blockhash: Blockhash;
  lastValidBlockHeight: number;
}>;

export type RaydiumCpmmConfig = Awaited<
  ReturnType<typeof cpmmProgram.account.ammConfig.fetch>
>;

export type RaydiumCpmmPoolState = Awaited<
  ReturnType<typeof cpmmProgram.account.poolState.fetch>
>;

export type RaydiumCpmmPoolInfo = {
  vault0Account: Account;
  vault1Account: Account;
} & RaydiumCpmmPoolState;

export type RaydiumPoolCacheEntry = {
  version: number;
  programId: string;
  id: string;
  mintA: {
    address: string;
    decimals: number;
  };
  mintB: {
    address: string;
    decimals: number;
  };
  vault: {
    A: string;
    B: string;
  };
  authority: string;
  openOrders: string;
  targetOrders: string;
  mintLp: {
    address: string;
    decimals: Number;
  };
  // market
  marketProgramId: string;
  marketId: string;
  marketAuthority: string;
  marketBaseVault: string;
  marketQuoteVault: string;
  marketBids: string;
  marketAsks: string;
  marketEventQueue: string;
};

// Define the structure of Priority Fee Estimation response
export type MicroLamportPriorityFee = number;

export type MicroLamportPriorityFeeLevels = {
  min: number;
  low: number;
  medium: number;
  high: number;
  veryHigh: number;
  unsafeMax: number;
};

export type GetPriorityFeeEstimateResponse = {
  priorityFeeEstimate?: MicroLamportPriorityFee;
  priorityFeeLevels?: MicroLamportPriorityFeeLevels;
};
export type DexScreenerPoolInfo = {
  chainId: string;
  dexId: string;
  labels: string[];
  poolAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceNative: string;
  priceUsd: string;
  volume: {
    h24: number;
    h6: number;
    h1: number;
    m5: number;
  };
  priceChange: {
    h24: number;
    h6: number;
    h1: number;
    m5: number;
  };
  liquidity: {
    usd: number;
    base: number;
    quote: number;
  };
  marketCap: number;
};
