import { env, validateEnv } from './config/env.js';
import { createApp } from './app.js';
import { db, closeDb } from './services/db.service.js';
import * as pool from './services/browserPool.service.js';
import { logger } from './utils/logger.js';

validateEnv();
db();
await pool.init();

const server = createApp().listen(env.PORT, () => logger.info({ port: env.PORT }, 'listening'));

let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  logger.info({ signal }, 'shutting down');
  const force = setTimeout(() => process.exit(1), 15000).unref();
  server.close(async () => {
    await pool.shutdown();
    closeDb();
    clearTimeout(force);
    process.exit(0);
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));