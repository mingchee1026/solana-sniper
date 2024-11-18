require('dotenv-safe').config({
  allowEmptyValues: false,
});
import express, {Application} from 'express';
import * as anchor from '@coral-xyz/anchor';
import {Raydium} from '@raydium-io/raydium-sdk-v2';
import * as splToken from '@solana/spl-token';
import {Helius} from 'helius-sdk';

import {BlockHash, GetPriorityFeeEstimateResponse} from './types';

import {
  getStakedConnection,
  getConnection,
  raydiumAmmProgram,
  raydiumCpmmProgram,
} from './services';
import {getPriorityFeeEstimate} from './utils';
import {Listeners} from './listeners';
import {DefaultTransactionExecutor} from './transaction-executor';
import Middleware from './middlewares';
import router from './routers';
import {db} from './database';
import {DexScreenerCache} from './cache/dexscreener-cache';
import {PoolCache as RaydiumCpmmPoolCache} from './cache/raydium-cpmm-pool-cache';
import {ConfigCache as RaydiumCpmmConfigCache} from './cache/raydium-cpmm-config-cache';
import {RaydiumPoolCache} from './cache/raydium-cache';
import * as cronJobs from './cronjobs';
import axios from 'axios';

export const EXCHANGE_FEE =
  process.env.EXCHANGE_FEE ||
  (() => {
    throw new Error('EXCHANGE_FEE is not set');
  })();

export let recentBlockhash: BlockHash;
export let priorityFeeEstimate: GetPriorityFeeEstimateResponse;
export let ataRentExcemption: anchor.BN;

export let raydium: Raydium;
export const ammProgram = raydiumAmmProgram();
export const cpmmProgram = raydiumCpmmProgram();

export const dexScreenerCache = new DexScreenerCache(60, 60);
export const raydiumCpmmPoolCache = new RaydiumCpmmPoolCache();
export const raydiumPoolCache = new RaydiumPoolCache();
export const raydiumCpmmConfigCache = new RaydiumCpmmConfigCache();
export const txExecutor = new DefaultTransactionExecutor(getStakedConnection()); // use staked connection for sending tx // TODO make it a function
export const helius = new Helius(
  process.env.HELIUS_MAINNET_STAKED_CLUSTER_API_KEY ||
    (() => {
      throw new Error('HELIUS_MAINNET_STAKED_CLUSTER_API_KEY is not set');
    })()
);
const listener = new Listeners();

// console.log(raydiumCache.get("BRdFjLqJqMcC5GySrFcawhnji4ba4Hdg1XWXxDFSGeyy"));

