import {Request, Response, NextFunction} from 'express';
import {Joi} from 'express-validation';
import BigNumber from 'bignumber.js';
import * as userUtils from './utils';
import {computeAmountOut} from '../../../price';

const LOG_PREFIX = 'USER: ';

/**
 * Get desired amount of SOL as input from user and changes the user's input amount for a transaction and estimates the output amount.
 *
 * This function performs several operations:
 * 1. Retrieves user data using the provided Telegram ID.
 * 2. Validates necessary user fields required to set input amount.
 * 3. Fetches market and pool information to obtain the current price of Non SOL Token of this pair.
 * 4. Updates the user's selected input amount and Non SOL Token USD price.
 * 5. Computes and sets the estimated output amount based on the input.
 * 6. Saves changes to the user data and retrieves the required data for UI representation.
 *
 * ! It should be called only when the order is in 'buy' mode, otherwise the setSelectedSellPercent function should be called.
 *
 * @param {Request} req - The Express request object containing the user's Telegram ID and the input amount in the body.
 * @param {Response} res - The Express response object used to send the response back to the client.
 * @param {NextFunction} next - The Express next middleware function used to handle errors.
 *
 * @returns {Promise<Response>} Returns a JSON response containing:
 *   - `success` (boolean): Indicates successful processing of the input amount.
 *   - `result` (object): Includes:
 *     - `isRevoked` (boolean): Indicates if the market is revoked.
 *     - `user` (object): The user object containing updated transaction details.
 *     - `wallet` (object): The user's wallet balance.
 *     - `pnl` (object): In 'buy' orders it is null, PnL is for PnL calculations of the current order.
 * @throws {Error} Throws an error if user fields are not set or if the order direction is incorrect.
 */
export const setSelectedLimitInAmount = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {telegramId, amount} = req.body;
    // ------------------------ Retrieve the user by Telegram ID ------------------------ //
    const user = await userUtils.getUser(telegramId);
    // Ensure necessary fields are set and order direction is "buy"
    if (
      !user.selectedPoolAddress ||
      !user.selectedInputMint ||
      !user.selectedOutputMint
    )
      throw new Error(`${LOG_PREFIX}User fields not set.`);

    if (user.selectedOrderType !== 'limit')
      throw new Error(`${LOG_PREFIX}Can set in amount only in limit order.`);
    // --------------------------------------- END -------------------------------------- //
    // ----------- Fetch market and pool information from user's selected pool ---------- //
    const [market, poolInfo] = await Promise.all([
      userUtils.getMarketByPoolAddress(user.selectedPoolAddress),
      userUtils.getPoolInfoByPoolAddress(user.selectedPoolAddress),
    ]);
    // --------------------------------------- END -------------------------------------- //
    // -------- Update user limit order inAmount and current price of the non SOL token --------- //
    user.selectedInputAmount = amount;
    /**
     * One of out pairs involved in the swap is SOL and the other token is called <Non Sol Token>.
     * Here we are storing Non Sol Token price in USD
     */
    user.selectedTokenUsdPrice = poolInfo.priceUsd;
    // --------------------------------------- END -------------------------------------- //
    // ------------- Compute estimated output amount based on user's input -------------- //
    const estimatedAmountOut = await computeAmountOut(
      `${poolInfo.dexId.toLowerCase()}_${poolInfo.labels[0].toLowerCase()}`,
      user.selectedPoolAddress,
      user.selectedInputMint,
      user.selectedOutputMint,
      amount
    );

    /**
     * Now we will scale the raw output amount into the UI format.
     * For example estimatedAmountOut will give the output in lamports and we should convert it to SOL
     */
    user.selectedEstimatedOutput = new BigNumber(
      estimatedAmountOut.out.toString()
    )
      .div(new BigNumber(10).pow(estimatedAmountOut.outputDecimalPoints))
      .toString();
    // --------------------------------------- END -------------------------------------- //
    // -------- Update user's changes and get other data for UI representation ---------- //
    const [wallet] = await Promise.all([
      userUtils.getWalletBalance(user.id, user.selectedInputMint),
      user.save(),
    ]);

    // ! don't update this. this is for ui to show slippage percent instead of basis points
    user.selectedSlippage /= 100;

    return res.json({
      success: true,
      result: {
        ...poolInfo,
        isRevoked: market.isRevoked,
        user,
        wallet,
        pnl: null,
      },
    });
    // --------------------------------------- END -------------------------------------- //
  } catch (e) {
    next(e);
  }
};

export const setSelectedLimitInAmountValidator = {
  body: Joi.object({
    telegramId: Joi.string().required(),
    amount: Joi.string().required(),
  }),
};
