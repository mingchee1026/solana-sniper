/**
 * Defines creating a user
 */

import {Request, Response, NextFunction} from 'express';
import {Joi} from 'express-validation';
import {User} from '../../../database';

const LOG_PREFIX = 'USER: ';

export const create = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {telegramId, username, firstName, lastName} = req.body;

    let user = await User.findOne({
      where: {telegramId},
    });
    if (user)
      return res.json({
        success: true,
        result: {
          err: 'user with this telegram id already exists.',
        },
      });

    user = await User.create({
      telegramId,
      username,
      firstName,
      lastName,
    } as any);

    return res.json({
      success: true,
      result: {
        user,
      },
    });
  } catch (e) {
    next(e);
  }
};

export const createValidator = {
  body: Joi.object({
    telegramId: Joi.string().required(),
    username: Joi.string(),
    firstName: Joi.string(),
    lastName: Joi.string(),
  }),
};
