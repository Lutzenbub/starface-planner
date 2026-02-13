import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors.js';

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

export const csrfProtection = (csrfToken: string) => (req: Request, _res: Response, next: NextFunction) => {
  if (safeMethods.has(req.method.toUpperCase())) {
    next();
    return;
  }

  const providedToken = req.header('x-csrf-token');
  if (!providedToken || providedToken !== csrfToken) {
    next(new AppError('CSRF_TOKEN_INVALID', 'Ungueltiger CSRF-Token', 403));
    return;
  }

  next();
};
