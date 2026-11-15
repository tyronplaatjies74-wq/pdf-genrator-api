import dns from 'node:dns/promises';
import net from 'node:net';
import { HttpError } from '../utils/httpError.js';
import { logger } from '../utils/logger.js';

// Only plain web ports. Stops probing of odd services on a public host.
const ALLOWED_PORTS = new Set(['', '80', '443']);

// Address ranges a customer-supplied URL must never reach: loopback, private networks,
// link-local (cloud metadata lives at 169.254.169.254), carrier NAT, multicast, reserved,
// and IPv6 ranges that can smuggle an IPv4 address (mapped, NAT64, 6to4, Teredo).
const blocked = new net.BlockList();
for (const [addr, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) blocked.addSubnet(addr, bits, 'ipv4');
for (const [addr, bits] of [
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['100::', 64],
  ['2001::', 32], ['2001:db8::', 32], ['2002::', 16], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
]) blocked.addSubnet(addr, bits, 'ipv6');

// IPv4-mapped IPv6 (::ffff:a.b.c.d) is kept in its own list and only ever checked against IPv6
// input: Node treats IPv4 addresses as living inside that range, so adding it to the main
// list would block every IPv4 address.
const mappedV6 = new net.BlockList();
mappedV6.addSubnet('::ffff:0:0', 96, 'ipv6');

export function isBlockedIp(ip) {
  const clean = String(ip).split('%')[0];
  if (net.isIPv4(clean)) return blocked.check(clean, 'ipv4');
  if (net.isIPv6(clean)) return blocked.check(clean, 'ipv6') || mappedV6.check(clean, 'ipv6');
  return true; // not an IP we understand: refuse
}

const deny = (msg) => new HttpError(400, 'url_not_allowed', msg);
const withTimeout = (p, ms) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms).unref())]);

/** Throws a 400 HttpError unless the URL is plain http(s) and every address it resolves to is public. */
export async function assertPublicUrl(raw) {
  let u;
  try {
    u = new URL(raw); // also normalises tricks like http://2130706433/ and http://0x7f.1/
  } catch {
    throw deny('Invalid URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw deny('Only http and https URLs are allowed');
  if (u.username || u.password) throw deny('URLs containing credentials are not allowed');
  if (!ALLOWED_PORTS.has(u.port)) throw deny('Only ports 80 and 443 are allowed');

  const host = u.hostname.replace(/^\[|\]$/g, '');
  let addrs;
  if (net.isIP(host)) {
    addrs = [host];
  } else {
    try {
      addrs = (await withTimeout(dns.lookup(host, { all: true }), 5000)).map((a) => a.address);
    } catch {
      throw deny('Host could not be resolved');
    }
  }
  if (!addrs.length || addrs.some(isBlockedIp)) throw deny('URL points to a private or reserved address');
  return u;
}

/**
 * Locks down a browser page before any content loads:
 *  - JavaScript is off, so submitted HTML cannot run scripts or make its own network calls
 *  - every request the page makes (including redirects, images, CSS, iframes) is checked,
 *    and anything that is not a public http(s) address is cancelled
 */
export async function guardPage(page) {
  await page.setJavaScriptEnabled(false);
  await page.setRequestInterception(true);

  const verdicts = new Map(); // one DNS check per host per page
  page.on('request', (req) => {
    const url = req.url();
    if (url === 'about:blank' || url.startsWith('data:')) {
      req.continue().catch(() => {});
      return;
    }
    let key = url;
    try {
      const u = new URL(url);
      key = `${u.protocol}//${u.username}:${u.password}@${u.host}`;
    } catch { /* checked below, will be refused */ }

    let verdict = verdicts.get(key);
    if (!verdict) {
      verdict = assertPublicUrl(url).then(
        () => true,
        (err) => {
          logger.warn({ url: url.slice(0, 200), reason: err.message }, 'blocked outbound request');
          return false;
        },
      );
      verdicts.set(key, verdict);
    }
    verdict
      .then((ok) => (ok ? req.continue() : req.abort('blockedbyclient')))
      .catch(() => {}); // page may already be closed
  });
}
