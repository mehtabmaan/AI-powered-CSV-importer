import { Lead } from '../validators/lead.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface NormalizerResult {
  isValid: boolean;
  normalizedLead?: Lead;
  skipReason?:
    | 'Invalid email format'
    | 'Invalid phone number'
    | 'Missing both email and phone';
}

/**
 * Normalizes email: trims and converts to lowercase.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Parses a phone number string into a country code and a mobile number.
 * Standardizes by stripping non-digit characters (preserving leading '+').
 * Implements a heuristic for splitting country codes from 10-digit mobile numbers.
 */
export function parsePhone(rawPhone: string): { countryCode: string; mobileNumber: string } {
  // Strip all non-digit and non-plus characters
  let cleaned = rawPhone.replace(/[^\d+]/g, '');

  if (!cleaned) {
    return { countryCode: '', mobileNumber: '' };
  }

  const hasPlus = cleaned.startsWith('+');
  if (hasPlus) {
    cleaned = cleaned.substring(1);
  }

  // If number of digits is 10, treat as mobile number with no country code
  if (cleaned.length === 10) {
    return { countryCode: '', mobileNumber: cleaned };
  }

  // Heuristic for splitting based on length
  if (cleaned.length > 10) {
    const mobileLength = 10;
    const countryCodeLength = cleaned.length - mobileLength;
    return {
      countryCode: cleaned.substring(0, countryCodeLength),
      mobileNumber: cleaned.substring(countryCodeLength)
    };
  }

  // Fallback: if it's less than 10 digits, we can't reliably extract country code.
  // We treat the whole thing as mobile number.
  return { countryCode: '', mobileNumber: cleaned };
}

/**
 * Normalizes date to YYYY-MM-DDTHH:mm:ss.
 */
export function normalizeDate(rawDate: string): string {
  if (!rawDate || !rawDate.trim()) {
    return '';
  }

  const timestamp = Date.parse(rawDate.trim());
  if (isNaN(timestamp)) {
    return ''; // Return empty string for invalid dates
  }

  const d = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, '0');
  
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  const ss = pad(d.getSeconds());

  return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}`;
}

/**
 * Validates and normalizes parsed fields for a lead record.
 */
export function normalizeLead(lead: Lead): NormalizerResult {
  const email = lead.email ? normalizeEmail(lead.email) : '';
  
  // Validate email format if provided
  if (email && !EMAIL_REGEX.test(email)) {
    return { isValid: false, skipReason: 'Invalid email format' };
  }

  const rawPhone = (lead.country_code || '') + (lead.mobile_without_country_code || '');
  let countryCode = '';
  let mobileNumber = '';

  if (rawPhone) {
    const parsed = parsePhone(rawPhone);
    countryCode = parsed.countryCode;
    mobileNumber = parsed.mobileNumber;

    // Validate phone length: E.164 specifies between 7 and 15 digits total
    const totalDigits = (countryCode + mobileNumber).length;
    if (totalDigits < 7 || totalDigits > 15) {
      return { isValid: false, skipReason: 'Invalid phone number' };
    }
  }

  // Ensure either email or phone is present
  if (!email && !mobileNumber) {
    return { isValid: false, skipReason: 'Missing both email and phone' };
  }

  const normalizedLead: Lead = {
    ...lead,
    email,
    country_code: countryCode,
    mobile_without_country_code: mobileNumber,
    created_at: normalizeDate(lead.created_at),
  };

  return {
    isValid: true,
    normalizedLead,
  };
}
