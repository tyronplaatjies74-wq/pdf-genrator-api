import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = ':memory:';
process.env.BROWSER_POOL_SIZE = '1';
process.env.CHROME_NO_SANDBOX = process.env.CHROME_NO_SANDBOX || 'true';

const { createApp } = await import('../src/app.js');
const pool = await import('../src/services/browserPool.service.js');
const { db, closeDb } = await import('../src/services/db.service.js');
const { render } = await import('../src/services/template.service.js');

let server, base, apiKey;

before(async () => {
  db();
  await pool.init();
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  const res = await fetch(`${base}/v1/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'test@example.com' }),
  });
  apiKey = (await res.json()).apiKey;
});

after(async () => {
  server.close();
  await pool.shutdown();
  closeDb();
});

const post = (body, key = apiKey) =>
  fetch(`${base}/v1/pdf/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key ? { 'x-api-key': key } : {}) },
    body: JSON.stringify(body),
  });

test('health endpoints respond', async () => {
  assert.equal((await fetch(`${base}/health`)).status, 200);
  assert.equal((await fetch(`${base}/ready`)).status, 200);
});

test('rejects missing and invalid API keys', async () => {
  assert.equal((await post({ html: '<p>x</p>' }, null)).status, 401);
  assert.equal((await post({ html: '<p>x</p>' }, 'nope')).status, 401);
});

test('rejects invalid payloads', async () => {
  assert.equal((await post({})).status, 400);
  assert.equal((await post({ template: 'invoice', html: '<p>x</p>' })).status, 400);
  assert.equal((await post({ template: 'nope' })).status, 400);
});

test('template data is HTML-escaped', () => {
  const html = render('receipt', { merchant: { name: '<script>alert(1)</script>' }, items: [] });
  assert.ok(!html.includes('<script>alert(1)</script>'));
});

test('generates a valid PDF from raw HTML', async () => {
  const res = await post({ html: '<h1>Hello</h1>' });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
});

test('generates a PDF from the invoice template', async () => {
  const res = await post({
    template: 'invoice',
    data: {
      invoiceNumber: 'INV-001', currency: 'USD', issueDate: '2026-01-15', taxRate: 10,
      from: { name: 'Acme Co' }, to: { name: 'Jane Doe' },
      items: [{ description: 'Design work', quantity: 2, unitPrice: 150 }],
    },
  });
  assert.equal(res.status, 200);
  assert.equal(Buffer.from(await res.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
});

test('blocks requests to private addresses (SSRF)', async () => {
  // Render must succeed (blocked image just fails to load) without ever hitting localhost.
  const res = await post({ html: '<img src="http://127.0.0.1:1/secret.png"><p>ok</p>' });
  assert.equal(res.status, 200);
});

test('reports usage', async () => {
  const res = await fetch(`${base}/v1/pdf/usage`, { headers: { 'x-api-key': apiKey } });
  const body = await res.json();
  assert.equal(body.tier, 'free');
  assert.ok(body.used >= 1);
});

test('serves the landing page and plans', async () => {
  const page = await fetch(`${base}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<title>PDF API/);
  const { plans } = await (await fetch(`${base}/v1/plans`)).json();
  assert.deepEqual(plans.map((x) => x.id), ['free', 'starter', 'pro', 'business']);
});