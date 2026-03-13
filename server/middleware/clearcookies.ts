import { Request, Response, NextFunction } from 'express';

export function clearCookies(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (
    req.path.startsWith('/api/') &&
    !req.session?.userId &&
    req.cookies?.['connect.sid']
  ) {
    res.clearCookie('connect.sid');
  }
  next();
}
