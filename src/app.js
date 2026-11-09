import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import helmet from 'helmet';
import healthRoutes from './routes/health.routes.js';
import pdfRoutes from './routes/pdf.routes.js';
import { accountRouter, webhookRouter } from './routes/account.routes.js';
import { logger } from './utils/logger.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());

  app.use(healthRoutes);
  app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), 'public'))); // landing page
  app.use('/webhooks', webhookRouter); // raw body, must precede express.json()

  app.use(express.json({ limit: '2mb' }));
  app.use('/v1', accountRouter);
  app.use('/v1/pdf', pdfRoutes);

  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid_json', message: 'Malformed JSON body' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'payload_too_large' });
    const status = err.status || 500;
    if (status >= 500) logger.error({ err, path: req.path }, 'request failed');
    res.status(status).json({
      error: err.code || 'internal_error',
      message: status >= 500 && !err.code ? 'Internal server error' : err.message,
    });
  });

  return app;
}