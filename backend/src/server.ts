import app from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

const server = app.listen(env.PORT, () => {
  logger.info(`⚡ Server running on port ${env.PORT} in ${process.env.NODE_ENV || 'development'} mode`);
});

const gracefulShutdown = (signal: string) => {
  logger.info(`Received ${signal}. Shutting down server gracefully...`);
  
  server.close(() => {
    logger.info('HTTP server closed. Process exiting.');
    process.exit(0);
  });

  // Force shutdown after 10s if connections refuse to close
  setTimeout(() => {
    logger.warn('Graceful shutdown timeout exceeded. Forcing exit.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
