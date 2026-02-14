export type AppErrorCode =
  | 'VALIDATION_ERROR'
  | 'INSTANCE_NOT_FOUND'
  | 'LOGIN_FAILED'
  | 'ADMIN_CHOICE_NOT_FOUND'
  | 'OAUTH_FORM_NOT_FOUND'
  | 'OAUTH_LOGIN_FAILED'
  | 'PARSE_FAILED'
  | 'FRONTEND_CHANGED'
  | 'ADMIN_BUTTON_NOT_FOUND'
  | 'ADMIN_REDIRECT_FAILED'
  | 'SYNC_IN_PROGRESS'
  | 'SYNC_RATE_LIMITED'
  | 'CSRF_TOKEN_INVALID'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  public readonly code: AppErrorCode;
  public readonly status: number;
  public readonly details?: unknown;

  public constructor(code: AppErrorCode, message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const isAppError = (error: unknown): error is AppError => error instanceof AppError;

export const toAppError = (error: unknown): AppError => {
  if (isAppError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError('INTERNAL_ERROR', error.message, 500);
  }

  return new AppError('INTERNAL_ERROR', 'Unexpected error', 500);
};
