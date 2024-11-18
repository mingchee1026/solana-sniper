import {Connection, PublicKey} from '@solana/web3.js';
import {EventEmitter} from 'events';
import {getPriorityFeeEstimate} from '../utils/priority-fee';
import {getMinimumBalanceForRentExemptAccount} from '@solana/spl-token';
import {getConnection, RAYDIUM_CPMM_PROGRAM_ID} from '../services';

/**
 * Class representing event listeners for monitoring on-chain data such as
 * Raydium CPMM pools, config changes, and blockchain dynamics like blockhashes,
 * priority fees, and rent exemption information.
 *
 * Upon receiving each information a corresponding event will be emitted which anyone can subscribe to.
 *
 * @extends EventEmitter
 */
export class Listeners extends EventEmitter {
  private subscriptions: number[] = [];
  private blockhashTaskIntervalId!: NodeJS.Timeout | null;
  private priorityFeeEstimateTaskIntervalId!: NodeJS.Timeout | null;
  private rentExcemptionTaskIntervalId!: NodeJS.Timeout | null;

  constructor() {
    super();
  }

  /**
   * Starts and initializes the listeners to subscribe to on-chain updates and setup periodic tasks.
   *
   * @async
   * @returns {Promise<void>}
   */
  public async start(): Promise<void> {
    this.subscriptions.push(this.subscribeToRaydiumCpmmPools());
    this.subscriptions.push(this.subscribeToRaydiumCpmmConfigs());

    this.blockhashTaskIntervalId = this.fetchRecentBlockHashPeriodic();
    this.priorityFeeEstimateTaskIntervalId =
      this.fetchPriorityFeeEstimatePeriodic();
    this.rentExcemptionTaskIntervalId = this.fetchRentExcemptionPeriodic();
  }

  /**
   * Subscribes to changes in Raydium CPMM pool accounts and emits the data.
   *
   * @private
   * @returns {number} - The subscription ID.
   */
  private subscribeToRaydiumCpmmPools(): number {
    const connection = getConnection();
    return connection.onProgramAccountChange(
      RAYDIUM_CPMM_PROGRAM_ID,
      async updatedAccountInfo => {
        this.emit('raydiumCpmmPool', updatedAccountInfo);
      },
      {
        commitment: connection.commitment,
        filters: [{dataSize: 637}],
      }
    );
  }

  /**
   * Subscribes to changes in Raydium CPMM config accounts and emits the data.
   *
   * @private
   * @returns {number} - The subscription ID.
   */
  private subscribeToRaydiumCpmmConfigs(): number {
    const connection = getConnection();
    return connection.onProgramAccountChange(
      RAYDIUM_CPMM_PROGRAM_ID,
      async updatedAccountInfo => {
        this.emit('raydiumCpmmConfig', updatedAccountInfo);
      },
      {
        commitment: connection.commitment,
        filters: [{dataSize: 236}], // TODO test this
      }
    );
  }

  /**
   * Periodically fetches the latest block hash and emits the data.
   *
   * @private
   * @returns {NodeJS.Timeout} - The interval ID.
   */
  private fetchRecentBlockHashPeriodic(): NodeJS.Timeout {
    return setInterval(async () => {
      try {
        // todo error male injas
        const blockHash = await getConnection().getLatestBlockhash('finalized'); // TODO error handling in case of timeout (it happened)? (DONE) do we need to reconnect?
        this.emit('blockHash', blockHash);
      } catch (e) {
        const error = e as Error;
        console.log(`fetching last block hash failed.\n${error.stack}`);
        return {};
      }
    }, 1000); // 1 second
  }

  /**
   * Periodically fetches the estimated priority fee and emits the data.
   *
   * @private
   * @returns {NodeJS.Timeout} - The interval ID.
   */
  private fetchPriorityFeeEstimatePeriodic(): NodeJS.Timeout {
    return setInterval(async () => {
      try {
        const priorityFeeEstimate = await getPriorityFeeEstimate();
        this.emit('priorityFeeEstimate', priorityFeeEstimate);
      } catch (e) {
        const error = e as Error;
        console.log(`fetching priority fee estimate failed.\n${error.stack}`);
        return {};
      }
    }, 10000); // 10 second
  }

  /**
   * Periodically fetches the required minimum lamports for rent exemption of associated token address accounts and emits the data.
   *
   * @private
   * @returns {NodeJS.Timeout} - The interval ID.
   */
  private fetchRentExcemptionPeriodic(): NodeJS.Timeout {
    return setInterval(async () => {
      try {
        const rentExcemption =
          await getMinimumBalanceForRentExemptAccount(getConnection());
        this.emit('ataRentExcemption', rentExcemption);
      } catch (e) {
        const error = e as Error;
        console.log(`fetching rent excemption for ata failed.\n${error.stack}`);
        return {};
      }
    }, 100000); // 10 second
  }

  /**
   * Stops all active listeners and periodic tasks.
   *
   * @async
   * @returns {Promise<void>}
   */
  public async stop(): Promise<void> {
    for (let i = this.subscriptions.length - 1; i >= 0; --i) {
      const subscription = this.subscriptions[i];
      await getConnection().removeAccountChangeListener(subscription);
      this.subscriptions.splice(i, 1);
    }

    // Stop periodic tasks
    if (this.blockhashTaskIntervalId) {
      clearInterval(this.blockhashTaskIntervalId);
      this.blockhashTaskIntervalId = null;
    }

    if (this.priorityFeeEstimateTaskIntervalId) {
      clearInterval(this.priorityFeeEstimateTaskIntervalId);
      this.priorityFeeEstimateTaskIntervalId = null;
    }

    if (this.rentExcemptionTaskIntervalId) {
      clearInterval(this.rentExcemptionTaskIntervalId);
      this.rentExcemptionTaskIntervalId = null;
    }
  }
}
