import {cpmmProgram} from '..';
import {RaydiumCpmmConfig} from '../types';

/**
 * Class responsible for caching Raydium CPMM pool config information.
 */
export class ConfigCache {
  private readonly keys: Map<string, RaydiumCpmmConfig> = new Map<
    string,
    RaydiumCpmmConfig
  >();

  public async init() {
    console.time('Cache Raydium CPMM config information');
    const configs = await cpmmProgram.account.ammConfig.all();

    configs.forEach(async config => {
      await this.save(config.publicKey.toBase58(), config.account);
    });

    console.timeEnd('Cache Raydium CPMM config information');
  }

  public async save(id: string, config: RaydiumCpmmConfig) {
    this.keys.set(id, config);
  }

  public async get(configId: string): Promise<RaydiumCpmmConfig> {
    if (!this.keys.has(configId)) {
      // currently we throw error, but we can add a function to fetch them.
      throw Error(`Config Id: ${configId} not found in cache.`);
    }
    return this.keys.get(configId)!;
  }
}
