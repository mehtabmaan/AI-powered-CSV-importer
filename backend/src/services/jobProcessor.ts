import Papa from 'papaparse';
import { CONSTANTS } from '../config/constants.js';
import { env } from '../config/env.js';
import { LeadSchema, Lead } from '../validators/lead.js';
import { normalizeLead } from './normalizer.js';
import { AiService } from '../llm/AiService.js';
import { CRM_EXTRACTION_PROMPT } from '../prompts/crmExtraction.js';
import { logger } from '../utils/logger.js';
import { Response } from 'express';

export interface ImportJob {
  jobId: string;
  status: 'processing' | 'completed' | 'failed';
  currentBatch: number;
  totalBatches: number;
  progress: number;
  summary?: {
    totalRows: number;
    processedRows: number;
    successCount: number;
    skippedCount: number;
    processingTimeMs: number;
  };
  success: Lead[];
  skipped: { row: number; reason: string }[];
  clients: Response[];
  createdAt: number;
}

class JobProcessor {
  private jobs = new Map<string, ImportJob>();
  private aiService = new AiService();

  /**
   * Initializes a new import job in memory and schedules its TTL cleanup.
   */
  createJob(): string {
    const jobId = crypto.randomUUID();
    const job: ImportJob = {
      jobId,
      status: 'processing',
      currentBatch: 0,
      totalBatches: 0,
      progress: 0,
      success: [],
      skipped: [],
      clients: [],
      createdAt: Date.now(),
    };

    this.jobs.set(jobId, job);
    logger.info(`Job created: ${jobId}`);

    // Schedule cleanup after TTL
    setTimeout(() => {
      this.cleanupJob(jobId);
    }, CONSTANTS.JOB_TTL_MS);

    return jobId;
  }

