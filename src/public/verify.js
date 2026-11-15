const $ = (s) => document.querySelector(s);
const status = $('#status');
const result = $('#result');
const reveal = $('#reveal');
const token = new URLSearchParams(location.search).get('token');

function show(title, message, color) {
  status.textContent = title;
  status.style.color = color;
  result.textContent = message;
}

function showKey(data) {
  status.textContent = 'Email verified';
  status.style.color = '#16a34a';

  const label = document.createElement('p');
  label.textContent = 'Here is your API key:';
  label.style.cssText = 'margin: 0 0 8px; font-weight: 500;';

  const box = document.createElement('div');
  box.textContent = data.apiKey; // textContent: never interpreted as HTML
  box.style.cssText = 'background: #f3f4f6; padding: 12px; border-radius: 6px; word-break: break-all; font-family: monospace; font-size: 14px; font-weight: bold; color: #1f2937; user-select: all;';

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = 'Copy key';
  copy.style.cssText = 'margin-top: 10px; padding: 8px 14px; border: 1px solid #d1d5db; border-radius: 6px; background: white; cursor: pointer;';
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(data.apiKey);
      copy.textContent = 'Copied';
    } catch {
      copy.textContent = 'Select the key above and copy it';
    }
  });

  const note = document.createElement('p');
  note.textContent = data.note;
  note.style.cssText = 'margin: 12px 0 0; font-size: 13px; color: #dc2626; font-weight: 500;';

  result.replaceChildren(label, box, copy, note);
}

if (!token) {
  show('Invalid link', 'No verification token was found in this link. Please use the link from your email.', '#dc2626');
} else {
  show('Confirm your email', 'Click the button to activate your account and show your API key.', '#111827');
  reveal.hidden = false;
}

reveal.addEventListener('click', async () => {
  reveal.disabled = true;
  try {
    const res = await fetch('/v1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const data = await res.json();
    reveal.hidden = true;
    if (!res.ok) {
      show('Verification failed', data.message || 'The link may have expired. Please sign up again.', '#dc2626');
      return;
    }
    history.replaceState(null, '', location.pathname); // the token is single-use; drop it from the address bar
    showKey(data);
  } catch {
    reveal.disabled = false;
    show('Network error', 'Please check your connection and try again.', '#dc2626');
    reveal.hidden = false;
  }
});
