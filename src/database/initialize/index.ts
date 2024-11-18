/**
 * Initializes the database with some dummy data
 */

import {Keypair, PublicKey} from '@solana/web3.js';
import bs58 from 'bs58';
import {
  User,
  Network,
  Token,
  Key,
  Wallet,
  Order,
  Database,
  db,
  Market,
} from '..';
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

const importTableData = async (database: Database) => {
  await database.sequelize.transaction(async t => {
    const baseContract = '91o2zcMyy5wQEFE91pJnbWbAUke4MuvrxwRgibh7ong';
    const baseProgramId = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
    const poolAddress = 'DaE8d9j86ej1ZBaeyvdmYNDNe62Wq2Z4JHEtqT3g2b4C';
    // const baseContract = 'Hx84ftwWNymNoDPikCMYAeaj1sYXo8RmtnVPHEeENHDV';
    // const baseProgramId = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
    // const poolAddress = 'DaE8d9j86ej1ZBaeyvdmYNDNe62Wq2Z4JHEtqT3g2b4C';

    const network = await Network.create(
      {
        name: 'solana',
        title: 'Solana',
        isWithdrawEnabled: true,
        status: 'active',
        config: {
          requiredConfirmation: 30,
        },
      },
      {transaction: t}
    );

    const quoteToken = await Token.create(
      {
        name: 'solana',
        title: 'Wrapped SOL',
        symbol: 'SOL',
        decimalsToShow: 3,
        networkId: network.id,
        parentId: null,
        contractAddress: 'So11111111111111111111111111111111111111112',
        tokenProgramAddress: TOKEN_PROGRAM_ID.toBase58(),
        unitName: 'lamport',
        unitDecimals: 9,
        isWithdrawEnabled: true,
        withdrawCommission: '0.001',
        withdrawMin: '0.01',
        withdrawMax: '0',
        status: 'active',
      },
      {transaction: t}
    );
    const baseToken = await Token.create(
      {
        name: 'ong',
        title: 'On God',
        symbol: 'ONG',
        decimalsToShow: 0,
        networkId: network.id,
        parentId: quoteToken.id,
        contractAddress: baseContract,
        tokenProgramAddress: baseProgramId,
        unitName: 'N/A',
        unitDecimals: 6,
        isWithdrawEnabled: true,
        withdrawCommission: '1',
        withdrawMin: '2',
        withdrawMax: '0',
        status: 'active',
      },
      {transaction: t}
    );

    const market = await Market.create(
      {
        networkId: network.id,
        dexId: 'raydium',
        poolAddress,
        baseTokenId: baseToken.id,
        quoteTokenId: quoteToken.id,
        isRevoked: false,
        status: 'active',
      },
      {transaction: t}
    );

    const user = await User.create(
      {
        telegramId: '1',
        status: 'active',
      } as any,
      {transaction: t}
    );

    const keypair = Keypair.fromSecretKey(
      bs58.decode(process.env.WALLET_PRIV_BASE_58 || '')
    );

    const key = await Key.create(
      {
        userId: user.id,
        publicKey: keypair.publicKey.toBase58(), // TODO
        privateKey: bs58.encode(keypair.secretKey),
        algorithm: 'ecdsa',
        status: 'active',
      },
      {transaction: t}
    );

    const quoteWallet = await Wallet.create(
      {
        userId: user.id,
        parentId: null,
        tokenId: quoteToken.id,
        keyId: key.id,
        address: keypair.publicKey.toBase58(),
        confirmedBalance: '0',
        unconfirmedBalance: '0',
        status: 'active',
      },
      {transaction: t}
    );
    user.defaultWalletId = quoteWallet.id;
    user.save({transaction: t});

    const baseATA = getAssociatedTokenAddressSync(
      new PublicKey(baseContract),
      new PublicKey(quoteWallet.address),
      false,
      new PublicKey(baseProgramId)
    );

    const baseWallet = await Wallet.create(
      {
        userId: user.id,
        parentId: quoteWallet.id,
        tokenId: baseToken.id,
        keyId: key.id,
        address: baseATA.toBase58(),
        confirmedBalance: '0',
        unconfirmedBalance: '0',
        status: 'active',
      },
      {transaction: t}
    );
  });
};

if (process.argv[2] !== 'true' && process.argv[2] !== 'false') {
  throw new Error(
    'You didn\'t specify wether to drop tables or not (force argument).\nAcceptable values are "true" or "false".'
  );
}

const force = process.argv[2] === 'true';
db.initDatabaseContext(force, async () => {
  await importTableData(db);
});

export {importTableData};
