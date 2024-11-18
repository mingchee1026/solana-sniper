/**
 * Defines setting default wallet for a user
 */

import bs58 from 'bs58';
import {Request, Response, NextFunction} from 'express';
import {Joi} from 'express-validation';
import {User, Wallet} from '../../../database';
import {Keypair} from '@solana/web3.js';

const LOG_PREFIX = 'WALLET: ';

export const setDefaultWallet = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {telegramId, walletAddress} = req.body;

    const user = await User.findOne({
      where: {
        telegramId,
      },
    });

    if (user === null || user === undefined) {
      throw new Error(`${LOG_PREFIX}Provided user does not found.`);
    }

    const wallet = await Wallet.findOne({
      where: {
        userId: user.id,
        parentId: null,
        address: walletAddress,
      },
    });

    if (wallet === null || wallet === undefined) {
      throw new Error(`${LOG_PREFIX}Provided wallet does not found.`);
    }

    user.defaultWalletId = wallet.id;
    user.save();

    res.json({
      success: true,
    });
  } catch (e) {
    next(e);
  }
};

export const setDefaultWalletValidator = {
  body: Joi.object({
    telegramId: Joi.string().required(),
    walletAddress: Joi.string().required(),
  }),
};
