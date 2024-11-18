import {Market} from '../database';
import {DexScreenerPoolInfo} from '../types';

export class DexScreenerCache {
  private readonly keys: Map<
    string,
    {poolInfo: DexScreenerPoolInfo; timestamp: number}
  > = new Map();

  constructor(checkInterval: number, maxCacheTTL: number) {
    // Schedule cache invalidation every ${time} seconds
    setInterval(
      () => this.invalidateOldEntries(maxCacheTTL),
      checkInterval * 1000
    );
  }

  public async saveByPoolAddress(id: string, poolInfo: DexScreenerPoolInfo) {
    this.keys.set(id, {poolInfo, timestamp: Date.now()});
  }

  public async saveByTokenAddress(id: string, poolInfo: DexScreenerPoolInfo) {
    this.keys.set(id, {poolInfo, timestamp: Date.now()});
  }

  public async getByPoolAddress(poolId: string): Promise<DexScreenerPoolInfo> {
    if (!this.keys.has(poolId)) {
      const poolInfo = await this.fetchPoolInfoByPoolAddress(poolId);
      await this.saveByPoolAddress(poolId, poolInfo);
    }

    const cacheRetrieval = this.keys.get(poolId);
    if (cacheRetrieval) {
      return cacheRetrieval.poolInfo;
    }
    throw new Error('DEXSCREENER CACHE: Not found, Should not happen.');
  }

  public async getByTokenAddress(
    tokenId: string
  ): Promise<DexScreenerPoolInfo> {
    if (!this.keys.has(tokenId)) {
      const poolInfo = await this.fetchPoolInfoByTokenAddress(tokenId);
      await this.saveByTokenAddress(tokenId, poolInfo);
    }

    const cacheRetrieval = this.keys.get(tokenId);
    if (cacheRetrieval) {
      return cacheRetrieval.poolInfo;
    }
    throw new Error('DEXSCREENER CACHE: Not found, Should not happen.');
  }

  public async getByMachingQuery(query: string): Promise<DexScreenerPoolInfo> {
    const poolInfo = await this.fetchPoolInfoByMachingQuery(query);
    await this.saveByTokenAddress(poolInfo.baseToken.address, poolInfo);
    await this.saveByPoolAddress(poolInfo.poolAddress, poolInfo);

    return poolInfo;
  }

  private invalidateOldEntries(maxCacheTTL: number) {
    const now = Date.now();
    const timeout = maxCacheTTL * 1000; // seconds

    this.keys.forEach((value, key) => {
      if (now - value.timestamp > timeout) {
        this.keys.delete(key);
      }
    });
  }

