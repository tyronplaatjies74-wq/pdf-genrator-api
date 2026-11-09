import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Handlebars from 'handlebars';
import { HttpError } from '../utils/httpError.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates');
const hb = Handlebars.create(); // isolated instance; autoescaping stays ON ({{x}} escapes, {{{x}}} does not)

hb.registerHelper('money', (amount, currency) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: typeof currency === 'string' ? currency : 'USD' }).format(Number(amount) || 0));
hb.registerHelper('date', (v) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v ?? '') : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
});

export const TEMPLATE_NAMES = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.html'))
  .map((f) => f.replace('.html', ''));

const cache = new Map();
const compiled = (file) => {
  if (!cache.has(file)) cache.set(file, hb.compile(fs.readFileSync(file, 'utf8')));
  return cache.get(file);
};

const n = (v) => Number(v) || 0;

function prepare(name, input) {
  const data = JSON.parse(JSON.stringify(input || {}));
  // accentColor is interpolated into CSS, so only accept plain hex colors.
  if (!/^#[0-9a-f]{3,8}$/i.test(String(data.accentColor ?? ''))) delete data.accentColor;
  if (name === 'invoice') {
    data.items = (data.items || []).map((it) => ({ ...it, amount: it.amount ?? n(it.quantity ?? 1) * n(it.unitPrice) }));
    data.subtotal = data.subtotal ?? data.items.reduce((s, it) => s + n(it.amount), 0);
    data.tax = data.tax ?? (data.taxRate ? (data.subtotal * n(data.taxRate)) / 100 : 0);
    data.total = data.total ?? data.subtotal + data.tax;
  }
  if (name === 'receipt') {
    data.items = (data.items || []).map((it) => ({ ...it, amount: it.amount ?? n(it.quantity ?? 1) * n(it.unitPrice) }));
    data.total = data.total ?? data.items.reduce((s, it) => s + n(it.amount), 0);
  }
  return data;
}

export function render(name, input) {
  if (!TEMPLATE_NAMES.includes(name)) throw new HttpError(400, 'unknown_template', `Unknown template "${name}"`);
  const data = prepare(name, input);
  const body = compiled(path.join(dir, `${name}.html`))(data);
  return compiled(path.join(dir, 'layouts', 'base.html'))({ ...data, body: new hb.SafeString(body) });
}