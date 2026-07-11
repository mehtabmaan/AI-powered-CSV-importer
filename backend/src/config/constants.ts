export const CONSTANTS = {
  // Job TTL for in-memory cleanup: 10 minutes
  JOB_TTL_MS: 10 * 60 * 1000,

  // Allowed CSV mime types
  ALLOWED_MIME_TYPES: [
    'text/csv',
    'application/vnd.ms-excel',
    'application/csv',
    'text/x-csv',
    'application/x-csv',
    'text/comma-separated-values'
  ],

  // LLM Retry logic
  MAX_RETRIES: 3,
  RETRY_DELAYS_MS: [1000, 2000, 4000],
  TRANSIENT_HTTP_STATUSES: [429, 500, 502, 503, 504],

  // PapaParse standard options matching frontend
  PAPA_CONFIG: {
    header: true,
    skipEmptyLines: 'greedy' as const,
    dynamicTyping: false
  }
};
