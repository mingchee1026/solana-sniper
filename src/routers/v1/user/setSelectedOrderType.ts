import {Request, Response, NextFunction} from 'express';
import {Joi} from 'express-validation';
import * as userUtils from './utils';

const LOG_PREFIX = 'USER: ';

/**
 * Sets the user's selected order type (swap or limit or dca) for a swap transaction.
 *
 * This function is responsible for maintaining the state of the user's chosen order type.
 * Depending on the user's order direction, includes profit and loss calculations for sell orders.
 * Or in the case of buy orders it returns null for pnl output.
 *
 * Key operations include checking user's existence and checking the required fields have been set,
 * updating the order type, fetching related market and pool information,
 * and adjusting UI-related fields. The function returns a
 * response including updated user data and other relevant market details.
 *
 * @param {Request} req - The Express request object containing the user's Telegram ID and order type in the body.
 * @param {Response} res - The Express response object used to send the response back to the client.
 * @param {NextFunction} next - The Express next middleware function used to handle errors.
 *
 * @returns {Promise<Response>} Returns a JSON response containing:
 *   - `success` (boolean): Indicates successful processing of setting the specified order type.
 *   - `result` (object): Includes:
 *     - `poolInfo` (object): Information about the current pool related to the order.
 *     - `isRevoked` (boolean): Indicates if the market is revoked.
 *     - `user` (object): The updated user object with the selected order type.
 *     - `wallet` (object): The user's wallet balance information.
 *     - `pnl` (object): In 'buy' orders it is null, PnL is for PnL calculations of the current order.
 * @throws {Error} Throws an error if required user fields are not set.
 */
export const setSelectedOrderType = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {telegramId, orderType} = req.body;
    // ------------------------ Retrieve the user by Telegram ID ------------------------ //
    const user = await userUtils.getUser(telegramId);
    // Ensure necessary fields are set
    if (
      !user.selectedPoolAddress ||
      !user.selectedInputMint ||
      !user.selectedOutputMint
    )
      throw new Error(`${LOG_PREFIX}User fields not set.`);
    // --------------------------------------- END -------------------------------------- //
    // ------------------------------ Set user order type ------------------------------- //
    user.selectedOrderType = orderType;
    // --------------------------------------- END -------------------------------------- //
    // -------- Update user's changes and get other data for UI representation ---------- //
    const [market, poolInfo, wallet] = await Promise.all([
      userUtils.getMarketByPoolAddress(user.selectedPoolAddress),
      userUtils.getPoolInfoByPoolAddress(user.selectedPoolAddress),
      userUtils.getWalletBalance(user.id, user.selectedInputMint),
      user.save(),
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
    // --------------------------------------- END -------------------------------------- //
  } catch (e) {
    next(e);
  }
};

export const setSelectedOrderTypeValidator = {
  body: Joi.object({
    telegramId: Joi.string().required(),
    orderType: Joi.string().required().valid('swap', 'limit', 'dca'),
  }),
};
