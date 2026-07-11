import { AiProvider } from './AiProvider.js';

export class MockProvider implements AiProvider {
  /**
   * Mock implementation of the semantic mapping engine.
   * Maps arbitrary fields using basic regex/keyword heuristics.
   */
  async extract(batch: any[], systemPrompt: string): Promise<any[]> {
    // Simulate a brief network latency (500ms)
    await new Promise((resolve) => setTimeout(resolve, 500));

    return batch.map((row) => {
      let name = '';
      let email = '';
      let phone = '';
      let company = '';
      let city = '';
      let state = '';
      let country = '';

      // Clean mapping heuristic based on column key names
      for (const key of Object.keys(row)) {
        const val = String(row[key] ?? '').trim();
        const lowerKey = key.toLowerCase();

        if (lowerKey.includes('name') || lowerKey.includes('first') || lowerKey.includes('lead')) {
          name = name ? `${name} ${val}` : val;
        } else if (lowerKey.includes('email') || lowerKey.includes('mail') || val.includes('@')) {
          email = val;
        } else if (
          lowerKey.includes('phone') || 
          lowerKey.includes('mobile') || 
          lowerKey.includes('whatsapp') || 
          lowerKey.includes('contact')
        ) {
          phone = val;
        } else if (lowerKey.includes('company') || lowerKey.includes('firm') || lowerKey.includes('org')) {
          company = val;
        } else if (lowerKey.includes('city')) {
          city = val;
        } else if (lowerKey.includes('state')) {
          state = val;
        } else if (lowerKey.includes('country')) {
          country = val;
        }
      }

      return {
        _row: row._row,
        created_at: row.created_at || new Date().toISOString(),
        name,
        email,
        country_code: '',
        mobile_without_country_code: phone,
        company,
        city,
        state,
        country,
        lead_owner: 'Mock System Owner',
        crm_status: 'GOOD_LEAD_FOLLOW_UP',
        crm_note: 'Processed via Mock Engine (Offline Mode)',
        data_source: 'leads_on_demand',
        possession_time: '',
        description: 'Local simulation lead'
      };
    });
  }
}
