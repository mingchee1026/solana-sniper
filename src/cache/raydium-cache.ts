import * as fs from 'fs';
import * as path from 'path';
import {exec} from 'child_process';
import {raydium} from '..';
import {RaydiumPoolCacheEntry} from '../types';

/**
 * Class responsible for caching Raydium pool information.
 */
export class RaydiumPoolCache {
  private readonly keys = new Map<
    string,
    Awaited<ReturnType<typeof this.fetchByPoolAddress>>
  >();
  private updatePoolIntervalId!: NodeJS.Timeout | null;

  /**
   * Initializes the cache for Raydium V4 (AMM) and V5 (Stable) pool information.
   * Downloads the pool data if not already cached and sets up periodic updates.
   *
   * @returns {Promise<void>} Resolves when initialization completes.
   */
  public async init() {
    console.time('Cache Raydium V4 (AMM) and V5 (Stable) pool information');

    const savePath: string = path.join(
      `${process.cwd()}/public/cache`,
      'mainnet.json'
    );

    this.createDirectoryIfNotExists(`${process.cwd()}/public/cache`);

    try {
      // Check if the file already exists
      await fs.promises.access(savePath, fs.constants.F_OK);
      this.loadRaydiumPools();
    } catch (err) {
      // If the file doesn't exist, proceed with the download
      this.updatePools();
    }
    // this.updatePools();

    this.updatePoolIntervalId = setInterval(
      async () => {
        try {
          await this.updatePools();
        } catch (e) {
          const error = e as Error;
          console.log(
            `updating Raydium V4 (AMM) and V5 (Stable) pool information failed.\n${error.stack}`
          );
        }
      },
      2 * 3600 * 1000
    ); // 2 hours

    console.timeEnd('Cache Raydium V4 (AMM) and V5 (Stable) pool information');
  }

  /**
   * Downloads and caches the Raydium pool information.
   * Fetches the JSON file containing pool data and loads it into memory.
   *
   * @returns {Promise<void>} Resolves when the pools are updated.
   */
  public async updatePools(): Promise<void> {
    const savePath: string = path.join(
      `${process.cwd()}/public/cache`,
      'mainnet.json'
    );

    try {
      await this.downloadJsonFile(
        'https://api.raydium.io/v2/sdk/liquidity/mainnet.json',
        savePath
      );
      console.log(
        'Raydium V4 (AMM) and V5 (Stable) pools JSON file is downloaded.'
      );
    } catch (err) {
      console.error(
        'Error downloading Raydium V4 (AMM) and V5 (Stable) pools JSON file:',
        err
      );
      return;
    }

    this.loadRaydiumPools();
  }

  /**
   * Loads the Raydium pool information from the cached JSON file.
   * Parses and stores the pool data in the class instance.
   */
  public loadRaydiumPools() {
    try {
      // Read the JSON file synchronously
      const poolsData = fs.readFileSync(
        `${process.cwd()}/public/cache/mainnet.json`,
        'utf-8'
      );

      // Parse the JSON data into a JavaScript object
      const pools = JSON.parse(poolsData);

      for (const pool of pools.official) {
        this.save(pool.id, pool);
      }
      for (const pool of pools.unOfficial) {
        this.save(pool.id, pool);
      }
    } catch (err) {
      console.error(
        'Error reading Raydium V4 (AMM) and V5 (Stable) pools JSON file:',
        err
      );
      return null;
    }
  }

  /**
   * Downloads a JSON file from the specified URL and saves it to the given path.
   *
   * @param {string} url - The URL of the JSON file to download.
   * @param {string} savePath - The local path where the downloaded file will be saved.
   * @returns {Promise<void>} Resolves when the file is successfully downloaded.
   */
  public async downloadJsonFile(url: string, savePath: string): Promise<void> {
    const curlCommand: string = `curl -s -o ${savePath} ${url}`;

    return new Promise((resolve, reject) => {
      exec(curlCommand, (error, stdout, stderr) => {
        if (error) {
          // Handle execution error
          return reject(`Error downloading file: ${error.message}`);
        }

        if (stderr) {
          // Reject if there's any error output
          return reject(`Error in stderr: ${stderr}`);
        }

        // Optionally log the stdout for feedback
        // if (stdout) {
        //   console.log(`stdout: ${stdout}`);
        // }

        // console.log(`File downloaded successfully to ${savePath}`);
        resolve();
      });
    });
  }

