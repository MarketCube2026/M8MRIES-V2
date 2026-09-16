import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { readConfig } from './config.js';
import { createApp } from './app.js';
import { storageClient } from './storage.js';
const config = readConfig();
const prisma = new PrismaClient();
const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const app = createApp({ prisma, supabase, storage: storageClient(supabase, config.SUPABASE_STORAGE_BUCKET), config });
const server = app.listen(config.PORT, '0.0.0.0', () => console.log('API ready'));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => {
  server.close(() => { void prisma.$disconnect().finally(() => process.exit(0)); });
  setTimeout(() => process.exit(1), 10000).unref();
});
