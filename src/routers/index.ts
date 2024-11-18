/**
 * Defines endpoint URLs
 */

import {Router} from 'express';
import DefaultController from './default';
import v1Router from './v1';

const router = Router();

router.use('/v1', v1Router);

router.get('*', DefaultController.get);

export default router;