  /**
   * Returns a job by ID.
   */
  getJob(jobId: string): ImportJob | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Registers a client response for SSE streaming.
   */
  addClient(jobId: string, res: Response) {
    const job = this.jobs.get(jobId);
    if (!job) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: 'Job not found' })}\n\n`);
      res.end();
      return;
    }

    job.clients.push(res);

    // Stream initial state
    this.sendSSEEvent(res, 'progress', {
      progress: job.progress,
      currentBatch: job.currentBatch,
      totalBatches: job.totalBatches,
      status: job.status,
    });

    // If job already finished, stream completion immediately
    if (job.status === 'completed' && job.summary) {
      this.sendSSEEvent(res, 'complete', {
        summary: job.summary,
        success: job.success,
        skipped: job.skipped,
      });
      res.end();
    }
  }

  /**
   * Starts processing a CSV file buffer.
   */
  async startProcessing(jobId: string, csvBuffer: Buffer) {
    const startTime = Date.now();
    const job = this.jobs.get(jobId);
    if (!job) {
      logger.error(`Cannot start processing: Job ${jobId} not found in memory`);
      return;
    }

    logger.info(`Starting background processing for job ${jobId}`);

    try {
      const csvString = csvBuffer.toString('utf-8');
      const parsed = Papa.parse(csvString, CONSTANTS.PAPA_CONFIG);

      // Inject _row physical line numbering (data starts at line 2)
      const rawRecords = parsed.data.map((row: any, index: number) => ({
        ...row,
        _row: index + 2
      }));

      const totalRows = rawRecords.length;
      if (totalRows === 0) {
        throw new Error('CSV has no data records');
      }

      // Batching
      const batchSize = env.MAX_BATCH_SIZE;
      const batches: any[][] = [];
      for (let i = 0; i < rawRecords.length; i += batchSize) {
        batches.push(rawRecords.slice(i, i + batchSize));
      }

      job.totalBatches = batches.length;
      
      // Track duplicates within this job session
      const processedEmails = new Set<string>();
      const processedPhones = new Set<string>();

      // Process batches sequentially
      for (let b = 0; b < batches.length; b++) {
        const batch = batches[b];
        const batchNum = b + 1;
        logger.info(`Processing job ${jobId} - batch ${batchNum}/${batches.length}`);

        let extractedBatch: any[] = [];
        let extractionError = false;

        const startAiTime = Date.now();
        try {
          extractedBatch = await this.aiService.extractWithRetry(batch, CRM_EXTRACTION_PROMPT);
          logger.info(`Batch ${batchNum} AI processing finished. Latency: ${Date.now() - startAiTime}ms`);
        } catch (error) {
          extractionError = true;
          logger.error(`Batch ${batchNum} extraction failed after retries:`, { error });
        }

        // Process batch items
        if (extractionError) {
          // Skip all rows in this batch
          for (const rawItem of batch) {
            job.skipped.push({
              row: rawItem._row,
              reason: 'AI extraction failed after retries'
            });
          }
        } else {
          // Process extracted records and align them back to the original rows
          for (const rawItem of batch) {
            const rowNumber = rawItem._row;
            const extractedItem = extractedBatch.find((x: any) => x && x._row === rowNumber);

            if (!extractedItem) {
              job.skipped.push({
                row: rowNumber,
                reason: 'AI extraction failed after retries' // Missing from AI output entirely
              });
              continue;
            }

            // Safe parse against Zod Lead schema
            const zodResult = LeadSchema.safeParse(extractedItem);
            if (!zodResult.success) {
              logger.warn(`Row ${rowNumber} schema validation failed:`, { errors: zodResult.error.errors });
              job.skipped.push({
                row: rowNumber,
                reason: 'Schema validation failed'
              });
              continue;
            }

            // Normalization
            const normResult = normalizeLead(zodResult.data);
            if (!normResult.isValid || !normResult.normalizedLead) {
              job.skipped.push({
                row: rowNumber,
                reason: normResult.skipReason || 'Schema validation failed'
              });
              continue;
            }

            const cleanLead = normResult.normalizedLead;

            // Deduplication
            let isDuplicate = false;

            if (cleanLead.email) {
              if (processedEmails.has(cleanLead.email)) {
                job.skipped.push({ row: rowNumber, reason: 'Duplicate email' });
                isDuplicate = true;
              } else {
                processedEmails.add(cleanLead.email);
              }
            }

            if (!isDuplicate && cleanLead.country_code && cleanLead.mobile_without_country_code) {
              const fullPhone = cleanLead.country_code + cleanLead.mobile_without_country_code;
              if (processedPhones.has(fullPhone)) {
                job.skipped.push({ row: rowNumber, reason: 'Duplicate phone' });
                isDuplicate = true;
                // Cleanup email if we registered it but the row gets skipped due to phone
                if (cleanLead.email) {
                  processedEmails.delete(cleanLead.email);
                }
              } else {
                processedPhones.add(fullPhone);
              }
            }

            if (!isDuplicate) {
              job.success.push(cleanLead);
            }
          }
        }

        // Update progress state
        job.currentBatch = batchNum;
        job.progress = Math.round((batchNum / batches.length) * 100);

        this.broadcastEvent(jobId, 'progress', {
          progress: job.progress,
          currentBatch: job.currentBatch,
          totalBatches: job.totalBatches,
          status: 'processing'
        });
      }

      // Mark completed
      job.status = 'completed';
      job.summary = {
        totalRows,
        processedRows: job.success.length + job.skipped.length,
        successCount: job.success.length,
        skippedCount: job.skipped.length,
        processingTimeMs: Date.now() - startTime
      };

      logger.info(`Job ${jobId} finished processing successfully`, { summary: job.summary });

      this.broadcastEvent(jobId, 'complete', {
        summary: job.summary,
        success: job.success,
        skipped: job.skipped
      });

      this.disconnectClients(jobId);
    } catch (error: any) {
      logger.error(`Job ${jobId} failed with fatal processing error:`, { error });
      job.status = 'failed';
      this.broadcastEvent(jobId, 'error', {
        message: error.message || 'Fatal error processing CSV'
      });
      this.disconnectClients(jobId);
    }
  }

  private sendSSEEvent(res: Response, eventName: string, data: any) {
    res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  private broadcastEvent(jobId: string, eventName: string, data: any) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    for (const client of job.clients) {
      this.sendSSEEvent(client, eventName, data);
    }
  }

  private disconnectClients(jobId: string) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    for (const client of job.clients) {
      client.end();
    }
    job.clients = [];
  }

  private cleanupJob(jobId: string) {
    const job = this.jobs.get(jobId);
    if (job) {
      this.disconnectClients(jobId);
      this.jobs.delete(jobId);
      logger.info(`Job cleaned up from memory due to TTL expiry: ${jobId}`);
    }
  }
}

export const jobProcessor = new JobProcessor();
export default jobProcessor;
