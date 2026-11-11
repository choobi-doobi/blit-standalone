import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** An error with an HTTP status. The error handler turns it into `{ success: false, error }`. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** Wrap an async handler so a rejection reaches Express's error handler. */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => unknown): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/** The last middleware: every failure answers the same JSON envelope. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ success: false, error: err.message });
    return;
  }
  const status = (err as { status?: number; statusCode?: number })?.status ?? (err as { statusCode?: number })?.statusCode;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    res.status(status).json({ success: false, error: (err as Error).message || 'Bad request' });
    return;
  }
  console.error('[blit]', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
}
