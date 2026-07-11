import { env } from '../config/env.js';
import { AiProvider } from './AiProvider.js';
import { logger } from '../utils/logger.js';

const GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    records: {
      type: 'ARRAY',
      description: 'The list of semantically mapped lead records.',
      items: {
        type: 'OBJECT',
        properties: {
          _row: { type: 'INTEGER', description: 'The original row number from the CSV input' },
          created_at: { type: 'STRING', description: 'Creation date/timestamp if available' },
          name: { type: 'STRING', description: 'Name of the lead' },
          email: { type: 'STRING', description: 'Email address' },
          country_code: { type: 'STRING', description: 'Phone country code' },
          mobile_without_country_code: { type: 'STRING', description: 'Phone number without country code' },
          company: { type: 'STRING', description: 'Company name' },
          city: { type: 'STRING', description: 'City name' },
          state: { type: 'STRING', description: 'State name' },
          country: { type: 'STRING', description: 'Country name' },
          lead_owner: { type: 'STRING', description: 'Lead owner/agent' },
          crm_status: { 
            type: 'STRING', 
            enum: ['GOOD_LEAD_FOLLOW_UP', 'DID_NOT_CONNECT', 'BAD_LEAD', 'SALE_DONE', ''],
            description: 'Target CRM status selection'
          },
          crm_note: { type: 'STRING', description: 'CRM notes, extras, and unmapped fields' },
          data_source: {
            type: 'STRING',
            enum: ['leads_on_demand', 'meridian_tower', 'eden_park', 'varah_swamy', 'sarjapur_plots', ''],
            description: 'Target lead source selection'
          },
          possession_time: { type: 'STRING', description: 'Possession time info' },
          description: { type: 'STRING', description: 'General description field' }
        },
        required: [
          '_row', 'created_at', 'name', 'email', 'country_code', 
          'mobile_without_country_code', 'company', 'city', 'state', 
          'country', 'lead_owner', 'crm_status', 'crm_note', 
          'data_source', 'possession_time', 'description'
        ]
      }
    }
  },
  required: ['records']
};

export class GeminiProvider implements AiProvider {
  async extract(batch: any[], systemPrompt: string): Promise<any[]> {
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured in the environment');
    }

    logger.debug('Sending batch to Google Gemini Structured Outputs...', { batchSize: batch.length });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `<records>${JSON.stringify(batch)}</records>`
            }
          ]
        }
      ],
      systemInstruction: {
        parts: [
          {
            text: systemPrompt
          }
        ]
      },
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: GEMINI_SCHEMA
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const resJson: any = await response.json();
    const content = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) {
      throw new Error('Empty response payload from Gemini structured outputs.');
    }

    const parsed = JSON.parse(content);
    return parsed.records || [];
  }
}
