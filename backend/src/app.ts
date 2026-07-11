import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import leadRoutes from './routes/leads.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { logger } from './utils/logger.js';

const app = express();

// Global request ID middleware
app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  req.headers['x-request-id'] = requestId;
  next();
});

// Security headers
app.use(helmet());

// CORS configuration (allow frontend client access)
app.use(cors({
  origin: '*', // Accessible by any frontend port during local run
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
}));

// Rate limiter: 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      message: 'Too many requests, please try again later.',
      status: 429
    }
  }
});
app.use(limiter);

// Log requests
app.use((req, res, next) => {
  logger.http(`${req.method} ${req.originalUrl} - Request ID: ${req.headers['x-request-id']}`);
  next();
});

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Leads API Router
app.use('/api', leadRoutes);

// Fallback for unrecognized routes
app.use(notFound);

// Centralized error handler
app.use(errorHandler);

export default app;
