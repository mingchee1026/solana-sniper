import {
  BlockhashWithExpiryBlockHeight,
  VersionedTransaction,
} from '@solana/web3.js';

export interface TransactionExecutor {
  executeAndConfirm(
    transaction: VersionedTransaction,
    latestBlockHash: BlockhashWithExpiryBlockHeight
  ): Promise<{confirmed: boolean; signature?: string; error?: string}>;
}
