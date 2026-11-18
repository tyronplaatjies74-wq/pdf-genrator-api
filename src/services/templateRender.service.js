import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Handlebars from 'handlebars';
import { minorUnits } from './templateData.service.js';

const TEMPLATE_DIR = fileURLToPath(new URL('../templates/', import.meta.url));
const hbs = Handlebars.create(); // private copy, so nothing else can change these helpers

// {{money total currency}} -> "R 1 150,00". Amounts arrive as whole cents.
hbs.registerHelper('money', function (value, cur, options) {
  const opts = typeof cur === 'object' && cur !== null ? cur : options; // currency left out
  const root = opts?.data?.root ?? {};
  const code = typeof cur === 'string' && cur ? cur : root.currency || 'ZAR';
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  const fmt = new Intl.NumberFormat(root.locale || 'en-ZA', { style: 'currency', currency: code });
  return fmt.format(value / 10 ** minorUnits(code));
});

// {{date issueDate}} -> "15 November 2026". Input is a YYYY-MM-DD string.
hbs.registerHelper('date', function (value, options) {
  const root = options?.data?.root ?? {};
  if (typeof value !== 'string') return '';
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(root.locale || 'en-ZA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
});

function layoutPath() {
  const dir = path.join(TEMPLATE_DIR, 'layouts');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.html')).sort();
  const file = ['base.html', 'main.html', 'default.html', 'layout.html'].find((f) => files.includes(f)) ?? files[0];
  if (!file) throw new Error('No layout file found in src/templates/layouts');
  return path.join(dir, file);
}

const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const compiled = {
    body: hbs.compile(fs.readFileSync(path.join(TEMPLATE_DIR, `${name}.html`), 'utf8')),
    layout: hbs.compile(fs.readFileSync(layoutPath(), 'utf8')),
  };
  if (process.env.NODE_ENV === 'production') cache.set(name, compiled); // in development, edits show up straight away
  return compiled;
}

// Free-plan footer. It is added to the finished page, and customers cannot reach it:
// their text is escaped and the only styling they control is a validated colour.
const WATERMARK = '<div style="position:fixed;left:0;right:0;bottom:4mm;text-align:center;font:8pt Helvetica,Arial,sans-serif;color:#9aa5b1;">Made with PDF API · Free plan</div>';

/** Fills a template with already-validated data and returns a complete HTML page. */
export function renderTemplate(name, context, { watermark = false } = {}) {
  const { body, layout } = load(name);
  const inner = body(context);
  let html = layout({ title: context.title, body: inner });
  if (watermark) html = html.includes('</body>') ? html.replace('</body>', `${WATERMARK}</body>`) : html + WATERMARK;
  return html;
}