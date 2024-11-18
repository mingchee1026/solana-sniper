import {Commitment, Connection, PublicKey} from '@solana/web3.js';
import {RaydiumCpmmPoolInfo} from '../types';
import * as splToken from '@solana/spl-token';
import {cpmmProgram} from '..';
import {getConnection} from '../services';

/**
 * Class responsible for caching Raydium CPMM pool information.
 */
export class PoolCache {
  private readonly keys: Map<string, RaydiumCpmmPoolInfo> = new Map<
    string,
    RaydiumCpmmPoolInfo
  >();

  public async init() {
    console.time('Cache Raydium CPMM pool information and their vaults');
    const cpmmPools = await cpmmProgram.account.poolState.all();

    const vaults = cpmmPools.flatMap(pool => {
      return [pool.account.token0Vault, pool.account.token1Vault];
    });

    const vaultInfos = await this.getMultipleAccountsInBatches(
      getConnection(),
      vaults,
      100,
      getConnection().commitment
    ); // TODO commitment level

    cpmmPools.forEach(async (pool, i) => {
      const vault0Account = splToken.unpackAccount(
        pool.account.token0Vault,
        vaultInfos[2 * i],
        pool.account.token0Program
      );
      const vault1Account = splToken.unpackAccount(
        pool.account.token1Vault,
        vaultInfos[2 * i + 1],
        pool.account.token1Program
      );

      if (
        pool.account.token0Vault !== vault0Account.address ||
        pool.account.token1Vault !== vault1Account.address
      )
        throw new Error('Vaults are out of order, should not happen.');

      const poolInfo = {vault0Account, vault1Account, ...pool.account};

      await this.save(pool.publicKey.toBase58(), poolInfo);
    });

    console.timeEnd('Cache Raydium CPMM pool information and their vaults');
  }

  public async save(id: string, state: RaydiumCpmmPoolInfo) {
    this.keys.set(id, state);
  }

  public async get(poolId: string): Promise<RaydiumCpmmPoolInfo> {
    if (!this.keys.has(poolId)) {
      // currently we throw error, but we can add a function to fetch them.
      // throw Error(
      //   `Pool Id: ${poolId} not found in cache, pool status may not be enabled.`
      // );
      const poolState = await cpmmProgram.account.poolState.fetch(poolId);

      const [vault0Info, vault1Info] =
        await getConnection().getMultipleAccountsInfo(
          [poolState.token0Vault, poolState.token1Vault],
          'confirmed'
        ); // TODO commitment level
      const vault0Account = splToken.unpackAccount(
        poolState.token0Vault,
        vault0Info,
        poolState.token0Program
      );
      const vault1Account = splToken.unpackAccount(
        poolState.token1Vault,
        vault1Info,
        poolState.token1Program
      );

      if (
        poolState.token0Vault !== vault0Account.address ||
        poolState.token1Vault !== vault1Account.address
      )
        throw new Error('Vaults are out of order, should not happen.');

      const poolInfo: RaydiumCpmmPoolInfo = {
        vault0Account,
        vault1Account,
        ...poolState,
      };

      return poolInfo;
    }
    return this.keys.get(poolId)!;
  }

  private async getMultipleAccountsInBatches(
    connection: Connection,
    accountPublicKeys: PublicKey[],
    batchSize: number,
    commitment?: Commitment
  ) {
    const promises = [];

    // Split the account keys into batches
    for (let i = 0; i < accountPublicKeys.length; i += batchSize) {
      const batch = accountPublicKeys.slice(i, i + batchSize);

      // Fetch account info for the current batch
      const accountsInfo = getConnection().getMultipleAccountsInfo(
        batch,
        commitment
      );
      promises.push(accountsInfo);
      // TODO do we need sleep
    }
    const results = await Promise.all(promises);

    return results.flat(1);
  }
}
