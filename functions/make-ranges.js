// Builds the list of address ranges for the countries Codera is shut in.
//
// The whole world's addresses are about 31MB, and we don't need them: the only
// question this function ever answers is "is this one of the closed countries",
// so everything else is dropped. Run it again whenever that list changes, or
// every few months to pick up ranges that have moved hands:
//
//   node functions/make-ranges.js
//
// Source: sapics/ip-location-db, built from DB-IP's free country database,
// CC BY 4.0. Attribution sits in the file it writes.
const fs = require('fs');
const path = require('path');

const SHUT = ['AU'];
const BASE = 'https://raw.githubusercontent.com/sapics/ip-location-db/main/dbip-country';
const OUT = path.join(__dirname, 'shut-ranges.json');

const v4 = (ip) => ip.split('.').reduce((n, part) => n * 256 + Number(part), 0);

/** An IPv6 address as 32 lower-case hex digits, so plain string order works. */
function v6(ip) {
  const [head, tail] = ip.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const gap = 8 - left.length - right.length;
  const parts = [...left, ...Array(Math.max(gap, 0)).fill('0'), ...right];
  return parts.map(p => p.padStart(4, '0')).join('').toLowerCase();
}

async function grab(name) {
  const res = await fetch(`${BASE}/${name}`);
  if (!res.ok) throw new Error(`${name} → ${res.status}`);
  return res.text();
}

(async () => {
  const out = { note: 'IP data by DB-IP (https://db-ip.com), CC BY 4.0', v4: [], v6: [] };

  const four = await grab('dbip-country-ipv4.csv');
  for (const line of four.split('\n')) {
    const [start, end, code] = line.split(',');
    if (!code || !SHUT.includes(code.trim())) continue;
    out.v4.push(v4(start), v4(end));
  }

  const six = await grab('dbip-country-ipv6.csv');
  for (const line of six.split('\n')) {
    const [start, end, code] = line.split(',');
    if (!code || !SHUT.includes(code.trim())) continue;
    out.v6.push(v6(start), v6(end));
  }

  fs.writeFileSync(OUT, JSON.stringify(out));
  const size = (fs.statSync(OUT).size / 1024).toFixed(0);
  console.log(`${SHUT.join(', ')}: ${out.v4.length / 2} IPv4 ranges, ${out.v6.length / 2} IPv6 — ${size}KB`);
})();
