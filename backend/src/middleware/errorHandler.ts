import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

export interface AppError extends Error {
  status?: number;
  code?: string;
  details?: any;
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
) => {
  let status = err.status || 500;
  let message = err.message || 'Internal Server Error';

  if (err.code === 'LIMIT_FILE_SIZE') {
    status = 413;
    message = `File too large. Maximum allowed size is ${env.MAX_UPLOAD_SIZE_MB}MB`;
  }
  
  logger.error(`${req.method} ${req.originalUrl} - Error: ${message}`, {
    status,
    stack: err.stack,
    details: err.details,
    requestId: req.headers['x-request-id'] || 'N/A'
  });

  res.status(status).json({
    error: {
      message,
      status,
      details: err.details || null
    }
  });
};
