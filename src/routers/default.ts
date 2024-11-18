/**
 * Defines default behavior when requested endpoint not exists
 */

import { NextFunction, Request, Response } from 'express';

class DefaultController {
  public static get(req: Request, res: Response, next: NextFunction): void {
    res.send('404 not found');
    next();
  }
}

export default DefaultController;
