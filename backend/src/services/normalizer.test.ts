import { describe, it, expect } from 'vitest';
import { normalizeEmail, parsePhone, normalizeDate, normalizeLead } from './normalizer.js';
import { Lead } from '../validators/lead.js';

describe('Normalizer Service', () => {
  describe('normalizeEmail', () => {
    it('should trim and lowercase emails', () => {
      expect(normalizeEmail('  Test@Example.COM  ')).toBe('test@example.com');
    });
  });

  describe('parsePhone', () => {
    it('should extract country code and mobile number correctly', () => {
      expect(parsePhone('+919876543210')).toEqual({ countryCode: '91', mobileNumber: '9876543210' });
      expect(parsePhone('11234567890')).toEqual({ countryCode: '1', mobileNumber: '1234567890' });
      expect(parsePhone('9876543210')).toEqual({ countryCode: '', mobileNumber: '9876543210' });
    });
  });

  describe('normalizeDate', () => {
    it('should format valid dates to YYYY-MM-DDTHH:mm:ss', () => {
      expect(normalizeDate('2026-07-11')).toBe('2026-07-11T00:00:00');
      // Set to static time string for standard JS date parse
      expect(normalizeDate('2026-07-11T16:30:00Z')).toBe('2026-07-11T22:00:00'); // Parsed according to timezone (Indian Standard Time in system metadata is +5:30)
    });
    it('should return empty string for invalid dates', () => {
      expect(normalizeDate('invalid-date')).toBe('');
    });
  });

  describe('normalizeLead', () => {
    it('should validate and clean a complete valid lead', () => {
      const mockLead: Lead = {
        _row: 2,
        created_at: '2026-07-11',
        name: 'John Doe',
        email: '  JOHN@doe.com ',
        country_code: '',
        mobile_without_country_code: '+91 98765 43210',
        company: 'ACME',
        city: 'NY',
        state: 'NY',
        country: 'US',
        lead_owner: 'Agent Smith',
        crm_status: 'GOOD_LEAD_FOLLOW_UP',
        crm_note: '',
        data_source: 'leads_on_demand',
        possession_time: '',
        description: ''
      };
      
      const result = normalizeLead(mockLead);
      expect(result.isValid).toBe(true);
      expect(result.normalizedLead?.email).toBe('john@doe.com');
      expect(result.normalizedLead?.country_code).toBe('91');
      expect(result.normalizedLead?.mobile_without_country_code).toBe('9876543210');
      expect(result.normalizedLead?.created_at).toBe('2026-07-11T00:00:00');
    });

    it('should skip on invalid email format', () => {
      const mockLead: Lead = {
        _row: 2,
        created_at: '',
        name: 'John Doe',
        email: 'invalid-email',
        country_code: '',
        mobile_without_country_code: '9876543210',
        company: '',
        city: '',
        state: '',
        country: '',
        lead_owner: '',
        crm_status: '',
        crm_note: '',
        data_source: '',
        possession_time: '',
        description: ''
      };
      const result = normalizeLead(mockLead);
      expect(result.isValid).toBe(false);
      expect(result.skipReason).toBe('Invalid email format');
    });

    it('should skip on invalid phone number', () => {
      const mockLead: Lead = {
        _row: 2,
        created_at: '',
        name: 'John Doe',
        email: 'john@doe.com',
        country_code: '',
        mobile_without_country_code: '123', // too short
        company: '',
        city: '',
        state: '',
        country: '',
        lead_owner: '',
        crm_status: '',
        crm_note: '',
        data_source: '',
        possession_time: '',
        description: ''
      };
      const result = normalizeLead(mockLead);
      expect(result.isValid).toBe(false);
      expect(result.skipReason).toBe('Invalid phone number');
    });

    it('should skip when both email and phone are missing', () => {
      const mockLead: Lead = {
        _row: 2,
        created_at: '',
        name: 'John Doe',
        email: '',
        country_code: '',
        mobile_without_country_code: '',
        company: '',
        city: '',
        state: '',
        country: '',
        lead_owner: '',
        crm_status: '',
        crm_note: '',
        data_source: '',
        possession_time: '',
        description: ''
      };
      const result = normalizeLead(mockLead);
      expect(result.isValid).toBe(false);
      expect(result.skipReason).toBe('Missing both email and phone');
    });
  });
});
