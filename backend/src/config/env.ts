import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env file
dotenv.config();

const envSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  GEMINI_API_KEY: z.string().optional(),
  PORT: z.preprocess((val) => Number(val ?? '4000'), z.number().int().positive()),
  MAX_BATCH_SIZE: z.preprocess((val) => Number(val ?? '30'), z.number().int().positive()),
  MAX_UPLOAD_SIZE_MB: z.preprocess((val) => Number(val ?? '20'), z.number().int().positive()),
  LLM_PROVIDER: z.string().default('openai'),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('❌ Invalid environment configuration:');
  console.error(JSON.stringify(result.error.format(), null, 2));
  process.exit(1);
}

export const env = result.data;
