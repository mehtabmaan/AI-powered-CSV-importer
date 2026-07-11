import OpenAI from 'openai';
import { env } from '../config/env.js';
import { AiProvider } from './AiProvider.js';
import { logger } from '../utils/logger.js';

const LEAD_EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    records: {
      type: 'array',
      description: 'The list of semantically mapped lead records.',
      items: {
        type: 'object',
        properties: {
          _row: { type: 'number', description: 'The original row number from the CSV input' },
          created_at: { type: 'string', description: 'Creation date/timestamp if available' },
          name: { type: 'string', description: 'Name of the lead' },
          email: { type: 'string', description: 'Email address' },
          country_code: { type: 'string', description: 'Phone country code' },
          mobile_without_country_code: { type: 'string', description: 'Phone number without country code' },
          company: { type: 'string', description: 'Company name' },
          city: { type: 'string', description: 'City name' },
          state: { type: 'string', description: 'State name' },
          country: { type: 'string', description: 'Country name' },
          lead_owner: { type: 'string', description: 'Lead owner/agent' },
          crm_status: { 
            type: 'string', 
            enum: ['GOOD_LEAD_FOLLOW_UP', 'DID_NOT_CONNECT', 'BAD_LEAD', 'SALE_DONE', ''],
            description: 'Target CRM status selection'
          },
          crm_note: { type: 'string', description: 'CRM notes, extras, and unmapped fields' },
          data_source: {
            type: 'string',
            enum: ['leads_on_demand', 'meridian_tower', 'eden_park', 'varah_swamy', 'sarjapur_plots', ''],
            description: 'Target lead source selection'
          },
          possession_time: { type: 'string', description: 'Possession time info' },
          description: { type: 'string', description: 'General description field' }
        },
        required: [
          '_row', 'created_at', 'name', 'email', 'country_code', 
          'mobile_without_country_code', 'company', 'city', 'state', 
          'country', 'lead_owner', 'crm_status', 'crm_note', 
          'data_source', 'possession_time', 'description'
        ],
        additionalProperties: false
      }
    }
  },
  required: ['records'],
  additionalProperties: false
};

export class OpenAIProvider implements AiProvider {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });
  }

  async extract(batch: any[], systemPrompt: string): Promise<any[]> {
    logger.debug('Sending batch to OpenAI Structured Outputs...', { batchSize: batch.length });

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `<records>${JSON.stringify(batch)}</records>` }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'lead_extraction',
            strict: true,
            schema: LEAD_EXTRACTION_SCHEMA
          }
        },
        temperature: 0
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response payload from OpenAI structured outputs.');
      }

      const parsed = JSON.parse(content);
      return parsed.records || [];
    } catch (error) {
      logger.warn('Structured outputs call failed, attempting fallback to raw JSON mode...', { error });

      // Fallback: Use JSON object mode and manual jsonrepair in AiService
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt + '\nIMPORTANT: You must return a JSON object with a key "records" containing an array of mapped objects.' },
          { role: 'user', content: `<records>${JSON.stringify(batch)}</records>` }
        ],
        response_format: { type: 'json_object' },
        temperature: 0
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response payload from OpenAI fallback mode.');
      }

      // Return raw string so the service can repair it if necessary
      throw new FallbackResponseError('Structured outputs failed. Fallback payload returned.', content);
    }
  }
}

export class FallbackResponseError extends Error {
  constructor(message: string, public rawPayload: string) {
    super(message);
    this.name = 'FallbackResponseError';
  }
}
