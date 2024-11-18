/**
 * Defines create on chain swap entry in database
 */

import {Request, Response, NextFunction} from 'express';
import {Market, OnChainSwap} from '../../../database';
import {Joi} from 'express-validation';

const LOG_PREFIX = 'ON_CHAIN_SWAP: ';

export const create = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      poolAddress,
      time,
      liquidityType,
      nativeAmountSum,
      tokenAmountSum,
      spent,
      price,
      nativePrice,
      newMC,
      from,
      typeSwap,
    } = req.body;

    const market = await Market.findOne({
      where: {
        poolAddress,
      },
      raw: true,
      nest: true,
    });

    if (market === null || market === undefined) {
      throw new Error(`${LOG_PREFIX}Provided market does not found.`);
    }

    OnChainSwap.create(
      // ! we don't use await here, so the socket can be closed faster for more throughput in data
      // TODO but, becareful about uncaught error
      {
        time,
        marketId: market.id,
        liquidityType,
        nativeAmountSum,
        tokenAmountSum,
        spent,
        price,
        nativePrice,
        newMC,
        from,
        typeSwap,
      },
      {returning: false}
    );

    res.json({success: true});
  } catch (e) {
    next(e);
  }
};

export const createValidator = {
  body: Joi.object({
    poolAddress: Joi.string().required(),
    time: Joi.string().required(),
    liquidityType: Joi.string().required().valid('NONE', 'ADDED', 'REMOVED'),
    nativeAmountSum: Joi.string().required(),
    tokenAmountSum: Joi.string().required(),
    spent: Joi.string().required(),
    price: Joi.string().required(),
    nativePrice: Joi.string().required(),
    newMC: Joi.string().required(),
    from: Joi.string().required(),
    typeSwap: Joi.string().required().valid('buy', 'sell'),
  }),
};
