# PDF Generator API

Generate PDFs from HTML or ready-made templates (invoice, receipt, certificate) via a simple JSON API.
Built on Express + Puppeteer with a warm browser pool, SSRF protection, API keys, tiered quotas and Stripe billing.

## Quick start

```bash
cp .env.example .env
npm install
npm run dev          # http://localhost:3000
npm test
```

Docker: `docker build -t pdf-api . && docker run -p 3000:3000 -v pdfdata:/data pdf-api`

## API

All `/v1/pdf/*` endpoints need `X-API-Key: <key>` (or `Authorization: Bearer <key>`).

### `POST /v1/signup`
```bash
curl -X POST localhost:3000/v1/signup -H 'content-type: application/json' -d '{"email":"you@example.com"}'
# → { "apiKey": "pk_live_...", "tier": "free" }
```

### `POST /v1/pdf/generate`
Provide **either** `template` + `data`, **or** raw `html`.

```bash
curl -X POST localhost:3000/v1/pdf/generate \
  -H "X-API-Key: $KEY" -H 'content-type: application/json' \
  -d '{
    "template": "invoice",
    "data": {
      "invoiceNumber": "INV-001", "currency": "USD", "issueDate": "2026-01-15", "taxRate": 10,
      "from": {"name": "Acme Co", "email": "billing@acme.co"},
      "to": {"name": "Jane Doe"},
      "items": [{"description": "Design work", "quantity": 2, "unitPrice": 150}]
    },
    "options": {"format": "A4"}
  }' -o invoice.pdf
```

`options`: `format` (A4, A5, Letter, Legal), `landscape` (bool), `margin` (`{top,right,bottom,left}` as `10mm`, `1in`, ...).

Template data fields:

| Template | Fields |
|---|---|
| `invoice` | `invoiceNumber, currency, issueDate, dueDate, from{name,address,email}, to{...}, items[{description,quantity,unitPrice}], taxRate, notes, accentColor` (totals computed if omitted) |
| `receipt` | `merchant{name,address}, receiptNumber, date, currency, items[{description,quantity,unitPrice}], paymentMethod, footer` |
| `certificate` | `heading, recipient, description, date, issuer, signatory, accentColor` |

### Other endpoints
- `GET /v1/pdf/templates` – list templates
- `GET /v1/pdf/usage` – current month usage
- `POST /v1/billing/checkout` `{ "tier": "pro" }` – returns a Stripe Checkout URL
- `GET /v1/plans` – public plan list (used by the landing page at `/`)
- `GET /health`, `GET /ready` – liveness / readiness

### Errors
JSON `{ "error": "<code>", "message": "..." }`. Notable: `401` bad key, `402 quota_exceeded`, `429 rate_limited` (see `Retry-After`), `503 server_busy`, `504 render_timeout`.

## Monetization setup

1. Create three recurring Prices in Stripe (Starter / Pro / Business) and put their IDs in `.env`.
2. Point a Stripe webhook at `POST /webhooks/stripe` for `checkout.session.completed` and `customer.subscription.created|updated|deleted`.
3. Edit limits and prices in `src/config/tiers.js`.

Free tier is watermarked and quota-capped; paid tiers are hard-capped at their monthly quota (add Stripe metered overage later).

## Security notes
- Rendering runs with JavaScript **disabled**, and every network request is checked: only public http(s) hosts and `data:` URIs load (blocks localhost, private/link-local ranges, `file://`).
- Template data is HTML-escaped by Handlebars.
- API keys are stored as SHA-256 hashes and shown once.

## Before going live
- Verify email ownership at signup (see TODO in `account.routes.js`).
- Swap in-memory rate limiting for Redis and SQLite for Postgres if you run more than one instance.
- Add Terms of Service and a Privacy Policy. This service stores no documents, so say so.
