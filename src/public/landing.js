const $ = (s) => document.querySelector(s);
$('#host').textContent = location.origin;

function el(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  kids.forEach((k) => n.append(k));
  return n;
}

let apiKey = '';
const fmt = (n) => n.toLocaleString('en-US');

async function loadPlans() {
  const box = $('#plans');
  try {
    const { plans } = await (await fetch('/v1/plans')).json();
    box.replaceChildren(
      ...plans.map((p) => {
        const card = el('div', { className: 'plan' + (p.id === 'pro' ? ' featured' : '') });
        const cta = p.id === 'free'
          ? el('a', { className: 'btn ghost', href: '#signup', textContent: 'Start free' })
          : el('button', { className: 'btn', type: 'button', textContent: 'Choose ' + p.label });
        if (p.id !== 'free') cta.addEventListener('click', () => openUpgrade(p));
        card.append(
          el('h3', { textContent: p.label }),
          el('div', { className: 'price' }, '$' + p.priceUsd, el('small', { textContent: ' /month' })),
          el('ul', {}, 
            el('li', { textContent: fmt(p.monthlyQuota) + ' PDFs / month' }),
            el('li', { textContent: fmt(p.requestsPerMinute) + ' requests / minute' }),
            el('li', { textContent: p.watermark ? 'Watermarked output' : 'No watermark' }),
          ),
          cta,
        );
        return card;
      }),
    );
  } catch {
    box.replaceChildren(el('p', { className: 'muted', textContent: 'Could not load pricing. Please refresh.' }));
  }
}

function say(sel, text, isError) {
  const m = $(sel);
  m.textContent = text;
  m.classList.toggle('error', Boolean(isError));
}

const ERRORS = {
  email_exists: 'An account already exists for this email.',
  rate_limited: 'Too many attempts. Please wait a minute and try again.',
  invalid_request: 'Please enter a valid email address.',
};

$('#signup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  say('#signup-msg', '');
  try {
    const res = await fetch('/v1/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: $('#email').value.trim() }),
    });
    const body = await res.json();
    if (!res.ok) return say('#signup-msg', ERRORS[body.error] || 'Something went wrong. Please try again.', true);
    apiKey = body.apiKey;
    $('#key-value').textContent = apiKey;
    $('#upgrade-key').value = apiKey;
    $('#key-box').hidden = false;
    say('#signup-msg', 'Key created. Try the curl example above.');
  } catch {
    say('#signup-msg', 'Network error. Please try again.', true);
  } finally {
    btn.disabled = false;
  }
});

$('#copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(apiKey);
    $('#copy').textContent = 'Copied';
  } catch {
    $('#copy').textContent = 'Press Ctrl+C';
  }
});

let chosenTier = '';
function openUpgrade(plan) {
  chosenTier = plan.id;
  $('#upgrade-tier').textContent = plan.label;
  $('#upgrade').hidden = false;
  say('#upgrade-msg', apiKey ? '' : 'Need a key first? Create a free one above, then come back.');
  $('#upgrade').scrollIntoView({ behavior: 'smooth' });
}

$('#upgrade-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  say('#upgrade-msg', '');
  try {
    const res = await fetch('/v1/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': $('#upgrade-key').value.trim() },
      body: JSON.stringify({ tier: chosenTier }),
    });
    const body = await res.json();
    if (res.ok && body.url) return (window.location.href = body.url);
    const msg = body.error === 'billing_disabled' ? 'Paid plans are not available yet.'
      : res.status === 401 ? 'That API key was not recognized.' : 'Could not start checkout. Please try again.';
    say('#upgrade-msg', msg, true);
  } catch {
    say('#upgrade-msg', 'Network error. Please try again.', true);
  } finally {
    btn.disabled = false;
  }
});

loadPlans();