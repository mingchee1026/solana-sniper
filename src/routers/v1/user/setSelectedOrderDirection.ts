import {Request, Response, NextFunction} from 'express';
import {Joi} from 'express-validation';
import * as userUtils from './utils';

const LOG_PREFIX = 'USER: ';

/**
 * Sets the user's selected order direction (buy or sell) for a swap transaction.
 *
 * This function handles setting the order direction (buy or sell) for a user's transaction.
 * It updates the user's selected order direction and performs additional actions depending
 * on the selected direction. If the order is a buy order, it does not retrieve assets.
 * But if the order is a sell order, it retrieves the user's assets from their default wallet.
 * And sends them to UI so that the user can select which one he/she prefers to sell.
 *
 * The function also adjusts slippage values for UI representation and returns relevant user data
 * and assets required by the client.
 *
 * @param {Request} req - The Express request object containing the user's Telegram ID and order direction in the body.
 * @param {Response} res - The Express response object used to send the response back to the client.
 * @param {NextFunction} next - The Express next middleware function used to handle errors.
 *
 * @returns {Promise<Response>} Returns a JSON response containing:
 *   - `success` (boolean): Indicates successful processing of the order direction.
 *   - `result` (object): Includes:
 *     - `assets` (array): The user's assets if the order is "sell", otherwise an empty array.
 *     - `user` (object): The updated user object with the selected order direction.
 */
export const setSelectedOrderDirection = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {telegramId, orderDirection} = req.body;
    // ------------------------ Retrieve the user by Telegram ID ------------------------ //
    const user = await userUtils.getUser(telegramId);
    // --------------------------------------- END -------------------------------------- //
    // --------------------------- Set user order direction ----------------------------- //
    user.selectedOrderDirection = orderDirection;
    // --------------------------------------- END -------------------------------------- //
    // -------- Update user's changes and get other data for UI representation ---------- //
    const [assets] =
      user.selectedOrderDirection === 'buy'
        ? await Promise.all([[], user.save()])
        : await Promise.all([
            userUtils.getUserAssets(user.defaultWalletId!),
            user.save(),
          ]);

    // ! don't update this. this is for ui to show slippage percent instead of basis points
    user.selectedSlippage /= 100;

    return res.json({
      success: true,
      result: {
        assets,
        user,
      },
    });
    // --------------------------------------- END -------------------------------------- //
  } catch (e) {
    next(e);
  }
};

export const setSelectedOrderDirectionValidator = {
  body: Joi.object({
    telegramId: Joi.string().required(),
    orderDirection: Joi.string().required().valid('buy', 'sell'),
  }),
};
