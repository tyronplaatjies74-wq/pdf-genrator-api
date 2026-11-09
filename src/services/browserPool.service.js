import puppeteer from 'puppeteer';
import { env } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';
import { logger } from '../utils/logger.js';

const entries = [];
const waiters = [];
let inFlight = 0;
let shuttingDown = false;

async function launch() {
  const args = ['--disable-dev-shm-usage', '--disable-gpu', '--font-render-hinting=none'];
  if (env.CHROME_NO_SANDBOX) args.push('--no-sandbox', '--disable-setuid-sandbox');
  const browser = await puppeteer.launch({ headless: true, executablePath: env.CHROME_PATH, args });
  const entry = { browser, active: 0, uses: 0, dead: false, recycling: false, closeOnIdle: false };
  browser.on('disconnected', () => {
    entry.dead = true;
    if (!shuttingDown) {
      logger.warn('browser disconnected, replacing');
      maybeRecycle(entry);
    }
  });
  return entry;
}

function closeEntry(entry) {
  entry.browser.close().catch(() => {});
}

function maybeRecycle(entry) {
  if (entry.recycling || shuttingDown) return;
  if (!entry.dead && entry.uses < env.BROWSER_RECYCLE_AFTER) return;
  entry.recycling = true;
  launch()
    .then((fresh) => {
      const i = entries.indexOf(entry);
      if (i >= 0) entries[i] = fresh;
      if (entry.active === 0) closeEntry(entry);
      else entry.closeOnIdle = true;
      logger.info('browser recycled');
    })
    .catch((err) => {
      entry.recycling = false;
      logger.error({ err }, 'browser relaunch failed');
    });
}

export async function init() {
  for (let i = 0; i < env.BROWSER_POOL_SIZE; i++) entries.push(await launch());
  logger.info({ size: entries.length }, 'browser pool ready');
}

export const isReady = () => entries.length > 0 && entries.some((e) => !e.dead);

async function acquireSlot() {
  if (inFlight < env.MAX_CONCURRENT_RENDERS) {
    inFlight++;
    return;
  }
  await new Promise((resolve, reject) => {
    const w = { resolve };
    w.timer = setTimeout(() => {
      waiters.splice(waiters.indexOf(w), 1);
      reject(new HttpError(503, 'server_busy', 'Server is busy, retry shortly'));
    }, env.QUEUE_TIMEOUT_MS);
    waiters.push(w);
  });
}

function releaseSlot() {
  const next = waiters.shift();
  if (next) {
    clearTimeout(next.timer);
    next.resolve(); // slot handed over; inFlight unchanged
  } else {
    inFlight--;
  }
}

function pick() {
  const healthy = entries.filter((e) => !e.dead && !e.recycling);
  const pool = healthy.length ? healthy : entries.filter((e) => !e.dead);
  if (!pool.length) throw new HttpError(503, 'browser_unavailable', 'Renderer unavailable');
  return pool.reduce((a, b) => (a.active <= b.active ? a : b));
}

/** Runs fn(page) in a fresh tab with a hard timeout, then always closes the tab. */
export async function withPage(fn) {
  await acquireSlot();
  let entry;
  let page;
  let timer;
  try {
    entry = pick();
    entry.active++;
    entry.uses++;
    page = await entry.browser.newPage();
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new HttpError(504, 'render_timeout', 'Render timed out')), env.RENDER_TIMEOUT_MS);
    });
    return await Promise.race([fn(page), timeout]);
  } finally {
    clearTimeout(timer);
    if (page) await page.close().catch(() => {});
    if (entry) {
      entry.active--;
      if (entry.closeOnIdle && entry.active === 0) closeEntry(entry);
      else maybeRecycle(entry);
    }
    releaseSlot();
  }
}

export async function shutdown() {
  shuttingDown = true;
  await Promise.all(entries.map((e) => e.browser.close().catch(() => {})));
  entries.length = 0;
}
