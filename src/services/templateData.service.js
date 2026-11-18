import { z } from 'zod';

// ---------- small helpers ----------
const todayZA = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg' }).format(new Date()); // YYYY-MM-DD

/** Number of decimal places a currency uses (ZAR 2, JPY 0, KWD 3). */
export function minorUnits(currency) {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
}

/** Converts a decimal amount to whole minor units (cents) without floating-point surprises. */
export const toMinor = (x, digits) => Math.round(parseFloat((x * 10 ** digits).toPrecision(15)));

const str = (max) => z.string().trim().max(max);
const optStr = (max) => str(max).optional().transform((v) => v || undefined);

const isValidCurrency = (c) => {
  try { new Intl.NumberFormat('en', { style: 'currency', currency: c }); return true; } catch { return false; }
};
const currency = z.string().trim().toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code such as ZAR or USD')
  .refine(isValidCurrency, 'Unknown currency code')
  .default('ZAR');
const locale = z.string().trim()
  .regex(/^[a-z]{2,3}(-[A-Z]{2})?$/, 'Use a locale such as en-ZA or en-US')
  .refine((l) => Intl.NumberFormat.supportedLocalesOf(l).length > 0, 'Unsupported locale')
  .default('en-ZA');
const validDate = (s) => { const d = new Date(`${s}T00:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s); };
const isoDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD').refine(validDate, 'Not a real date');
const hexColor = z.string().trim().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Use a hex colour such as #2563eb');
const amount = z.number().finite().min(0).max(1e9);
const quantity = z.number().finite().positive().max(1e6);

const party = z.object({
  name: str(200).min(1, 'Name is required'),
  address: optStr(500),
  email: optStr(254),
  vatNumber: optStr(30),
  registrationNumber: optStr(30),
});

// ---------- the three templates ----------
const invoiceSchema = z.object({
  invoiceNumber: str(50).min(1, 'Invoice number is required'),
  currency, locale,
  issueDate: isoDate.default(todayZA),
  dueDate: isoDate.optional(),
  from: party,
  to: party,
  items: z.array(z.object({
    description: str(500).min(1, 'Description is required'),
    quantity: quantity.default(1),
    unitPrice: amount,
  })).min(1, 'Add at least one item').max(100, 'At most 100 items'),
  taxRate: z.number().min(0).max(100).default(0),
  notes: optStr(2000),
  accentColor: hexColor.optional(),
}).refine((d) => !d.dueDate || d.dueDate >= d.issueDate, { path: ['dueDate'], message: 'Due date cannot be before the issue date' });

function prepareInvoice(d) {
  const digits = minorUnits(d.currency);
  const items = d.items.map((i) => ({
    description: i.description,
    quantity: i.quantity,
    unitPrice: toMinor(i.unitPrice, digits),
    amount: toMinor(i.quantity * i.unitPrice, digits),
  }));
  const subtotal = items.reduce((s, i) => s + i.amount, 0);
  const tax = Math.round(parseFloat(((subtotal * d.taxRate) / 100).toPrecision(15)));
  return {
    ...d, items, subtotal, tax, total: subtotal + tax,
    taxInvoice: Boolean(d.from.vatNumber), // only a VAT-registered supplier may call it a "Tax Invoice"
    title: `${d.from.vatNumber ? 'Tax Invoice' : 'Invoice'} ${d.invoiceNumber}`,
  };
}

const receiptSchema = z.object({
  merchant: z.object({ name: str(200).min(1, 'Name is required'), address: optStr(500) }),
  receiptNumber: optStr(50),
  date: isoDate.default(todayZA),
  currency, locale,
  items: z.array(z.object({
    description: str(500).min(1, 'Description is required'),
    quantity: quantity.optional(),
    amount,
  })).min(1, 'Add at least one item').max(100, 'At most 100 items'),
  paymentMethod: optStr(100),
  footer: optStr(300),
});

function prepareReceipt(d) {
  const digits = minorUnits(d.currency);
  const items = d.items.map((i) => ({ description: i.description, quantity: i.quantity, amount: toMinor(i.amount, digits) }));
  return { ...d, items, total: items.reduce((s, i) => s + i.amount, 0), title: `Receipt ${d.receiptNumber ?? ''}`.trim() };
}

const certificateSchema = z.object({
  recipient: str(200).min(1, 'Recipient is required'),
  heading: optStr(100),
  description: optStr(1000),
  date: isoDate.default(todayZA),
  issuer: optStr(200),
  signatory: optStr(200),
  accentColor: hexColor.optional(),
  locale,
});

const prepareCertificate = (d) => ({ ...d, title: `Certificate - ${d.recipient}` });

const TEMPLATES = {
  invoice: { schema: invoiceSchema, prepare: prepareInvoice },
  receipt: { schema: receiptSchema, prepare: prepareReceipt },
  certificate: { schema: certificateSchema, prepare: prepareCertificate },
};

/** Validates the customer's data for a template and works out totals. */
export function prepareTemplateData(name, input) {
  const t = TEMPLATES[name];
  const r = t.schema.safeParse(input);
  if (!r.success) return { success: false, issues: r.error.issues.map((i) => ({ path: i.path, message: i.message })) };
  return { success: true, context: t.prepare(r.data) };
}

// ---------- the request body of POST /v1/pdf/generate ----------
export const generateRequestSchema = z
  .object({
    html: z.string().optional(),
    url: z.string().url('Invalid URL provided').optional(),
    template: z.enum(['invoice', 'receipt', 'certificate']).optional(),
    data: z.record(z.unknown()).optional(),
    options: z.object({ format: z.string().optional(), landscape: z.boolean().optional() }).optional(),
  })
  .superRefine((d, ctx) => {
    if (['html', 'url', 'template'].filter((k) => d[k]).length !== 1) {
      ctx.addIssue({ code: 'custom', message: 'Provide exactly one of html, url or template' });
    }
  })
  .transform((d, ctx) => {
    if (!d.template) return d;
    const r = prepareTemplateData(d.template, d.data ?? {});
    if (!r.success) {
      r.issues.forEach((i) => ctx.addIssue({ code: 'custom', path: ['data', ...i.path], message: i.message }));
      return z.NEVER;
    }
    return { ...d, context: r.context };
  });