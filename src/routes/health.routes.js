import { Router } from 'express';
import { isReady } from '../services/browserPool.service.js';

const router = Router();
router.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
router.get('/ready', (_req, res) =>
  isReady() ? res.json({ status: 'ready' }) : res.status(503).json({ status: 'starting' }));
export default router;