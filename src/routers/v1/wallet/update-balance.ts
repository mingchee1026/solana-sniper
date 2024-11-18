/**
 * Defines updating user default wallet's assets
 */

import {Request, Response, NextFunction} from 'express';
import {Joi} from 'express-validation';
import {Network, Token, User, Wallet} from '../../../database';
import * as userUtils from '../user/utils';

const LOG_PREFIX = 'WALLET: ';

const HeliusURL = process.env.HELIUS_URL || '';

export const updateBalance = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {telegramId} = req.body;

    // TODO add cache for multi request

    const user = await User.findOne({
      where: {
        telegramId,
      },
    });

    if (!user) {
      throw new Error(`${LOG_PREFIX}Provided user does not found.`);
    }
    if (!user.defaultWalletId) {
      throw new Error(
        `${LOG_PREFIX}Provided user does not have a default wallet.`
      );
    }

    // TODO unconfirmed

    const wallet = await Wallet.findOne({
      where: {
        id: user.defaultWalletId,
      },
    });

    if (!wallet) {
      throw new Error(`${LOG_PREFIX}Provided wallet does not found.`);
    }

    const balances = await getAssetsWithNativeBalance(wallet.address);

    const promises = [];
    for (const token of balances.items) {
      if (token.interface === 'FungibleToken') {
        promises.push(
          updateOrCreateWalletBalance(
            token.token_info.associated_token_address, // ataAddress
            token.token_info.balance.toString(), // newBalance
            user.id,
            wallet.id,
            wallet.keyId,
            wallet.tokenId, // parentTokenId
            token.content.metadata.name, // tokenName
            token.content.metadata.symbol, // tokenSymbol
            token.id, // contractAddress
            token.token_info.token_program, // tokenProgramAddress
            token.token_info.decimals // tokenDecimals
          )
        );
      }
    }

    // handle native token
    promises.push(
      Wallet.update(
        {
          confirmedBalance: balances.nativeBalance.lamports.toString(),
        },
        {
          where: {
            id: wallet.id,
          },
          returning: false,
        }
      )
    );

    await Promise.all(promises);

    const wallets = await userUtils.getUserAssets(wallet.id);

    res.json({
      success: true,
      result: wallets,
    });
  } catch (e) {
    next(e);
  }
};

export const getAssetsWithNativeBalance = async (walletAddress: string) => {
  const response = await fetch(HeliusURL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: '1',
      method: 'getAssetsByOwner',
      params: {
        ownerAddress: walletAddress,
        displayOptions: {
          showUnverifiedCollections: false,
          showCollectionMetadata: false,
          showGrandTotal: false,
          showRawData: false,
          requireFullIndex: false,
          showSystemMetadata: false,
          showZeroBalance: false,
          showClosedAccounts: false,
          showFungible: true,
          showNativeBalance: true,
        },
      },
    }),
  });

  const {result} = await response.json();

  return result;
};

const updateOrCreateWalletBalance = async (
  ataAddress: string,
  newBalance: string,
  userId: string,
  solanaWalletId: string,
  solanaKeyId: string,
  solanaTokenId: string,
  tokenName: string,
  tokenSymbol: string,
  contractAddress: string,
  tokenProgramAddress: string,
  tokenDecimals: number
) => {
  const wallet = await Wallet.findOne({
    where: {
      address: ataAddress,
    },
    raw: true,
  });

  if (wallet) {
    await Wallet.update(
      {
        confirmedBalance: newBalance,
      },
      {
        where: {
          address: ataAddress,
        },
        returning: false,
      }
    );
  } else {
    const network = await Network.findOne({
      attributes: ['id'],
      where: {
        name: 'solana', // ! for now we only support Solana
      },
    });
    if (!network) throw new Error('network not supported');

    let newToken = await Token.findOne({
      where: {
        contractAddress,
      },
      raw: true,
    });
    if (!newToken) {
      newToken = await Token.create({
        networkId: network.id,
        parentId: solanaTokenId,
        name: tokenName.toLowerCase(),
        title: tokenName,
        symbol: tokenSymbol,
        contractAddress,
        tokenProgramAddress,
        unitName: 'NA',
        unitDecimals: tokenDecimals,
        decimalsToShow: 2, // for now we show tokens up to two decimal points
        isWithdrawEnabled: true,
        withdrawCommission: '0',
        withdrawMin: '0',
        withdrawMax: '0',
        status: 'active',
      });
    }

    await Wallet.create({
      userId,
      parentId: solanaWalletId,
      tokenId: newToken.id,
      keyId: solanaKeyId,
      address: ataAddress,
      confirmedBalance: newBalance,
      unconfirmedBalance: '0',
      status: 'active',
    });
  }
};

export const updateBalanceValidator = {
  body: Joi.object({
    telegramId: Joi.string().required(),
  }),
};
