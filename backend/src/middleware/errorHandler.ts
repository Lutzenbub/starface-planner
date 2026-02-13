import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError, isAppError } from '../errors.js';

const formatZodIssues = (error: ZodError) =>
  error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));

export const notFoundHandler = (_req: Request, res: Response): void => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Route nicht gefunden',
    },
  });
};

export const errorHandler = (error: unknown, _req: Request, res: Response, _next: NextFunction): void => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validierung fehlgeschlagen',
        details: formatZodIssues(error),
      },
    });
    return;
  }

  if (isAppError(error)) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    });
    return;
  }

  const fallback = new AppError('INTERNAL_ERROR', 'Interner Serverfehler', 500);
  res.status(fallback.status).json({
    error: {
      code: fallback.code,
      message: fallback.message,
    },
  });
};
