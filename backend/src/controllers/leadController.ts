import { Request, Response, NextFunction } from 'express';
import Papa from 'papaparse';
import { CONSTANTS } from '../config/constants.js';
import { jobProcessor } from '../services/jobProcessor.js';
import { logger } from '../utils/logger.js';

export class LeadController {
  /**
   * Uploads and validates a CSV file, creates a job, and starts background extraction.
   */
  async extractLeads(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({
          error: {
            message: 'No file uploaded',
            status: 400
          }
        });
        return;
      }

      logger.info(`Received CSV file upload request. File: ${file.originalname}, Size: ${file.size} bytes`);

      // 1. Validate MIME type and file extension
      const isAllowedMime = CONSTANTS.ALLOWED_MIME_TYPES.includes(file.mimetype);
      const isAllowedExt = file.originalname.toLowerCase().endsWith('.csv');

      if (!isAllowedMime && !isAllowedExt) {
        logger.warn(`Rejected file: ${file.originalname} has invalid mime ${file.mimetype}`);
        res.status(400).json({
          error: {
            message: 'Invalid file format. Only CSV files are allowed.',
            status: 400
          }
        });
        return;
      }

      // 2. Validate empty CSV
      const csvContent = file.buffer.toString('utf-8').trim();
      if (!csvContent) {
        logger.warn(`Rejected file: ${file.originalname} is empty`);
        res.status(400).json({
          error: {
            message: 'Empty CSV file',
            status: 400
          }
        });
        return;
      }

      // 3. Parse CSV client-aligned to check headers and structure
      const parsed = Papa.parse(csvContent, CONSTANTS.PAPA_CONFIG);

      // Check if PapaParse had errors and returned no records
      if (parsed.errors.length > 0 && parsed.data.length === 0) {
        logger.warn(`Rejected file: ${file.originalname} is malformed`, { errors: parsed.errors });
        res.status(400).json({
          error: {
            message: 'Malformed CSV row',
            status: 400,
            details: parsed.errors
          }
        });
        return;
      }

      // Check header-only
      if (parsed.data.length === 0) {
        logger.warn(`Rejected file: ${file.originalname} is header-only`);
        res.status(400).json({
          error: {
            message: 'Empty CSV or header-only file',
            status: 400
          }
        });
        return;
      }

      // 4. Create Job and trigger processing in the background
      const jobId = jobProcessor.createJob();
      
      // Start async background processing
      jobProcessor.startProcessing(jobId, file.buffer);

      res.status(202).json({
        jobId,
        status: 'processing'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Established a Server-Sent Events (SSE) connection to track processing progress.
   */
  async getProgress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { jobId } = req.params;
      if (!jobId) {
        res.status(400).json({
          error: {
            message: 'Missing jobId parameter',
            status: 400
          }
        });
        return;
      }

      const job = jobProcessor.getJob(jobId);
      if (!job) {
        res.status(404).json({
          error: {
            message: `Job ${jobId} not found or expired`,
            status: 404
          }
        });
        return;
      }

      // Setup SSE Headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      logger.info(`Client subscribed to progress updates for job ${jobId}`);

      // Register connection
      jobProcessor.addClient(jobId, res);

      // Handle client disconnect
      req.on('close', () => {
        logger.info(`Client unsubscribed from job ${jobId}`);
        const activeJob = jobProcessor.getJob(jobId);
        if (activeJob) {
          activeJob.clients = activeJob.clients.filter((client) => client !== res);
        }
      });
    } catch (error) {
      next(error);
    }
  }
}
export const leadController = new LeadController();
