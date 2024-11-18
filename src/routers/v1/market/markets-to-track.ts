/**
 * Defines get market (pool) info
 */

import {Request, Response, NextFunction, query} from 'express';
import {Market} from '../../../database';

const LOG_PREFIX = 'MARKET: ';

export const marketsToTrack = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const markets = await Market.findAll({
      attributes: ['poolAddress'],
      raw: true,
    });

    res.json({
      success: true,
      result: {
        markets: markets,
      },
    });
  } catch (e) {
    next(e);
  }
};
