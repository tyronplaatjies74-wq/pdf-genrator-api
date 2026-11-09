import dns from 'node:dns/promises';
import net from 'node:net';
import { withPage } from './browserPool.service.js';

const PRIVATE_V4 = [
  /^0\./, /^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^192\.0\.0\./, /^2(2[4-9]|[3-5]\d)\./,
];

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) return PRIVATE_V4.some((r) => r.test(ip));
  const v = ip.toLowerCase();
  if (v === '::1' || v === '::' || v.startsWith('fe80') || v.startsWith('fc') || v.startsWith('fd')) return true;
  if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
  return false;
}

async function isSafeUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) return !isPrivateIp(host);
  try {
    const addrs = await dns.lookup(host, { all: true });
    return addrs.length > 0 && addrs.every((a) => !isPrivateIp(a.address));
  } catch {
    return false;
  }
}

const WATERMARK = `<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
pointer-events:none;z-index:9999;font:700 72px sans-serif;color:rgba(0,0,0,.08);transform:rotate(-30deg)">SAMPLE · FREE TIER</div>`;

function addWatermark(html) {
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${WATERMARK}</body>`) : html + WATERMARK;
}

export async function renderPdf({ html, options = {}, watermark = false }) {
  const source = watermark ? addWatermark(html) : html;

  return withPage(async (page) => {
    // Untrusted HTML: no scripts, and every network request is checked against SSRF rules.
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', async (req) => {
      const url = req.url();
      if (url.startsWith('data:') || url === 'about:blank') return req.continue();
      (await isSafeUrl(url)) ? req.continue() : req.abort('blockedbyclient');
    });

    await page.setContent(source, { waitUntil: 'networkidle0', timeout: 15000 });
    await page.emulateMediaType('print');

    const pdf = await page.pdf({
      format: options.format || 'A4',
      landscape: Boolean(options.landscape),
      printBackground: true,
      preferCSSPageSize: true,
      margin: options.margin,
    });
    return Buffer.from(pdf);
  });
}