import { jsonrepair } from 'jsonrepair';
import { env } from '../config/env.js';
import { CONSTANTS } from '../config/constants.js';
import { AiProvider } from './AiProvider.js';
import { OpenAIProvider, FallbackResponseError } from './OpenAIProvider.js';
import { MockProvider } from './MockProvider.js';
import { logger } from '../utils/logger.js';

export class AiService {
  private provider: AiProvider;

  constructor() {
    if (env.LLM_PROVIDER === 'mock') {
      logger.info('Initializing offline Mock Ingestion Provider');
      this.provider = new MockProvider();
    } else if (env.LLM_PROVIDER === 'openai') {
      this.provider = new OpenAIProvider();
    } else {
      logger.warn(`Unknown provider '${env.LLM_PROVIDER}', falling back to OpenAI.`);
      this.provider = new OpenAIProvider();
    }
  }

  /**
   * Orchestrates the extraction of records in a batch, implementing retries and JSON repair logic.
   */
  async extractWithRetry(batch: any[], systemPrompt: string): Promise<any[]> {
    let attempt = 0;

    while (attempt <= CONSTANTS.MAX_RETRIES) {
      try {
        return await this.provider.extract(batch, systemPrompt);
      } catch (error: any) {
        // If it's a FallbackResponseError, we have a raw payload to repair
        if (error instanceof FallbackResponseError) {
          logger.info(`Attempting JSON repair on fallback payload (Attempt ${attempt + 1})...`);
          try {
            const repaired = jsonrepair(error.rawPayload);
            const parsed = JSON.parse(repaired);
            if (parsed && Array.isArray(parsed.records)) {
              logger.info('JSON repair succeeded!');
              return parsed.records;
            }
          } catch (repairError) {
            logger.warn('JSON repair failed on raw fallback payload:', { repairError });
          }
        }

        // Check if error is transient
        const isTransient = this.isTransientError(error);

        if (isTransient && attempt < CONSTANTS.MAX_RETRIES) {
          const delay = CONSTANTS.RETRY_DELAYS_MS[attempt] || 1000;
          logger.warn(`LLM service encountered transient error: ${error.message}. Retrying in ${delay}ms... (Attempt ${attempt + 1}/${CONSTANTS.MAX_RETRIES})`);
          await this.sleep(delay);
          attempt++;
        } else {
          logger.error(`LLM service failed permanently or exceeded retries: ${error.message}`);
          throw error;
        }
      }
    }

    throw new Error('AI extraction failed after maximum retries');
  }

  private isTransientError(error: any): boolean {
    // If it's an OpenAI API error with a status code
    if (error.status && CONSTANTS.TRANSIENT_HTTP_STATUSES.includes(error.status)) {
      return true;
    }

    // Common Node network errors
    const transientCodes = ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED'];
    if (error.code && transientCodes.includes(error.code)) {
      return true;
    }

    // Check message content for timeouts
    const msg = (error.message || '').toLowerCase();
    if (msg.includes('timeout') || msg.includes('rate limit') || msg.includes('too many requests')) {
      return true;
    }

    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
