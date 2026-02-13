import type { NextFunction, Request, Response } from 'express';

export const requestTimeout = (timeoutMs: number) => (req: Request, res: Response, next: NextFunction) => {
  req.setTimeout(timeoutMs);
  res.setTimeout(timeoutMs);
  next();
};
