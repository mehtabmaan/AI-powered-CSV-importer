import { z } from 'zod';

export const LeadSchema = z.object({
  _row: z.number().int().positive(),
  created_at: z.string().catch(''),
  name: z.string().catch(''),
  email: z.string().catch(''),
  country_code: z.string().catch(''),
  mobile_without_country_code: z.string().catch(''),
  company: z.string().catch(''),
  city: z.string().catch(''),
  state: z.string().catch(''),
  country: z.string().catch(''),
  lead_owner: z.string().catch(''),
  crm_status: z.enum(['GOOD_LEAD_FOLLOW_UP', 'DID_NOT_CONNECT', 'BAD_LEAD', 'SALE_DONE', '']).catch(''),
  crm_note: z.string().catch(''),
  data_source: z.enum(['leads_on_demand', 'meridian_tower', 'eden_park', 'varah_swamy', 'sarjapur_plots', '']).catch(''),
  possession_time: z.string().catch(''),
  description: z.string().catch('')
});

export type Lead = z.infer<typeof LeadSchema>;
