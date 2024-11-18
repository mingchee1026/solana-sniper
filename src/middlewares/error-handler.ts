/**
 * Defines all error handling behavior of the App
 */

import {Application, Request, Response, NextFunction} from 'express';
import {ValidationError} from 'express-validation';

/**
 * Class responsible for defining all error handling behavior of the application.
 */
class ErrorHandler {
  /**
   * Mounts the error handling middleware on the Express application. It is the entry point of throwed errors.
   *
   * Currently it is not fully developed but it is an entry point for a centralized error handling.
   *
   * This middleware captures all errors thrown in the application, including
   * validation errors, and formats them into consistent HTTP responses.
   * It logs the error details for debugging purposes.
   *
   * @param {Application} _express - The Express application instance.
   * @returns {Application} - The Express application instance with error handling middleware mounted.
   */
  public static mount(_express: Application): Application {
    _express.use(
      (err: Error, req: Request, res: Response, next: NextFunction) => {
        console.log(err);

        // Handles validation errors specifically
        if (err instanceof ValidationError) {
          return res.status(err.statusCode).json(err);
        }

        // next(); // ! we should comment this (not use this), or we get <Error [ERR_HTTP_HEADERS_SENT]: Cannot set headers after they are sent to the client>
        // For all other errors, return a generic 500 Internal Server Error response
        return res.status(500).json({
          success: false,
          error: {name: err.name, message: err.message, stack: err.stack},
        });
      }
    );
    return _express;
  }
}

export default ErrorHandler;