  /**
   * Ensures the specified directory exists, creating it if necessary. This is a helper function for storing the json pool data for the first time.
   *
   * @param {string} dirPath - The directory path to check or create.
   * @returns {Promise<void>} Resolves when the directory exists.
   */
  public async createDirectoryIfNotExists(dirPath: string): Promise<void> {
    try {
      // Use mkdir with recursive option to create the directory and its parent directories if necessary
      await fs.promises.mkdir(dirPath, {recursive: true});
    } catch (err) {
      throw err;
    }
  }

  /**
   * Saves the pool state into the cache using the pool ID.
   *
   * @param {string} id - The pool ID used as the key in the cache.
   * @param {RaydiumPoolCacheEntry} state - The pool to cache.
   */
  public async save(id: string, state: RaydiumPoolCacheEntry) {
    this.keys.set(id, state);
  }

  /**
   * Retrieves the state of a pool from the cache or fetches it if not found.
   *
   * @param {string} poolId - The ID of the pool to retrieve.
   * @returns {Promise<RaydiumPoolCacheEntry>} Retrieved pool.
   * @throws Will throw an error if the pool is not found.
   */
  public async get(poolId: string): Promise<RaydiumPoolCacheEntry> {
    if (!this.keys.has(poolId)) {
      // first we try to fetch them.
      const poolInfo = await this.fetchByPoolAddress(poolId);
      if (!poolInfo) throw Error(`Pool Id: ${poolId} not found in Raydium.`);

      this.save(poolId, poolInfo as any); // TODO add type checking
    }
    return this.keys.get(poolId)!;
  }

  /**
   * Fetches pool information by its address using raydium apis.
   *
   * @param {string} poolAddress - The address of the pool to fetch.
   * @returns {Promise<RaydiumPoolCacheEntry | null>} A promise resolving to the pool information.
   */
  public async fetchByPoolAddress(
    poolAddress: string
  ): Promise<RaydiumPoolCacheEntry | null> {
    const poolKeys: any = (
      await raydium.api.fetchPoolKeysById({
        idList: [poolAddress],
      })
    )[0];
    if (!poolKeys) return null;

    if (poolKeys.programId === '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8') {
      // TODO support version 5
      // it's AMM v4 program
      return {
        version: 4,
        // base
        programId: poolKeys.programId,
        id: poolKeys.id,
        mintA: {
          address: poolKeys.mintA.address,
          decimals: poolKeys.mintA.decimals,
        },
        mintB: {
          address: poolKeys.mintB.address,
          decimals: poolKeys.mintB.decimals,
        },
        vault: {A: poolKeys.vault.A, B: poolKeys.vault.B},
        // amm
        authority: poolKeys.authority,
        openOrders: poolKeys.openOrders,
        targetOrders: poolKeys.targetOrders,
        mintLp: {
          address: poolKeys.mintLp.address,
          decimals: poolKeys.mintLp.decimals,
        } as any,
        // market
        marketProgramId: poolKeys.marketProgramId,
        marketId: poolKeys.marketId,
        marketAuthority: poolKeys.marketAuthority,
        marketBaseVault: poolKeys.marketBaseVault,
        marketQuoteVault: poolKeys.marketQuoteVault,
        marketBids: poolKeys.marketBids,
        marketAsks: poolKeys.marketAsks,
        marketEventQueue: poolKeys.marketEventQueue,
      };
    } else if (
      poolKeys.programId === 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C'
    ) {
      // TODO for CPMM is not handled!
      // it's CPMM program
      return {
        version: 7,
        // base
        programId: poolKeys.programId,
        id: poolKeys.id,
        mintA: {
          address: poolKeys.mintA.address,
          decimals: poolKeys.mintA.decimals,
        },
        mintB: {
          address: poolKeys.mintB.address,
          decimals: poolKeys.mintB.decimals,
        },
        vault: {A: poolKeys.vault.A, B: poolKeys.vault.B},
        // amm
        authority: poolKeys.authority,
        openOrders: poolKeys.openOrders,
        targetOrders: poolKeys.targetOrders,
        mintLp: {
          address: poolKeys.mintLp.address,
          decimals: poolKeys.mintLp.decimals,
        } as any,
        // market
        marketProgramId: poolKeys.marketProgramId,
        marketId: poolKeys.marketId,
        marketAuthority: poolKeys.marketAuthority,
        marketBaseVault: poolKeys.marketBaseVault,
        marketQuoteVault: poolKeys.marketQuoteVault,
        marketBids: poolKeys.marketBids,
        marketAsks: poolKeys.marketAsks,
        marketEventQueue: poolKeys.marketEventQueue,
      };
    }

    throw new Error('dex not supported');
  }
}
