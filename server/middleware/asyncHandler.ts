import { Request, Response, NextFunction } from 'express';

/**
 * Wraps an async route handler to catch unhandled promise rejections
 * and forward them to Express error handling middleware.
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
