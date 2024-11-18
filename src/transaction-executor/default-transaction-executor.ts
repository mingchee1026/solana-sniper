import {
  BlockhashWithExpiryBlockHeight,
  Connection,
  Transaction,
  VersionedTransaction,
} from '@solana/web3.js';
import {TransactionExecutor} from './transaction-executor.interface';

/**
 * Default implementation of the TransactionExecutor interface.
 *
 * This class manages the execution and confirmation of Solana blockchain transactions.
 */
export class DefaultTransactionExecutor implements TransactionExecutor {
  /**
   * Creates an instance of DefaultTransactionExecutor.
   *
   * @param {Connection} connection - A connection to the Solana cluster.
   */
  constructor(private readonly connection: Connection) {}

  /**
   * Executes a transaction and confirms its completion.
   *
   * This method simulates the transaction, sends it, and then
   * checks if the transaction is confirmed on the blockchain.
   *
   * @param {VersionedTransaction} transaction - The transaction to be executed.
   * @param {BlockhashWithExpiryBlockHeight} latestBlockhash - The blockhash with an expiry block height used for confirming the transaction.
   * @returns {Promise<{confirmed: boolean; signature?: string; error?: string}>} - Returns an object indicating if the transaction was confirmed and its signature, or an error if one occurred.
   */
  public async executeAndConfirm(
    transaction: VersionedTransaction,
    latestBlockhash: BlockhashWithExpiryBlockHeight
  ): Promise<{confirmed: boolean; signature?: string; error?: string}> {
    console.log(await this.connection.simulateTransaction(transaction));
    const signature = await this.execute(transaction);
    console.log(`Signature: ${signature}`);

    const confirmationResult = await this.confirm(signature, latestBlockhash);

    console.log(`https://solscan.io/tx/${signature}`);

    return confirmationResult;
  }

  /**
   * Executes a transaction by sending it to the Solana blockchain.
   *
   * @param {VersionedTransaction} transaction - The transaction to be sent.
   * @returns {Promise<string>} - The signature of the transaction.
   */
  public async execute(transaction: VersionedTransaction): Promise<string> {
    // console.log(await this.connection.simulateTransaction(transaction));

    return this.connection.sendRawTransaction(transaction.serialize(), {
      // preflightCommitment: this.connection.commitment,
      skipPreflight: true,
      maxRetries: 0, // TODO implement our own retry system: query blockhash
    });
  }

  /**
   * Confirms whether the transaction has been confirmed by the Solana blockchain.
   * It will check if the transaction has been confirmed or if its not included in a block withing valid blockhashes.
   *
   * @param {string} signature - The transaction signature to be confirmed.
   * @param {BlockhashWithExpiryBlockHeight} latestBlockhash - The latest blockhash used for transaction confirmation.
   * @returns {Promise<{confirmed: boolean; signature: string}>} - Returns an object indicating if the transaction was confirmed and its signature.
   */
  public async confirm(
    signature: string,
    latestBlockhash: BlockhashWithExpiryBlockHeight
  ): Promise<{confirmed: boolean; signature: string}> {
    const confirmation = await this.connection.confirmTransaction(
      {
        signature,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        blockhash: latestBlockhash.blockhash,
      },
      'confirmed'
    );

    return {confirmed: !confirmation.value.err, signature};
  }
}
