import * as anchor from '@coral-xyz/anchor';
import {
  Token,
  db,
  Market,
  Network,
  PnL,
  User,
  Wallet,
} from '../../../../database';
import {Connection, PublicKey} from '@solana/web3.js';
import * as splToken from '@solana/spl-token';
import {dexScreenerCache} from '../../../..';
import {Op, Sequelize, Transaction} from 'sequelize';
import BigNumber from 'bignumber.js';
import {getConnection} from '../../../../services';
import {WRAPPED_SOL_MINT} from '@project-serum/serum/lib/token-instructions';

const LOG_PREFIX = 'USER: ';

export const getUser = async (telegramId: string) => {
  const user = await User.findOne({where: {telegramId}});

  if (!user) throw new Error(`${LOG_PREFIX}User not found.`);

  if (!user.defaultWalletId) {
    throw new Error(`${LOG_PREFIX}User has no default wallet.`);
  }

  if (
    user.selectedOrderDirection !== 'buy' &&
    user.selectedOrderDirection !== 'sell'
  )
    throw new Error('invalid order direction');

  if (!user.selectedInputAmount) throw new Error('user buy amount not set');
  if (!user.selectedSellPercent) throw new Error('user sell percent not set');

  return user;
};

export const getCurrentPnL = async (walletId: string) => {
  const pnl = await PnL.findOne({
    where: {walletId, isClosed: false},
    order: [['createdAt', 'DESC']],
    raw: true,
  });

  if (!pnl)
    throw new Error(
      `${LOG_PREFIX}User doesn't have any open positions for this token.`
    );

  // TODO should we calculate price changes here?

  return pnl;
};

export const getUserAssets = async (parentWalletId: string) => {
  const [wallets, wallet] = await Promise.all([
    Wallet.findAll({
      attributes: ['id', 'parentId', 'confirmedBalance', 'address'],
      where: {
        parentId: parentWalletId,
        confirmedBalance: {
          [Op.gt]: '0',
        },
      },
      include: [
        {
          attributes: [
            'name',
            'title',
            'symbol',
            'contractAddress',
            'unitDecimals',
            'decimalsToShow',
          ],
          model: Token,
          as: 'token',
          required: true,
        },
      ],
      raw: true,
      nest: true,
    }),
    Wallet.findOne({
      attributes: ['id', 'parentId', 'confirmedBalance', 'address'],
      where: {
        id: parentWalletId,
      },
      include: [
        {
          attributes: [
            'name',
            'title',
            'symbol',
            'contractAddress',
            'unitDecimals',
            'decimalsToShow',
          ],
          model: Token,
          as: 'token',
          required: true,
        },
      ],
      raw: true,
      nest: true,
    }),
  ]);

  if (!wallet) throw new Error(`${LOG_PREFIX}User doesn't have any wallets!`);
  wallets.push(wallet);

  for (const wallet of wallets) {
    wallet.confirmedBalance = new BigNumber(wallet.confirmedBalance)
      .div(new BigNumber(10).pow(wallet.token?.unitDecimals!))
      .toString();
  }

  return wallets;
};

export const getMarketByQuery = async (tokenQuery: string) => {
  // TODO if sol token is inputted
  tokenQuery = tokenQuery.toLowerCase();
  // TODO is it okay to find the first one in out DB?
  const market = await Market.findOne({
    attributes: ['id', 'poolAddress'],
    where: {
      [Op.or]: [
        // TODO currently we filter out quote ( we do not consider it)
        // TODO check if it is better to do with LIKE query
        Sequelize.where(
          Sequelize.fn('LOWER', Sequelize.col('pool_address')),
          tokenQuery
        ),
        Sequelize.where(
          Sequelize.fn('LOWER', Sequelize.col('baseToken.contract_address')),
          tokenQuery
        ),
        Sequelize.where(
          Sequelize.fn('LOWER', Sequelize.col('baseToken.name')),
          tokenQuery
        ),
        Sequelize.where(
          Sequelize.fn('LOWER', Sequelize.col('baseToken.title')),
          tokenQuery
        ),
        Sequelize.where(
          Sequelize.fn('LOWER', Sequelize.col('baseToken.symbol')),
          tokenQuery
        ),
        // ! FIXED BUG: we should check the quote token because sometimes base and quote can be interchanged.
        Sequelize.where(
          Sequelize.fn('LOWER', Sequelize.col('quoteToken.contract_address')),
          tokenQuery
        ),
        Sequelize.where(
          Sequelize.fn('LOWER', Sequelize.col('quoteToken.name')),
          tokenQuery
        ),
        Sequelize.where(
          Sequelize.fn('LOWER', Sequelize.col('quoteToken.title')),
          tokenQuery
        ),
        Sequelize.where(
          Sequelize.fn('LOWER', Sequelize.col('quoteToken.symbol')),
          tokenQuery
        ),
      ],
    },
    include: [
      {
        attributes: [
          'name',
          'title',
          'symbol',
          'contractAddress',
          'unitDecimals',
        ],
        model: Token,
        as: 'baseToken',
        required: true,
      },
      {
        attributes: [
          'name',
          'title',
          'symbol',
          'contractAddress',
          'unitDecimals',
        ],
        model: Token,
        as: 'quoteToken',
        required: true,
      },
    ],
    nest: true,
  });

  return market;
};

