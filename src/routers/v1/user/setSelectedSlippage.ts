import {Request, Response, NextFunction} from 'express';
import {Joi} from 'express-validation';
import * as userUtils from './utils';
import {NATIVE_MINT} from '@solana/spl-token';

const LOG_PREFIX = 'USER: ';

/**
 * Sets the user's selected slippage tolerance for a swap transaction.
 * ! We store slippage as bps in the database: 1 ~ 0.0001, means 100% ~ 0.01%
 *
 * This function updates the slippage tolerance for a user's transaction and
 * retrieves necessary information to UI.
 * It converts the slippage percentage to basis points for computational consistency and
 * adjusts the values for UI purposes before sending the response.
 *
 * Depending on the user's order direction, includes profit and loss calculations for sell orders.
 * Or in the case of buy orders it returns null for pnl output.
 *
 * Key operations include checking user's existence and checking the required fields have been set,
 * updating slippage, fetching related market and pool information, and adjusting UI-related fields
 *
 * @param {Request} req - The Express request object containing the user's Telegram ID and slippage percentage in the body.
 * @param {Response} res - The Express response object used to send the response back to the client.
 * @param {NextFunction} next - The Express next middleware function used to handle errors.
 *
 * @returns {Promise<Response>} Returns a JSON response containing:
 *   - `success` (boolean): Indicates successful processing of the slippage setting.
 *   - `result` (object): Includes:
 *     - `poolInfo` (object): Information about the pool related to the transaction.
 *     - `isRevoked` (boolean): Indicates if the market is revoked.
 *     - `user` (object): The updated user object reflecting the new slippage.
 *     - `wallet` (object): The user's wallet balance.
 *     - `pnl` (object): In 'buy' orders it is null, PnL is for PnL calculations of the current order.
 * @throws {Error} Throws an error if user fields are not set correctly.
 */
export const setSelectedSlippage = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {telegramId, slippage} = req.body;
    // ---------------------------- Retrieve the user by Telegram ID ---------------------------- //
    const user = await userUtils.getUser(telegramId);
    // Ensure necessary fields are set
    if (
      !user.selectedPoolAddress ||
      !user.selectedInputMint ||
      !user.selectedOutputMint
    )
      throw new Error(`${LOG_PREFIX}User fields not set.`);
    // ------------------------------------------- END ------------------------------------------ //
    // ------------------------- Set user slippage and update it in DB -------------------------- //
    user.selectedSlippage = Math.trunc(slippage * 100); // we keep it in basis points in DB
    await user.save();
    // ------------------------------------------- END ------------------------------------------ //
    // ------------------- Fetch market, pool, wallet, and PnL to show in UI ------------------- //
    const [market, poolInfo, wallet] = await Promise.all([
      userUtils.getMarketByPoolAddress(user.selectedPoolAddress),
      userUtils.getPoolInfoByPoolAddress(user.selectedPoolAddress),
      userUtils.getWalletBalance(user.id, user.selectedInputMint),
    ]);

    const pnl =
      user.selectedOrderDirection === 'sell'
        ? await userUtils.getCurrentPnL(wallet.id)
        : null;

    // ! don't update this. this is for ui to show slippage percent instead of basis points
    user.selectedSlippage /= 100;

    return res.json({
      success: true,
      result: {
        ...poolInfo,
        isRevoked: market.isRevoked,
        user,
        wallet,
        pnl,
      },
    });
    // ------------------------------------------- END ------------------------------------------ //
  } catch (e) {
    next(e);
  }
};

export const setSelectedSlippageValidator = {
  body: Joi.object({
    telegramId: Joi.string().required(), // TODO check correct slippage
    slippage: Joi.number()
      .min(0) // Minimum 0%
      .max(100) // Maximum 100%
      .required()
      .messages({
        'number.min': 'Slippage must be at least 0%',
        'number.max': 'Slippage must be at most 100%',
      })
      .required(),
  }),
};