async function main() {
  // const s = await axios
  //   .post(
  //     `https://9b4c-64-23-172-25.ngrok-free.app/webhook/api/update/${1}`,
  //     {message: 'SUCCESS'},
  //     {
  //       headers: {
  //         'Content-Type': 'application/json',
  //       },
  //     }
  //   )
  //   .then(response => {
  //     console.log('Response:', response.data);
  //   })
  //   .catch(error => {
  //     console.error('Error:', error);
  //   });

  raydium = await Raydium.load({
    connection: getConnection(),
  });

  await Promise.all([
    // raydiumPoolCache.init(),
    // raydiumCpmmPoolCache.init(),
    raydiumCpmmConfigCache.init(),
  ]);
  // console.log(
  //   await raydiumPoolCache.get('GxBGVHDwzRZFMK5y9CdHRzkEs48kMdv8gAvhZtfbS9MX')
  // );
  // console.log(
  //   await raydiumPoolCache.get('DaE8d9j86ej1ZBaeyvdmYNDNe62Wq2Z4JHEtqT3g2b4C')
  // );
  await listener.start();

  [recentBlockhash, priorityFeeEstimate, ataRentExcemption] = await Promise.all(
    [
      getConnection().getLatestBlockhash(), // TODO error handling and retrying mechs
      getPriorityFeeEstimate(),
      splToken
        .getMinimumBalanceForRentExemptAccount(getConnection())
        .then(rentExcemption => {
          return new anchor.BN(rentExcemption);
        }),
    ]
  );

  listener.on('blockHash', (blockhash: BlockHash | null) => {
    if (blockhash) recentBlockhash = blockhash;
  });

  listener.on(
    'priorityFeeEstimate',
    (estimate: GetPriorityFeeEstimateResponse | null) => {
      if (estimate) priorityFeeEstimate = estimate;
    }
  );

  listener.on('ataRentExcemption', (rentExcemption: number | null) => {
    if (rentExcemption) ataRentExcemption = new anchor.BN(rentExcemption);
  });

  // listener.on(
  //   'raydiumCpmmPool',
  //   async (updatedAccountInfo: KeyedAccountInfo) => {
  //     const poolState: RaydiumCpmmPoolState = cpmmProgram.coder.accounts.decode(
  //       'poolState',
  //       updatedAccountInfo.accountInfo.data
  //     );

  //     const [vault0Info, vault1Info] = await connection.getMultipleAccountsInfo(
  //       [poolState.token0Vault, poolState.token1Vault],
  //       connection.commitment
  //     ); // TODO commitment level
  //     const vault0Account = splToken.unpackAccount(
  //       poolState.token0Vault,
  //       vault0Info,
  //       poolState.token0Program
  //     );
  //     const vault1Account = splToken.unpackAccount(
  //       poolState.token1Vault,
  //       vault1Info,
  //       poolState.token1Program
  //     );

  //     if (
  //       poolState.token0Vault !== vault0Account.address ||
  //       poolState.token1Vault !== vault1Account.address
  //     )
  //       throw new Error('Vaults are out of order, should not happen.');

  //     const poolInfo: RaydiumCpmmPoolInfo = {
  //       vault0Account,
  //       vault1Account,
  //       ...poolState,
  //     };

  //     raydiumCpmmPoolCache.save(
  //       updatedAccountInfo.accountId.toBase58(),
  //       poolInfo
  //     );
  //   }
  // );

  // listener.on(
  //   'raydiumCpmmConfig',
  //   async (updatedAccountInfo: KeyedAccountInfo) => {
  //     const ammConfig: RaydiumCpmmConfig = cpmmProgram.coder.accounts.decode(
  //       'ammConfig',
  //       updatedAccountInfo.accountInfo.data
  //     );

  //     raydiumCpmmConfigCache.save(
  //       updatedAccountInfo.accountId.toBase58(),
  //       ammConfig
  //     );
  //   }
  // );

  // console.log(configCache);

  // Sample swap
  // const poolData: PoolInfo = poolCache.get(
  //   'D5YWC5JusLmsJL7TD2JHC81sy5TLnA2YDygUHy9w5SCv'
  // );
  // BRdFjLqJqMcC5GySrFcawhnji4ba4Hdg1XWXxDFSGeyy
  // 2N4fqFvGafQfnkbhFNEX61Nwj1jLfoxZJMgeavMBgSig
  // So11111111111111111111111111111111111111112

  // Sample limit
  // const tx = await getSignedLimitTransaction(
  //   wallet.payer,
  //   new PublicKey('So11111111111111111111111111111111111111112'),
  //   new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
  //   new anchor.BN(1000),
  //   new anchor.BN(100000),
  //   recentBlockhash,
  //   Math.ceil(priorityFeeEstimate.priorityFeeLevels?.high || 0)
  // );

  // const res = await txExecutor.executeAndConfirm(tx, recentBlockhash);
  // console.log(res);

  // await listener.stop();
  await db.initDatabase(false);
  cronJobs.start();
  const app: Application = express();

  app.use(express.json());

  Middleware.initBefore(app);
  app.use('/api', router);

  // The error handler must be before any other error middleware and after all controllers
  Middleware.initAfter(app);

  app.listen(Number(process.env.PORT), String(process.env.HOST), () => {
    return console.log(
      `Express is listening at http://${process.env.HOST}:${process.env.PORT}`
    );
  });
}

main().catch(e => {
  console.log(e);
  listener.stop().catch(console.log);
});