export const createMarketByQuery = async (tokenQuery: string) => {
  const poolInfo = await dexScreenerCache.getByMachingQuery(tokenQuery);

  // ! For now we only support pairs with WSOL as one side
  if (
    poolInfo.quoteToken.address !== splToken.NATIVE_MINT.toBase58() &&
    poolInfo.baseToken.address !== splToken.NATIVE_MINT.toBase58()
  )
    throw new Error('we only support pairs with WSOL at one side.');
  if (poolInfo.dexId !== 'raydium')
    throw new Error('we only support raydium pools.');
  if (!poolInfo.labels.includes('AMM') && !poolInfo.labels.includes('CPMM'))
    throw new Error('we only support raydium AMM & CPMM pools.');

  const nonWsolTokenInfo =
    poolInfo.quoteToken.address !== splToken.NATIVE_MINT.toBase58()
      ? poolInfo.quoteToken
      : poolInfo.baseToken;

  const [network, wsolToken, nonWsolTokenDb] = await Promise.all([
    Network.findOne({
      attributes: ['id'],
      where: {
        name: poolInfo.chainId,
      },
    }),
    Token.findOne({
      attributes: ['id'],
      where: {contractAddress: splToken.NATIVE_MINT.toBase58()},
    }),
    Token.findOne({
      attributes: ['id'],
      where: {contractAddress: nonWsolTokenInfo.address},
    }),
  ]);
  if (!network) throw new Error('network not supported');
  if (!wsolToken) throw new Error('wsol token not exists');

  const nonWsolTokenAccount = nonWsolTokenDb
    ? null
    : await getMint(getConnection(), new PublicKey(nonWsolTokenInfo.address));

  await db.sequelize.transaction(
    {isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED},
    async transaction => {
      const nonWsolToken = nonWsolTokenDb
        ? nonWsolTokenDb
        : await Token.create(
            {
              networkId: network.id,
              parentId: wsolToken.id, // ! for now we only support WSOL
              name: nonWsolTokenInfo.name.toLowerCase(),
              title: nonWsolTokenInfo.name,
              symbol: nonWsolTokenInfo.symbol,
              contractAddress: nonWsolTokenInfo.address,
              tokenProgramAddress: nonWsolTokenAccount!.owner.toBase58(),
              unitName: 'NA',
              unitDecimals: nonWsolTokenAccount!.decimals,
              decimalsToShow: 2, // for now we show tokens up to two decimal points
              isWithdrawEnabled: true,
              withdrawCommission: '0',
              withdrawMin: '0',
              withdrawMax: '0',
              status: 'active',
            },
            {transaction}
          );

      const [baseToken, quoteToken] =
        poolInfo.quoteToken.address === wsolToken.contractAddress
          ? [nonWsolToken, wsolToken]
          : [wsolToken, nonWsolToken];

      await Market.create(
        {
          networkId: network.id,
          dexId: poolInfo.dexId,
          poolAddress: poolInfo.poolAddress,
          baseTokenId: baseToken.id,
          quoteTokenId: quoteToken.id,
          isRevoked: false,
          status: 'active',
        },
        {
          returning: false,
          transaction,
        }
      );
    }
  );

  const market = await Market.findOne({
    attributes: ['id', 'poolAddress'],
    where: {
      poolAddress: poolInfo.poolAddress,
    },
    include: [
      {
        attributes: [
          'name',
          'title',
          'symbol',
          'contractAddress',
          'unitDecimals',
        ],
        model: Token,
        as: 'baseToken',
        required: true,
      },
      {
        attributes: [
          'name',
          'title',
          'symbol',
          'contractAddress',
          'unitDecimals',
        ],
        model: Token,
        as: 'quoteToken',
        required: true,
      },
    ],
    nest: true,
  });

  if (!market) throw new Error(`${LOG_PREFIX}Market not found.`);

  return market;
};

