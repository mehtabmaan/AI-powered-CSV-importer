import { describe, it, expect } from 'vitest';
import { LeadSchema } from './lead.js';

describe('Zod Lead Schema Validation', () => {
  it('should parse valid record schemas', () => {
    const validItem = {
      _row: 5,
      name: 'John Doe',
      email: 'john@doe.com',
      crm_status: 'GOOD_LEAD_FOLLOW_UP',
      data_source: 'leads_on_demand'
    };

    const result = LeadSchema.safeParse(validItem);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data._row).toBe(5);
      expect(result.data.crm_status).toBe('GOOD_LEAD_FOLLOW_UP');
      expect(result.data.data_source).toBe('leads_on_demand');
      expect(result.data.company).toBe(''); // default catch value
    }
  });

  it('should reject records missing _row', () => {
    const invalidItem = {
      name: 'John Doe'
    };

    const result = LeadSchema.safeParse(invalidItem);
    expect(result.success).toBe(false);
  });

  it('should catch invalid crm_status and default to empty string', () => {
    const invalidStatus = {
      _row: 1,
      crm_status: 'INVALID_ENUM_VALUE'
    };

    const result = LeadSchema.safeParse(invalidStatus);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.crm_status).toBe('');
    }
  });
});
