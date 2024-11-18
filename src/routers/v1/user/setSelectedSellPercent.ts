import {Request, Response, NextFunction} from 'express';
import {Joi} from 'express-validation';
import BigNumber from 'bignumber.js';
import * as userUtils from './utils';
import {computeAmountOut} from '../../../price';
import {NATIVE_MINT} from '@solana/spl-token';

const LOG_PREFIX = 'USER: ';

/**
 * Sets the percentage of user's asset to be sold for a swap transaction.
 *
 * This function is used to specify the percentage of a user's token they wish to sell.
 * It checks necessary conditions and computes estimated output and profit/loss analysis.
 *
 * This function performs several operations:
 * 1. Retrieves user data using the provided Telegram ID.
 * 2. Validates necessary user fields required to set sell amount.
 * 3. Fetches market, pool, and wallet information to obtain the current price of Non SOL Token of this pair.
 * 4. Updates the user's selected sell percent and its equivalent sell amount, and Non SOL Token USD price.
 * 5. Computes and sets the estimated output amount based on the sell amount.
 * 6. Saves changes to the user data and retrieves the required data for UI representation.
 *
 * Key actions include fetching user and wallet data, validating that the user is in sell mode,
 * calculating the sell amount from wallet balance, estimating output amounts in USD,
 * and managing the user's state updates.
 *
 * ! It should be called only when the order is in 'sell' mode, otherwise the setSelectedInputAmount function should be called.
 *
 * @param {Request} req - The Express request object, containing `telegramId` and `percent` in the body.
 * @param {Response} res - The Express response object used to send back JSON data.
 * @param {NextFunction} next - The Express next middleware function for handling errors.
 *
 * @returns {Promise<Response>} A JSON response containing:
 *   - `success` (boolean): Indicates successful processing of the sell percentage setting.
 *   - `result` (object): Includes:
 *     - `poolInfo` (object): Information about the trading pool.
 *     - `isRevoked` (boolean): Indicates if the market has been revoked.
 *     - `user` (object): Updated user information with new sell percentage and estimated outputs.
 *     - `wallet` (object): User's current wallet balance.
 *     - `pnl` (object): In 'buy' orders it is null, PnL is for PnL calculations of the current order.
 * @throws {Error} Throws an error if not in sell mode or required user fields are missing.
 */
export const setSelectedSellPercent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {telegramId, percent} = req.body;
    // ------------------------ Retrieve the user by Telegram ID ------------------------ //
    const user = await userUtils.getUser(telegramId);
    // Ensure necessary fields are set and order direction is "sell"
    if (
      !user.selectedPoolAddress ||
      !user.selectedInputMint ||
      !user.selectedOutputMint
    )
      throw new Error(`${LOG_PREFIX}User fields not set.`);

    if (user.selectedOrderDirection !== 'sell')
      throw new Error(
        `${LOG_PREFIX}Can set sell percent amount only in sell mode.`
      );
    // --------------------------------------- END -------------------------------------- //
    // ------ Fetch market, pool, and wallet information from user's selected pool ------ //
    const [market, poolInfo, wallet] = await Promise.all([
      userUtils.getMarketByPoolAddress(user.selectedPoolAddress),
      userUtils.getPoolInfoByPoolAddress(user.selectedPoolAddress),
      userUtils.getWalletBalance(user.id, user.selectedInputMint),
    ]);
    // --------------------------------------- END -------------------------------------- //
    // -------- Update user sell amount and current price of the non SOL token ---------- //
    /**
     * One of out pairs involved in the swap is SOL and the other token is called <Non Sol Token>.
     * Here we are storing Non Sol Token price in USD
     */
    user.selectedSellPercent = percent;
    user.selectedTokenUsdPrice = poolInfo.priceUsd;

    /**
     * Calculates and sets the amount of tokens to sell based on percentage specified by user
     */
    const inputAmount = new BigNumber(wallet.confirmedBalance)
      .multipliedBy(user.selectedSellPercent)
      .div(100) // 100 because of converting percentage
      .toFixed(wallet.token?.unitDecimals!, BigNumber.ROUND_DOWN);
    user.selectedSellAmount = inputAmount;
    // --------------------------------------- END -------------------------------------- //
    // ------- Compute estimated output amount based on amount of selling tokens -------- //
    const estimatedAmountOut = await computeAmountOut(
      `${poolInfo.dexId.toLowerCase()}_${poolInfo.labels[0].toLowerCase()}`,
      user.selectedPoolAddress,
      user.selectedInputMint,
      user.selectedOutputMint,
      inputAmount
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
    const [pnl] = await Promise.all([
      userUtils.getCurrentPnL(wallet.id),
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
        pnl,
      },
    });
    // --------------------------------------- END -------------------------------------- //
  } catch (e) {
    next(e);
  }
};

export const setSelectedSellPercentValidator = {
  body: Joi.object({
    telegramId: Joi.string().required(),
    percent: Joi.number()
      .greater(0) // Bigger than 0%
      .max(100) // Maximum 100%
      .required()
      .messages({
        'number.min': 'Percent must be bigger than 0%',
        'number.max': 'Percent must be at most 100%',
      })
      .required(),
  }),
};
