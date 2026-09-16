import 'dotenv/config';
import { z } from 'zod';
export function readConfig(env = process.env) {
  const config = z.object({
    DATABASE_URL: z.string().startsWith('postgres'),
    SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
    SUPABASE_STORAGE_BUCKET: z.string().default('application-attachments'),
    FRONTEND_ORIGIN: z.string().min(1),
    OCR_SERVICE_URL: z.string().url().default('http://127.0.0.1:8100'),
    OCR_SERVICE_TOKEN: z.string().min(24),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    MAX_UPLOAD_MB: z.coerce.number().positive().max(50).default(10),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
    WRITE_ENABLED: z.enum(['true','false']).default('true'),
  }).parse(env);
  const origins = config.FRONTEND_ORIGIN.split(',').map(value => value.trim());
  for (const origin of origins) if (new URL(origin).origin !== origin) throw new Error('FRONTEND_ORIGIN 必须为 origin，不能包含路径');
  return { ...config, origins };
}
