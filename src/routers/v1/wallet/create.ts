/**
 * Defines create wallet
 */

import bs58 from 'bs58';
import {Request, Response, NextFunction} from 'express';
import {Joi} from 'express-validation';
import {Token, db, Key, Network, User, Wallet} from '../../../database';
import {Keypair} from '@solana/web3.js';

const LOG_PREFIX = 'WALLET: ';

export const create = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {telegramId} = req.body;

    const user = await User.findOne({
      where: {
        telegramId,
      },
    });

    if (user === null || user === undefined) {
      throw new Error(`${LOG_PREFIX}Provided user does not found.`);
    }

    const solanaToken = await Token.findOne({
      attributes: ['id'],
      where: {
        parentId: null,
      },
      include: [
        {
          model: Network,
          as: 'network',
          where: {
            name: 'solana', // TODO bugggg check this
          },
        },
      ],
      raw: true,
      nest: true,
    });
    if (!solanaToken) {
      throw new Error(`${LOG_PREFIX}Solana token does not found.`);
    }

    const keypair = Keypair.generate();

    await db.sequelize.transaction(async transaction => {
      const key = await Key.create(
        {
          userId: user.id,
          publicKey: keypair.publicKey.toBase58(), // TODO
          privateKey: bs58.encode(keypair.secretKey),
          algorithm: 'ecdsa', // TODO
          status: 'active',
        },
        {transaction}
      );
      // TODO we don't create wallet for all pairs, instead we will create them on the fly when user is swapping.
      const wallet = await Wallet.create(
        {
          userId: user.id,
          parentId: null,
          tokenId: solanaToken.id,
          keyId: key.id,
          address: keypair.publicKey.toBase58(),
          confirmedBalance: '0',
          unconfirmedBalance: '0',
          status: 'active',
        },
        {transaction}
      );

      await User.update(
        {
          defaultWalletId: wallet.id,
        },
        {
          where: {
            id: user.id,
          },
          transaction,
        }
      );
    });

    res.json({
      success: true,
      result: {
        publicKey: keypair.publicKey.toBase58(),
        privateKey: bs58.encode(keypair.secretKey),
      },
    });
  } catch (e) {
    next(e);
  }
};

export const createValidator = {
  body: Joi.object({
    telegramId: Joi.string().required(),
  }),
};
