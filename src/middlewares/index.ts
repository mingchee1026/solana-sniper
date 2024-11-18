/**
 * Register Express middlewares
 */

import {Application} from 'express';
import ErrorHandler from './error-handler';

/**
 * Class responsible for registering Express middlewares.
 */
class Middleware {
  /**
   * Initializes and mounts middlewares that should be set up before other routes.
   *
   * @param {Application} expressApp - The Express application instance.
   * @returns {Application} - The Express application instance with pre-route middlewares initialized.
   */
  public static initBefore(expressApp: Application): Application {
    return expressApp;
  }

  /**
   * Initializes and mounts middlewares after all other routes.
   * Primarily used for error handling middleware.
   *
   * @param {Application} expressApp - The Express application instance.
   * @returns {Application} - The Express application instance with post-route middlewares initialized.
   */
  public static initAfter(expressApp: Application): Application {
    // Mount error handling middleware
    expressApp = ErrorHandler.mount(expressApp);

    return expressApp;
  }
}

export default Middleware;