  private async fetchPoolInfoByPoolAddress(
    poolAddress: string
  ): Promise<DexScreenerPoolInfo> {
    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/pairs/solana/${poolAddress}`,
      {
        method: 'GET',
        headers: {},
      }
    );
    const data = await response.json();

    if (data && data.pair && Object.keys(data.pair).length > 0) {
      // TODO check we support this pool chain and program
      if (
        data.pair.chainId === 'solana'
        // ['raydium'].includes(pair.dexId) && // * NO NEED: TODO dexIds
        // ['CPMM'].some(item => pair.labels.includes(item)) && // * NO NEED: TODO labels
      ) {
        if (!data.pair.labels) data.pair.labels = [];
        if (data.pair.dexId === 'raydium' && data.pair.labels.length === 0)
          data.pair.labels = ['AMM'];

        return {
          chainId: data.pair.chainId,
          dexId: data.pair.dexId,
          labels: data.pair.labels,
          poolAddress: data.pair.pairAddress,
          baseToken: data.pair.baseToken,
          quoteToken: data.pair.quoteToken,
          priceNative: data.pair.priceNative,
          priceUsd: data.pair.priceUsd,
          volume: {
            h24: data.pair.volume.h24,
            h6: data.pair.volume.h6,
            h1: data.pair.volume.h1,
            m5: data.pair.volume.m5,
          },
          priceChange: {
            h24: data.pair.priceChange.h24,
            h6: data.pair.priceChange.h6,
            h1: data.pair.priceChange.h1,
            m5: data.pair.priceChange.m5,
          },
          liquidity: {
            usd: data.pair.liquidity.usd,
            base: data.pair.liquidity.base,
            quote: data.pair.liquidity.quote,
          },
          marketCap: data.pair.marketCap,
        };
      }
    }
    throw new Error(
      `couldn't fetch pool address info or it is not supported. retrieved data is: ${JSON.stringify(data, null, 4)}`
    );
  }

  private async fetchPoolInfoByTokenAddress(
    // TODO lowercase set entry
    tokenAddress: string
  ): Promise<DexScreenerPoolInfo> {
    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
      {
        method: 'GET',
        headers: {},
      }
    );
    const data = await response.json();

    if (data && data.pairs && data.pairs.length !== 0) {
      // fetch the pool with biggest liquidity that we support
      let pairWithBiggestLiq: any = {};
      let liquidity = -1;
      for (const pair of data.pairs) {
        if (
          pair.chainId === 'solana'
          // ['raydium'].includes(pair.dexId) && // * NO NEED: TODO dexIds
          // ['CPMM'].some(item => pair.labels.includes(item)) && // * NO NEED: TODO labels
          // pair.quoteToken.address === market.quoteCnet?.contractAddress! && // * NO NEED
          // pair.baseToken.address === market.baseCnet?.contractAddress! // TODO check if base and quote are misplaced
        ) {
          if (pair.liquidity && pair.liquidity.usd > liquidity) {
            liquidity = pair.liquidity.usd;
            pairWithBiggestLiq = pair;
          }
        }
      }
      if (Object.keys(pairWithBiggestLiq).length > 0) {
        if (!pairWithBiggestLiq.labels) pairWithBiggestLiq.labels = [];
        if (
          pairWithBiggestLiq.dexId === 'raydium' &&
          pairWithBiggestLiq.labels.length === 0
        )
          pairWithBiggestLiq.labels = ['AMM'];

        return {
          chainId: pairWithBiggestLiq.chainId,
          dexId: pairWithBiggestLiq.dexId,
          labels: pairWithBiggestLiq.labels,
          poolAddress: pairWithBiggestLiq.pairAddress,
          baseToken: pairWithBiggestLiq.baseToken,
          quoteToken: pairWithBiggestLiq.quoteToken,
          priceNative: pairWithBiggestLiq.priceNative,
          priceUsd: pairWithBiggestLiq.priceUsd,
          volume: {
            h24: pairWithBiggestLiq.volume.h24,
            h6: pairWithBiggestLiq.volume.h6,
            h1: pairWithBiggestLiq.volume.h1,
            m5: pairWithBiggestLiq.volume.m5,
          },
          priceChange: {
            h24: pairWithBiggestLiq.priceChange.h24,
            h6: pairWithBiggestLiq.priceChange.h6,
            h1: pairWithBiggestLiq.priceChange.h1,
            m5: pairWithBiggestLiq.priceChange.m5,
          },
          liquidity: {
            usd: pairWithBiggestLiq.liquidity.usd,
            base: pairWithBiggestLiq.liquidity.base,
            quote: pairWithBiggestLiq.liquidity.quote,
          },
          marketCap: pairWithBiggestLiq.marketCap,
        };
      }
    }
    throw new Error(
      `couldn't fetch token address info or it is not supported. retrieved data is: ${JSON.stringify(data, null, 4)}`
    );
  }

  private async fetchPoolInfoByMachingQuery(
    tokenAddress: string
  ): Promise<DexScreenerPoolInfo> {
    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/search?q=${tokenAddress}`,
      {
        method: 'GET',
        headers: {},
      }
    );
    const data = await response.json();

    if (data && data.pairs && data.pairs.length !== 0) {
      // fetch the pool with biggest liquidity that we support
      let pairWithBiggestLiq: any = {};
      let liquidity = -1;
      for (const pair of data.pairs) {
        if (
          pair.chainId === 'solana'
          // ['raydium'].includes(pair.dexId) && // * NO NEED: TODO dexIds
          // ['CPMM'].some(item => pair.labels.includes(item)) && // * NO NEED: TODO labels
          // pair.quoteToken.address === market.quoteCnet?.contractAddress! && // * NO NEED
          // pair.baseToken.address === market.baseCnet?.contractAddress! // TODO check if base and quote are misplaced
        ) {
          if (pair.liquidity && pair.liquidity.usd > liquidity) {
            liquidity = pair.liquidity.usd;
            pairWithBiggestLiq = pair;
          }
        }
      }
      if (Object.keys(pairWithBiggestLiq).length > 0) {
        if (!pairWithBiggestLiq.labels) pairWithBiggestLiq.labels = [];
        if (
          pairWithBiggestLiq.dexId === 'raydium' &&
          pairWithBiggestLiq.labels.length === 0
        )
          pairWithBiggestLiq.labels = ['AMM'];

        return {
          chainId: pairWithBiggestLiq.chainId,
          dexId: pairWithBiggestLiq.dexId,
          labels: pairWithBiggestLiq.labels,
          poolAddress: pairWithBiggestLiq.pairAddress,
          baseToken: pairWithBiggestLiq.baseToken,
          quoteToken: pairWithBiggestLiq.quoteToken,
          priceNative: pairWithBiggestLiq.priceNative,
          priceUsd: pairWithBiggestLiq.priceUsd,
          volume: {
            h24: pairWithBiggestLiq.volume.h24,
            h6: pairWithBiggestLiq.volume.h6,
            h1: pairWithBiggestLiq.volume.h1,
            m5: pairWithBiggestLiq.volume.m5,
          },
          priceChange: {
            h24: pairWithBiggestLiq.priceChange.h24,
            h6: pairWithBiggestLiq.priceChange.h6,
            h1: pairWithBiggestLiq.priceChange.h1,
            m5: pairWithBiggestLiq.priceChange.m5,
          },
          liquidity: {
            usd: pairWithBiggestLiq.liquidity.usd,
            base: pairWithBiggestLiq.liquidity.base,
            quote: pairWithBiggestLiq.liquidity.quote,
          },
          marketCap: pairWithBiggestLiq.marketCap,
        };
      }
    }
    throw new Error(
      `couldn't fetch token address info or it is not supported. retrieved data is: ${JSON.stringify(data, null, 4)}`
    );
  }
}
