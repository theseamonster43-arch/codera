const { onRequest } = require('firebase-functions/v2/https');
const fs = require('fs');
const path = require('path');

/**
 * Whether a request came from a country Codera is shut in.
 *
 * The website already decides where it is from the clock and the language the
 * browser is set to. That is a declaration, not evidence — anyone can change
 * both in half a minute, in either direction: someone in Sydney can let
 * themselves in, and someone in London can lock themselves out by fiddling
 * with their clock. This answers the other half, from the address the request
 * actually arrived at Google from.
 *
 * Both still count. The site stays shut if either says Australia, because the
 * clock catches someone whose address we can't place, and the address catches
 * someone who changed their clock.
 *
 * Neither is a wall, and together they aren't either — a VPN walks through
 * both. The standard is reasonable steps, not a border.
 *
 * Nothing is kept. The address is read from the request, compared against the
 * ranges, and forgotten; no log records who asked or from where.
 */

// Only the ranges for the closed countries are shipped — the whole world is
// about 31MB and would answer a question nobody asks. functions/make-ranges.js
// rebuilds this. IP data by DB-IP (https://db-ip.com), CC BY 4.0.
let ranges = null;
function shutRanges() {
  if (!ranges) {
    ranges = JSON.parse(fs.readFileSync(path.join(__dirname, 'shut-ranges.json'), 'utf8'));
  }
  return ranges;
}

/** The first address in the chain: the client, before any proxy added its own. */
function callerIp(req) {
  const chain = String(req.headers['x-forwarded-for'] || '').split(',');
  const first = (chain[0] || '').trim();
  if (first) return first;
  return (req.socket && req.socket.remoteAddress) || '';
}

const asV4 = ip => {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    const byte = Number(part);
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) return null;
    n = n * 256 + byte;
  }
  return n;
};

/** 32 hex digits, so ordinary string comparison sorts addresses correctly. */
function asV6(ip) {
  if (!ip.includes(':')) return null;
  const [head, tail] = ip.split('::');
  const left = head ? head.split(':').filter(Boolean) : [];
  const right = tail ? tail.split(':').filter(Boolean) : [];
  const gap = 8 - left.length - right.length;
  if (gap < 0 || (!ip.includes('::') && left.length !== 8)) return null;
  const parts = [...left, ...Array(Math.max(gap, 0)).fill('0'), ...right];
  const hex = parts.map(p => p.padStart(4, '0')).join('').toLowerCase();
  return /^[0-9a-f]{32}$/.test(hex) ? hex : null;
}

/**
 * The ranges are flat and sorted — start, end, start, end — so this walks to
 * the last range beginning at or before the address and asks whether it
 * reaches far enough to contain it.
 */
function inside(flat, value) {
  let low = 0;
  let high = flat.length / 2 - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (flat[mid * 2] <= value) { found = mid; low = mid + 1; } else { high = mid - 1; }
  }
  return found >= 0 && flat[found * 2 + 1] >= value;
}

exports.whereAmI = onRequest({ cors: true, maxInstances: 5, memory: '256MiB' }, (req, res) => {
  const ip = callerIp(req);

  // ::ffff:203.0.113.4 is an IPv4 address wearing IPv6 clothes.
  const plain = ip.replace(/^::ffff:/i, '');
  const four = asV4(plain);
  const six = four === null ? asV6(ip) : null;

  let shut = false;
  try {
    const list = shutRanges();
    if (four !== null) shut = inside(list.v4, four);
    else if (six) shut = inside(list.v6, six);
  } catch (e) {
    // Couldn't read the list. Say nothing rather than shutting out the world
    // on a file error; the clock check on the page still applies.
    console.error('[whereAmI]', e.message);
  }

  // Never cached. An hour of caching looked like a kindness and was a trap:
  // the answer is about where you are *now*, so a stale one keeps someone shut
  // out long after they have moved, turned a VPN off, or got a new address.
  // It is one small request per page load, which is cheaper than being wrong.
  res.set('Cache-Control', 'no-store');
  res.json({ shut, known: four !== null || !!six });
});