export const getMarketByPoolAddress = async (poolAddress: string) => {
  const market = await Market.findOne({
    attributes: ['id', 'poolAddress'],
    where: {
      poolAddress: poolAddress,
    },
    include: [
      {
        attributes: ['name', 'title', 'symbol', 'contractAddress'],
        model: Token,
        as: 'baseToken',
        required: true,
      },
      {
        attributes: ['name', 'title', 'symbol', 'contractAddress'],
        model: Token,
        as: 'quoteToken',
        required: true,
      },
    ],
    nest: true,
  });

  if (!market) throw new Error(`${LOG_PREFIX}Market not found.`);

  return market;
};

export const getPoolInfoByTokenAddress = async (tokenAddress: string) => {
  // TODO what if not found
  const poolInfo = await dexScreenerCache.getByTokenAddress(tokenAddress);

  return poolInfo;
};

export const getPoolInfoByPoolAddress = async (poolAddress: string) => {
  // TODO what if not found
  const poolInfo = await dexScreenerCache.getByPoolAddress(poolAddress);

  return poolInfo;
};

export const updateMarketRevocationStatus = async (
  market: Market,
  connection: Connection
) => {
  if (market.isRevoked) return true;

  const isRevoked = await isMintAuthorityRevoked(
    // TODO error handling
    connection,
    new PublicKey(market.baseToken!.contractAddress) // TODO ! and ? handling
  );
  if (isRevoked) {
    market.isRevoked = true;
    await market.save({returning: false});
  }

  return isRevoked;
};

export const getWalletBalance = async (userId: string, inputMint: string) => {
  const wallet = await Wallet.findOne({
    attributes: ['id', 'parentId', 'confirmedBalance', 'address'],
    where: Sequelize.and(
      {userId},
      Sequelize.where(
        Sequelize.fn('LOWER', Sequelize.col('token.contract_address')),
        inputMint.toLowerCase() // * TODO for SOL do we do this? yes in WSOL we have contract set to 'So11111111111111111111111111111111111111112'
      )
    ),
    include: [
      {
        attributes: [
          'name',
          'title',
          'symbol',
          'unitDecimals',
          'contract_address',
          'decimalsToShow',
        ],
        model: Token,
        as: 'token',
        required: true,
      },
    ],
    raw: true,
    nest: true,
  });

  if (!wallet) throw new Error(`${LOG_PREFIX}Wallet not found.`);

  wallet.confirmedBalance = new BigNumber(wallet.confirmedBalance)
    .div(new BigNumber(10).pow(wallet.token!.unitDecimals))
    .toString();

  return wallet;
};

export const isMintAuthorityRevoked = async (
  connection: anchor.web3.Connection,
  mint: PublicKey
) => {
  try {
    const info = await connection.getAccountInfo(mint, 'finalized');
    if (!info) throw new splToken.TokenAccountNotFoundError();

    const isMintAccount =
      info.owner.equals(splToken.TOKEN_PROGRAM_ID) ||
      info.owner.equals(splToken.TOKEN_2022_PROGRAM_ID);
    const hasValidSize = info.data.length >= splToken.MINT_SIZE;

    if (!isMintAccount || !hasValidSize) {
      throw new splToken.TokenInvalidAccountSizeError();
    }

    const rawMint = splToken.MintLayout.decode(
      info.data.slice(0, splToken.MINT_SIZE)
    );
    return rawMint.mintAuthority === null;
  } catch (e) {
    console.log(e);
    throw e;
  }
};

async function getMint(connection: Connection, mint: PublicKey) {
  if (mint.equals(WRAPPED_SOL_MINT)) {
    return {decimals: 9, owner: splToken.TOKEN_PROGRAM_ID};
  }

  const accountInfo = await connection.getAccountInfo(mint);
  if (accountInfo === null) {
    throw new Error('mint not found');
  }

  const mintAccount = splToken.MintLayout.decode(accountInfo.data);

  return {...mintAccount, owner: accountInfo.owner};
}
