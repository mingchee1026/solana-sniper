/**
 * Defines endpoint URLs
 */

import {Router} from 'express';
import {validate} from 'express-validation';
import * as orderHandler from './order';
import * as marketHandler from './market';
import * as walletHandler from './wallet';
import * as onChainSwapHandler from './on-chain-swap';
import * as userHandler from './user';

const router = Router();

router.post(
  '/order/swap/new',
  validate(orderHandler.createValidator),
  orderHandler.create
);

router.post(
  '/order/limit',
  validate(orderHandler.createValidator),
  orderHandler.createLimit
);

router.post(
  '/order/dca',
  validate(orderHandler.createValidator),
  orderHandler.createDCA
);

// router.post(
//   '/order/track/transaction',
//   validate(orderHandler.checkConfirmationValidator),
//   orderHandler.checkConfirmation
// );

router.post(
  '/wallet/generate',
  validate(walletHandler.createValidator),
  walletHandler.create
);
router.post(
  '/wallet/setDefault',
  validate(walletHandler.setDefaultWalletValidator),
  walletHandler.setDefaultWallet
);
router.post(
  '/wallet/updateBalance',
  validate(walletHandler.updateBalanceValidator),
  walletHandler.updateBalance
);

router.get('/market/toTrack', marketHandler.marketsToTrack);

router.post(
  '/onChainSwap/new',
  validate(onChainSwapHandler.createValidator),
  onChainSwapHandler.create
);

router.post(
  '/user/create',
  validate(userHandler.createValidator),
  userHandler.create
);
router.post(
  '/user/setOrderDirection',
  validate(userHandler.setSelectedOrderDirectionValidator),
  userHandler.setSelectedOrderDirection
);
router.post(
  '/user/setOrderType',
  validate(userHandler.setSelectedOrderTypeValidator),
  userHandler.setSelectedOrderType
);
router.post(
  '/user/setInputAmount',
  validate(userHandler.setSelectedInputAmountValidator),
  userHandler.setSelectedInputAmount
);
router.post(
  '/user/setSellPercent',
  validate(userHandler.setSelectedSellPercentValidator),
  userHandler.setSelectedSellPercent
);
router.post(
  '/user/setOutputMint',
  validate(userHandler.setSelectedOutputMintValidator),
  userHandler.setSelectedOutputMint
);
router.post(
  '/user/setSlippage',
  validate(userHandler.setSelectedSlippageValidator),
  userHandler.setSelectedSlippage
);
// Limit Order
router.post(
  '/user/setLimitInAmount',
  validate(userHandler.setSelectedLimitInAmountValidator),
  userHandler.setSelectedLimitInAmount
);
router.post(
  '/user/setLimitOutAmount',
  validate(userHandler.setSelectedLimitOutAmountValidator),
  userHandler.setSelectedLimitOutAmount
);
// DCA Order
router.post(
  '/user/setDCAInAmount',
  validate(userHandler.setSelectedDCAInAmountValidator),
  userHandler.setSelectedDCAInAmount
);
router.post(
  '/user/setDCAInAmountPerCycle',
  validate(userHandler.setSelectedDCAInAmountPerCycleValidator),
  userHandler.setSelectedDCAInAmountPerCycle
);
router.post(
  '/user/setDCACycleSecondsApart',
  validate(userHandler.setSelectedDCACycleSecondsApartValidator),
  userHandler.setSelectedDCACycleSecondsApart
);

export default router;
