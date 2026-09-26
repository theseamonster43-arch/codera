/**
 * Codera for the web.
 *
 * The same Firebase project as the app — one account, one feed, one set of
 * security rules — so a post written on a phone is on the site the moment it
 * lands, and a like from either side is the same vote.
 *
 * Written as plain modules against the Firebase CDN rather than a build step:
 * the whole site is three files that Hosting serves as they are.
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, updateProfile, signOut,
  GoogleAuthProvider, GithubAuthProvider, signInWithPopup, signInWithRedirect,
} from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js';
import {
  getFirestore, collection, addDoc, deleteDoc, doc, getDoc, onSnapshot, query,
  orderBy, limit, serverTimestamp, runTransaction, increment, updateDoc, setDoc,
  where, getDocs, getCountFromServer,
} from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js';
import { hostStream, watchStream, recorder, capture, devices, mixer, canStream, elapsed } from './live.js';
import { topicsOf, topicsOfText, learn, rank, WEIGHT } from './taste.js';
import {
  getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject,
} from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-storage.js';
import {
  getFunctions, httpsCallable,
} from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-functions.js';

// None of this is secret: the key only names the project. Sign-in and the
// security rules are what protect an account.
const app = initializeApp({
  apiKey: 'AIzaSyAff6wCaEfD0jOrYI51xbqyXR3jGx6KEd4',
  authDomain: 'codera-46b86.firebaseapp.com',
  projectId: 'codera-46b86',
  storageBucket: 'codera-46b86.firebasestorage.app',
  messagingSenderId: '376496609142',
  appId: '1:376496609142:web:732200bb605656ec288c57',
});

/**
 * Inside the phone app.
 *
 * The app shows the live pages (going live, watching a stream) in a web view,
 * because a phone's web view can record a stream for saving and the app itself
 * cannot. `?app=ios` or `?app=android` in the address turns the site into that
 * screen alone: no header, no sidebar, and a message back to the app when it is
 * finished. The app hands over its own signed-in session before the page loads,
 * so nobody signs in twice; it is written where Firebase keeps a web session,
 * before Firebase Auth starts and reads it.
 */
const APP_MODE = new URLSearchParams(location.search).get('app');     // 'ios' | 'android' | null
// A streamer's chat, popped out into a window of its own (?popout=chat): the chat alone.
const POPOUT = new URLSearchParams(location.search).get('popout');
if (POPOUT) document.documentElement.classList.add('in-app', 'popout');
const toApp = msg => { try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(msg)); } catch (e) {} };

if (APP_MODE && window.__CODERA_SESSION__) {
  const session = Object.assign({}, window.__CODERA_SESSION__, { apiKey: app.options.apiKey, appName: '[DEFAULT]' });
  await new Promise(done => {
    const open = indexedDB.open('firebaseLocalStorageDb', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('firebaseLocalStorage', { keyPath: 'fbase_key' });
    open.onsuccess = () => {
      const tx = open.result.transaction('firebaseLocalStorage', 'readwrite');
      tx.objectStore('firebaseLocalStorage').put({
        fbase_key: 'firebase:authUser:' + app.options.apiKey + ':[DEFAULT]',
        value: session,
      });
      tx.oncomplete = done;
      tx.onerror = done;
    };
    open.onerror = done;
  });
}
if (APP_MODE) document.documentElement.classList.add('in-app');

const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const fns = getFunctions(app, 'us-central1');

/**
 * Stripe's publishable key. Public by design — it can start a payment and
 * nothing else. The secret key never leaves Google Secret Manager, where only
 * the Cloud Functions can read it.
 */
const STRIPE_PK = {
  live: 'pk_live_51UEWrl6MmwHJvfDUwlK1NpA8DibVh1As0WA33jyt2SN5RVHvdtiqiYbUPZZEMkuWNy4nbj2k4wHSNxx1Lbh4pAfg00t1oM0YIw',
  test: 'pk_test_51UEWrl6MmwHJvfDUDKvxB0xnxR6xI0CKxFrLeRDCruLRHupCkLFBTLSBT0AhQm6XgHXrx1j84hZVdtJ1v2xR4yF400YEE2TpNO',
};

const POSTS = 'posts';
const SHORT_MAX = 60;          // the same ceiling the app puts on a short
const PLUS_PRICE = '$10';

/**
 * What $10 looks like where the reader lives.
 *
 * Plus is charged in US dollars — that is what Stripe takes and what the card
 * statement will say — but ten dollars means nothing much until you see it in
 * your own money. So the page shows the local equivalent beside it, clearly
 * marked as an approximation.
 *
 * The region comes from the browser's own locale rather than from an address
 * or an IP lookup: nothing about the reader is sent anywhere to work it out.
 */
const CURRENCY_BY_REGION = {
  AE: 'AED', SA: 'SAR', QA: 'QAR', KW: 'KWD', BH: 'BHD', OM: 'OMR', EG: 'EGP',
  IN: 'INR', PK: 'PKR', BD: 'BDT', LK: 'LKR', NP: 'NPR',
  GB: 'GBP', IE: 'EUR', DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR',
  PT: 'EUR', BE: 'EUR', AT: 'EUR', FI: 'EUR', GR: 'EUR',
  CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', CZ: 'CZK', TR: 'TRY',
  RU: 'RUB', UA: 'UAH',
  US: 'USD', CA: 'CAD', MX: 'MXN', BR: 'BRL', AR: 'ARS', CL: 'CLP', CO: 'COP',
  AU: 'AUD', NZ: 'NZD', JP: 'JPY', CN: 'CNY', HK: 'HKD', TW: 'TWD', KR: 'KRW',
  SG: 'SGD', MY: 'MYR', ID: 'IDR', TH: 'THB', PH: 'PHP', VN: 'VND',
  ZA: 'ZAR', NG: 'NGN', KE: 'KES', GH: 'GHS', MA: 'MAD', IL: 'ILS',
};

/**
 * Where someone is, taken from the clock rather than the language.
 *
 * A machine in Dubai usually still says en-US, because that is what Windows
 * ships with — so the language is a poor guess at the country and this got it
 * wrong for most of the people it was meant for. The time zone is set from
 * where the machine actually is, and reading it sends nothing anywhere, which
 * an IP lookup cannot say.
 */
const CURRENCY_BY_ZONE = {
  'Asia/Dubai': 'AED', 'Asia/Muscat': 'OMR', 'Asia/Riyadh': 'SAR',
  'Asia/Qatar': 'QAR', 'Asia/Kuwait': 'KWD', 'Asia/Bahrain': 'BHD',
  'Africa/Cairo': 'EGP', 'Asia/Amman': 'JOD', 'Asia/Beirut': 'LBP',
  'Asia/Baghdad': 'IQD', 'Asia/Tehran': 'IRR', 'Asia/Jerusalem': 'ILS',

  'Asia/Kolkata': 'INR', 'Asia/Calcutta': 'INR', 'Asia/Karachi': 'PKR',
  'Asia/Dhaka': 'BDT', 'Asia/Colombo': 'LKR', 'Asia/Kathmandu': 'NPR',

  'Europe/London': 'GBP', 'Europe/Dublin': 'EUR', 'Europe/Berlin': 'EUR',
  'Europe/Paris': 'EUR', 'Europe/Madrid': 'EUR', 'Europe/Rome': 'EUR',
  'Europe/Amsterdam': 'EUR', 'Europe/Lisbon': 'EUR', 'Europe/Brussels': 'EUR',
  'Europe/Vienna': 'EUR', 'Europe/Helsinki': 'EUR', 'Europe/Athens': 'EUR',
  'Europe/Zurich': 'CHF', 'Europe/Stockholm': 'SEK', 'Europe/Oslo': 'NOK',
  'Europe/Copenhagen': 'DKK', 'Europe/Warsaw': 'PLN', 'Europe/Prague': 'CZK',
  'Europe/Istanbul': 'TRY', 'Europe/Moscow': 'RUB', 'Europe/Kyiv': 'UAH',
  'Europe/Kiev': 'UAH',

  'America/Toronto': 'CAD', 'America/Vancouver': 'CAD', 'America/Edmonton': 'CAD',
  'America/Winnipeg': 'CAD', 'America/Halifax': 'CAD',
  'America/Mexico_City': 'MXN', 'America/Sao_Paulo': 'BRL',
  'America/Santiago': 'CLP', 'America/Bogota': 'COP', 'America/Lima': 'PEN',
  'America/Buenos_Aires': 'ARS', 'America/Argentina/Buenos_Aires': 'ARS',

  'Australia/Sydney': 'AUD', 'Australia/Melbourne': 'AUD',
  'Australia/Brisbane': 'AUD', 'Australia/Perth': 'AUD',
  'Pacific/Auckland': 'NZD',

  'Asia/Tokyo': 'JPY', 'Asia/Shanghai': 'CNY', 'Asia/Hong_Kong': 'HKD',
  'Asia/Taipei': 'TWD', 'Asia/Seoul': 'KRW', 'Asia/Singapore': 'SGD',
  'Asia/Kuala_Lumpur': 'MYR', 'Asia/Jakarta': 'IDR', 'Asia/Bangkok': 'THB',
  'Asia/Manila': 'PHP', 'Asia/Ho_Chi_Minh': 'VND', 'Asia/Saigon': 'VND',

  'Africa/Johannesburg': 'ZAR', 'Africa/Lagos': 'NGN', 'Africa/Nairobi': 'KES',
  'Africa/Accra': 'GHS', 'Africa/Casablanca': 'MAD', 'Africa/Tunis': 'TND',
};

function localCurrency() {
  let code = null;

  // The clock first.
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    code = CURRENCY_BY_ZONE[zone] || null;
    // Every American zone, of which there are many, means dollars already.
    if (!code && /^America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Boise|Juneau|Indiana)/.test(zone)) {
      return null;
    }
  } catch (e) { /* no time zone to read */ }

  // Then the language, for a machine whose clock says nothing useful.
  if (!code) {
    try {
      const tag = navigator.language || 'en-US';
      const region = (new Intl.Locale(tag).region) || tag.split('-')[1];
      code = CURRENCY_BY_REGION[String(region || '').toUpperCase()] || null;
    } catch (e) { /* nothing to go on */ }
  }

  return code && code !== 'USD' ? code : null;
}

/**
 * The rate for one dollar, kept for a day.
 *
 * A free, keyless service, and a failure is simply no local price rather than
 * a wrong one — better to show nothing than a number nobody can trust.
 */
async function dollarRate(code) {
  const KEY = 'codera.rate.' + code;
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (kept && Date.now() - kept.at < 86400000) return kept.rate;
  } catch (e) {}

  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    const data = await res.json();
    const rate = data && data.rates && data.rates[code];
    if (!rate) return null;
    try { localStorage.setItem(KEY, JSON.stringify({ rate, at: Date.now() })); } catch (e) {}
    return rate;
  } catch (e) { return null; }
}

/**
 * The price, in the money the reader actually pays in — "AED 36.73" — or
 * nothing at all where we cannot say, in which case the dollar price stands.
 *
 * This is the price now, not an approximation of one: Stripe presents and
 * charges in the customer's own currency, so the amount shown here is the
 * amount that leaves their account, and their bank does no second conversion.
 * The rate moves during the day, as any currency does, and Stripe's own
 * figure is on the checkout page before anybody pays.
 */
async function localHeadline() {
  const code = localCurrency();
  if (!code) return '';
  const rate = await dollarRate(code);
  if (!rate) return '';
  const amount = 10 * rate;
  // Whole numbers where the currency has no small unit worth showing.
  const big = amount >= 500;
  return new Intl.NumberFormat(navigator.language || 'en', {
    style: 'currency', currency: code,
    maximumFractionDigits: big ? 0 : 2, minimumFractionDigits: big ? 0 : 2,
  }).format(amount);
}

/** Puts it wherever the dollar price is standing in for it. */
function showLocalPrice() {
  localHeadline().then(shown => {
    if (!shown) return;
    for (const id of ['priceBig', 'payPriceBig']) {
      const box = el(id);
      if (box) box.textContent = shown;
    }
    for (const id of ['plusBtn', 'payGo']) {
      const btn = el(id);
      if (btn && /\$10\/month/.test(btn.textContent)) {
        btn.textContent = btn.textContent.replace('$10/month', shown + '/month');
      }
    }
  });
}
// Plus is paid for with Stripe. Nothing about the price or the card is decided
// here: this page only asks the server to start a checkout, and Stripe takes it
// from there on its own pages.

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const $ = sel => document.querySelector(sel);
const el = id => document.getElementById(id);

/** Anything a person typed is escaped before it goes near innerHTML. */
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

/** 1.2K, 3.4M — the counts under a video. */
function compact(n) {
  if (!n) return '0';
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

/** "1 like", "12 likes" — counted properly rather than "1 likes". */
const plural = (n, word) => compact(n || 0) + ' ' + word + (n === 1 ? '' : 's');

/** 7:38 */
function clock(sec) {
  if (sec == null || !isFinite(sec)) return '';
  const s = Math.floor(sec);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

/** "just now", "5m", "3h", "2d", or a date. */
function ago(ts) {
  const ms = ts && ts.toMillis ? ts.toMillis() : null;
  if (!ms) return 'just now';
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  if (s < 604800) return Math.floor(s / 86400) + 'd';
  return new Date(ms).toLocaleDateString();
}

const plusDate = ms => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** Firebase error codes are not something to put in front of a person. */
function message(e) {
  const map = {
    'auth/invalid-credential': 'Wrong email or password.',
    'auth/invalid-login-credentials': 'Wrong email or password.',
    'auth/user-not-found': 'Wrong email or password.',
    'auth/wrong-password': 'Wrong email or password.',
    'auth/invalid-email': "That doesn't look like an email address.",
    'auth/email-already-in-use': 'An account already uses that email. Sign in instead.',
    'auth/weak-password': 'Use at least 8 characters.',
    'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
    'auth/network-request-failed': 'No connection. Check your internet.',
    'permission-denied': "You don't have permission to do that.",
  };
  if (e && map[e.code]) return map[e.code];
  // The Cloud Functions write their refusals for people ("This streamer hasn't
  // set up tips yet"), so those are shown as they are, minus the status number
  // the SDK adds. Only a crash on the server stays vague.
  if (e && typeof e.code === 'string' && e.code.startsWith('functions/')
      && e.code !== 'functions/internal' && e.message) {
    return String(e.message).replace(/\s*\[\d+\]$/, '');
  }
  // Codera's own errors, and Stripe's card messages, are already in plain words.
  if (e && !e.code && e.name === 'Error' && e.message) return e.message;
  return 'Something went wrong. Try again.';
}

let toastTimer = null;
function toast(text) {
  const t = el('toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

// ---------------------------------------------------------------------------
// The drawings — the same paths as src/Icons.js, so app and site are one product
// ---------------------------------------------------------------------------

const svg = inner => `<svg viewBox="0 0 24 24" class="i">${inner}</svg>`;

const I = {
  home: on => svg(on
    ? '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" fill="currentColor" stroke="none"/>'
    : '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
  shorts: on => svg(on
    ? '<rect x="4" y="2.5" width="16" height="19" rx="3.5" fill="currentColor" stroke="none"/>'
      + '<path d="M10.5 9.2v5.6l4.6-2.8z" fill="var(--bg)" stroke="none"/>'
    : '<rect x="4" y="2.5" width="16" height="19" rx="3.5"/>'
      + '<path d="M10.5 9.2v5.6l4.6-2.8z" fill="currentColor" stroke="none"/>'),
  followed: on => svg(
    `<circle cx="9" cy="8" r="3.4" ${on ? 'fill="currentColor" stroke="none"' : ''}/>`
    + `<path d="M2.8 20.2c0-3.3 2.8-5.4 6.2-5.4s6.2 2.1 6.2 5.4" ${on ? 'fill="currentColor" stroke="none"' : ''}/>`
    + '<path d="M16.5 5.2a3.2 3.2 0 0 1 0 6.1M17.8 14.9c2.2.5 3.7 2.1 3.7 4.4"/>'),
  person: on => svg(
    `<circle cx="12" cy="8" r="3.6" ${on ? 'fill="currentColor" stroke="none"' : ''}/>`
    + `<path d="M4.8 20.5c0-3.6 3.2-5.9 7.2-5.9s7.2 2.3 7.2 5.9" ${on ? 'fill="currentColor" stroke="none"' : ''}/>`),
  plus: () => svg('<path d="M12 5v14M5 12h14" stroke-width="2.2"/>'),
  play: () => svg('<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>'),
  code: () => svg('<path d="M8.5 8 5 12l3.5 4M15.5 8l3.5 4-3.5 4M13.6 5.5l-3.2 13"/>'),
  comment: () => svg('<path d="M21 11.5a8 8 0 0 1-8 8H7l-4 2.5V11.5a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z"/>'),
  sparkle: () => svg(
    '<path d="M10 3.5c.6 4.2 2.3 5.9 6.5 6.5-4.2.6-5.9 2.3-6.5 6.5-.6-4.2-2.3-5.9-6.5-6.5 4.2-.6 5.9-2.3 6.5-6.5z" stroke-width="1.7"/>'
    + '<path d="M18 14.5c.3 1.9 1.1 2.7 3 3-1.9.3-2.7 1.1-3 3-.3-1.9-1.1-2.7-3-3 1.9-.3 2.7-1.1 3-3z" fill="currentColor" stroke="none"/>'),
  noads: () => svg('<rect x="3" y="5" width="18" height="13" rx="3" stroke-width="1.8"/>'
    + '<path d="M10.2 9.4v4.2l3.6-2.1z" fill="currentColor" stroke="none"/><path d="M4 21 20 3" stroke-width="1.8"/>'),
  up: on => svg(`<path d="M7 10.5h2.6l1.9-5a2 2 0 0 1 3.8 1.1l-.6 3.9h4a1.9 1.9 0 0 1 1.9 2.2l-.9 5.5A2.4 2.4 0 0 1 17.4 20H7z" ${on ? 'fill="currentColor"' : ''}/><path d="M3.5 10.5H7V20H3.5z" ${on ? 'fill="currentColor"' : ''}/>`),
  down: on => svg(`<g transform="rotate(180 12 12)"><path d="M7 10.5h2.6l1.9-5a2 2 0 0 1 3.8 1.1l-.6 3.9h4a1.9 1.9 0 0 1 1.9 2.2l-.9 5.5A2.4 2.4 0 0 1 17.4 20H7z" ${on ? 'fill="currentColor"' : ''}/><path d="M3.5 10.5H7V20H3.5z" ${on ? 'fill="currentColor"' : ''}/></g>`),
  check: () => svg('<path d="M5 12.5 10 17.5 19 7" stroke-width="2.6"/>'),
  image: () => svg('<rect x="3" y="4.5" width="18" height="15" rx="3"/>'
    + '<circle cx="8.6" cy="10" r="1.7"/><path d="M3.4 17.2 9 12.3l4 3.3 3.2-2.6 4.4 3.8"/>'),
  camera: () => svg('<path d="M3.5 8.6a2 2 0 0 1 2-2h1.7l1.1-2h7.4l1.1 2h1.7a2 2 0 0 1 2 2v8.9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>'
    + '<circle cx="12" cy="12.8" r="3.6"/>'),
  dots: () => svg('<circle cx="12" cy="5.5" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="18.5" r="1.6" fill="currentColor" stroke="none"/>'),
  trash: () => svg('<path d="M4.5 7h15M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7M6.8 7l.9 12.1A1.9 1.9 0 0 0 9.6 21h4.8a1.9 1.9 0 0 0 1.9-1.9L17.2 7"/>'),
  back: () => svg('<path d="M15 5l-7 7 7 7"/>'),
  sun: () => svg('<circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.2M12 19.2v2.2M4.2 12H2M22 12h-2.2M6.3 6.3 4.8 4.8M19.2 19.2l-1.5-1.5M17.7 6.3l1.5-1.5M4.8 19.2l1.5-1.5"/>'),
  moon: () => svg('<path d="M20 13.4A8.2 8.2 0 0 1 10.6 4a8.4 8.4 0 1 0 9.4 9.4z"/>'),
  auto: () => svg('<circle cx="12" cy="12" r="8.4"/><path d="M12 3.6v16.8" /><path d="M12 3.6a8.4 8.4 0 0 1 0 16.8z" fill="currentColor" stroke="none"/>'),
  live: on => svg(`<circle cx="12" cy="12" r="2.3" ${on ? 'fill="currentColor" stroke="none"' : 'fill="currentColor" stroke="none"'}/>`
    + '<path d="M8.3 8.3a5.3 5.3 0 0 0 0 7.4M15.7 8.3a5.3 5.3 0 0 1 0 7.4M5.4 5.4a9.3 9.3 0 0 0 0 13.2M18.6 5.4a9.3 9.3 0 0 1 0 13.2"'
    + (on ? ' stroke-width="2.2"' : '') + '/>'),
  tip: () => svg('<circle cx="12" cy="12" r="8.6"/><path d="M14.7 9.4c-.5-.9-1.5-1.5-2.7-1.5-1.5 0-2.7.8-2.7 2s1.1 1.7 2.7 2 2.7.8 2.7 2.1-1.2 2-2.7 2c-1.2 0-2.3-.6-2.8-1.5M12 6.3v1.6M12 16.1v1.6"/>'),
  send: () => svg('<path d="M4.5 12 20 4.5l-5.5 15.5-3-6.5z" stroke-linejoin="round"/><path d="M11.5 13.5 20 4.5"/>'),
  screen: () => svg('<rect x="3" y="4.5" width="18" height="12" rx="2.2"/><path d="M9 20h6M12 16.5V20"/>'),
  flag: () => svg('<path d="M5 21V4M5 4h12l-2.5 4L17 12H5"/>'),
  close: () => svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  mic: () => svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>'),
};

/** The Codera mark: the </> glyph on the green→blue tile. */
let markSeq = 0;
function mark(size) {
  const id = 'mk' + (++markSeq);
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}">
    <defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="100">
      <stop offset="0" stop-color="#22c55e"/><stop offset="1" stop-color="#60a5fa"/>
    </linearGradient></defs>
    <rect width="100" height="100" rx="30" fill="url(#${id})"/>
    <path d="M35 35.5 L21.5 50 L35 64.5 M65 35.5 L78.5 50 L65 64.5 M55.5 32.5 L44.5 67.5"
          fill="none" stroke="#fff" stroke-width="${size >= 48 ? 6.2 : 7.5}"
          stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

// ---------------------------------------------------------------------------
// Appearance
// ---------------------------------------------------------------------------

const THEMES = ['system', 'dark', 'light'];
let theme = localStorage.getItem('codera.theme') || 'system';

function applyTheme() {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
  el('themeBtn').innerHTML = theme === 'light' ? I.sun() : theme === 'dark' ? I.moon() : I.auto();
  el('themeBtn').title = 'Appearance: ' + theme;
}

// ---------------------------------------------------------------------------
// The navigation, and its three widths
// ---------------------------------------------------------------------------

const NAV = [
  { to: '#/',         icon: 'home',     label: 'Home' },
  { to: '#/shorts',   icon: 'shorts',   label: 'Shorts' },
  { to: '#/followed', icon: 'followed', label: 'Following' },
  { to: '#/you',      icon: 'person',   label: 'You' },
];

// Whether the reader has asked for the full sidebar. Only consulted where the
// window is wide enough to hold one; narrower windows decide for themselves.
let wantFull = localStorage.getItem('codera.nav') !== 'rail';
let overlay = false;          // the sidebar shown over the page, on request

function navMode() {
  const w = window.innerWidth;
  if (w >= 1300) return wantFull ? 'full' : 'rail';
  if (w >= 800) return 'rail';
  return 'none';              // too narrow to spare the width: no sidebar
}

function layout() {
  const mode = navMode();
  document.body.classList.toggle('nav-full', mode === 'full');
  document.body.classList.toggle('nav-rail', mode === 'rail');
  document.body.classList.toggle('nav-none', mode === 'none');
  document.body.classList.toggle('drawer-over', overlay && mode !== 'full');

  const docked = mode === 'full';
  el('drawer').hidden = !(docked || overlay);
  el('scrim').hidden = !(overlay && !docked);
  el('rail').hidden = mode !== 'rail';
  // The tab bar along the bottom is a phone's answer to a hidden sidebar, and
  // only a phone's: on a desktop window dragged narrow it is in the way, with a
  // mouse and the menu button both to hand. Asked of the pointer rather than the
  // width, because a narrow window is not a phone.
  const phone = mode === 'none' && window.matchMedia('(pointer: coarse)').matches;
  el('bottom').hidden = !phone;
  document.body.classList.toggle('has-bottom', phone);
}

function navItems() {
  const here = location.hash || '#/';
  return NAV.map(n => {
    const on = here === n.to || (n.to !== '#/' && here.startsWith(n.to));
    return `<a class="nav-item${on ? ' on' : ''}" href="${n.to}">
      ${I[n.icon](on)}<span>${n.label}</span></a>`;
  }).join('');
}

function paintNav() {
  el('rail').innerHTML = navItems('rail');
  el('bottom').innerHTML = navItems('bottom');
  const onPlus = (location.hash || '') === '#/plus';
  el('drawer').innerHTML = `
    ${navItems('drawer')}
    <hr class="nav-sep">
    <div class="nav-head">Yours</div>
    <a class="nav-item${onPlus ? ' on' : ''}" href="#/plus">${I.sparkle()}<span>Codera Plus</span></a>
    <button class="nav-item" data-act="create">${I.plus()}<span>Create</span></button>
    <hr class="nav-sep">
    <div class="nav-foot">
      Codera on the web.<br>Posts, shorts and videos, shared with the app.
    </div>`;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let me = null;                 // the signed-in account
let posts = [];
let postsReady = false;
let plus = { loading: true, active: false, cancelled: false, test: false, endsAt: 0 };
let profile = {};              // the banner, picture, description and username
let profileReady = false;      // whether the profile has been read back at all
let naming = false;            // the unskippable "pick a username" screen
let payOpen = false;           // Stripe's form is mounted in the page

let unsubPosts = null;
let unsubPlus = null;
let unsubProfile = null;
let following = new Set();     // the accounts this one follows
let streams = [];              // streams marked live right now
let streamsKey = '';           // which ones, so a heartbeat alone redraws nothing
let taste = {};                // subject scores behind the recommended feed
let unsubFollows = null;
let unsubStreams = null;
let unsubTaste = null;
const teardown = [];           // listeners belonging to whatever is on screen

/**
 * The account button in the top corner.
 *
 * It was never being filled in, so it showed as a bare gradient circle no
 * matter whose account it was or what picture they had chosen.
 */
function paintMe() {
  const btn = el('meBtn');
  if (!btn || !me) return;
  const photo = profile.photoUrl || me.photoURL;
  const name = profile.username || me.displayName || me.email || '?';
  btn.innerHTML = photo
    ? `<img src="${esc(photo)}" alt="">`
    : esc(initials(name));
  btn.title = '@' + (profile.username || me.displayName || '');
}

/** Shows or hides the whole signed-in frame, the gate aside. */
function showApp(on) {
  el('top').hidden = !on;
  el('main').hidden = !on;
  if (!on) ['rail', 'drawer', 'bottom', 'scrim'].forEach(id => { el(id).hidden = true; });
  else layout();
}

/** PLUS after the name itself, on every page, whenever Plus is on. */
function paintPlusTag() {
  const tag = el('plusTag');
  if (!tag) return;
  tag.hidden = !plus.active;
  tag.title = plus.cancelled ? 'Plus ends ' + plusDate(plus.endsAt) : 'Codera Plus';
}

function dropView() {
  while (teardown.length) {
    try { teardown.pop()(); } catch (e) { /* already gone */ }
  }
}

// ---- Keeping people safe --------------------------------------------------------
//
// Codera has no private messages, and these keep its public places from being
// used to pull someone out of them: contact details can't be sent in chat or
// comments, and anyone can be blocked.

// What can't be said in live chat or a comment.
//
// Sharing where else you are is part of teaching — a creator's GitHub, their
// channel, their talks — so links to places anyone can look at are fine, in
// chat as well as in a profile or a description. What is refused is the step
// that takes a conversation somewhere private and unwatched: a phone number,
// an email address, or an invite or handle for a one-to-one messaging app.
const PUBLIC_PLACES = [
  'github.com', 'gitlab.com', 'bitbucket.org', 'stackoverflow.com', 'stackexchange.com',
  'youtube.com', 'youtu.be', 'x.com', 'twitter.com', 'linkedin.com', 'mastodon.social',
  'dev.to', 'medium.com', 'npmjs.com', 'pypi.org', 'codepen.io', 'replit.com',
  'instagram.com', 'tiktok.com', 'twitch.tv', 'reddit.com', 'bsky.app', 'threads.net',
  'patreon.com', 'ko-fi.com', 'buymeacoffee.com', 'substack.com',
  'codesandbox.io', 'figma.com', 'notion.site', 'docs.google.com', 'developer.mozilla.org',
  'learncodera.com', 'codera-46b86.web.app',
];

const PRIVATE_CHANNELS = [
  // An invite or a profile link to somewhere one-to-one.
  /\b(?:discord\.gg|discordapp\.com\/invite|discord\.com\/invite)\b/i,
  /\b(?:t\.me|telegram\.me|wa\.me|api\.whatsapp\.com|ig\.me|m\.me|snapchat\.com\/add|join\.skype\.com)\b/i,
  // "my snap is ...", "telegram: ...", "kik @..."
  /\b(?:discord|telegram|whatsapp|snap(?:chat)?|kik|signal|skype)\b\s*(?:is|:|@|=|->)\s*\S+/i,
  /\b(?:add|dm|pm|message)\s+me\s+on\b/i,
];

const EMAIL = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i;
// Seven or more digits together: a phone number however it's spaced out.
const PHONE = /(?:\d[\s().-]?){7,}/;

function hostsIn(text) {
  const found = [];
  const links = text.match(/(?:https?:\/\/|www\.)[^\s<>"']+/gi) || [];
  for (const link of links) {
    try {
      const host = new URL(link.startsWith('http') ? link : 'https://' + link).hostname.replace(/^www\./, '');
      found.push(host);
    } catch (e) { found.push(link); }
  }
  return found;
}

/** Why this message can't be sent, or '' when it's fine. */
/**
 * Whoever the room belongs to — the person whose post it is, the streamer whose
 * stream it is — may point people at their own things: their site, their
 * community. Phone numbers and email addresses are refused from everyone,
 * including them: those belong on a profile, not in a chat with a stranger.
 */
function contactProblem(text, theirs) {
  if (EMAIL.test(text)) return 'Email addresses can’t be shared in chat or comments.';
  if (PHONE.test(text.replace(/\b\d{1,4}px\b|\b0x[0-9a-f]+\b/gi, ''))) {
    return 'Phone numbers can’t be shared in chat or comments.';
  }
  if (!theirs && PRIVATE_CHANNELS.some(p => p.test(text))) {
    return 'Codera doesn’t allow invites to private messaging apps — that’s how people get led somewhere unsafe. Your GitHub, channel or website is fine.';
  }
  const strangers = theirs ? [] : hostsIn(text).filter(h => !PUBLIC_PLACES.some(ok => h === ok || h.endsWith('.' + ok)));
  if (strangers.length) {
    return 'Only links to public places like GitHub, YouTube or Stack Overflow can go in chat and comments. Put anything else in your profile or the description.';
  }
  return '';
}

// ---------------------------------------------------------------------------
// Where else someone can be found
// ---------------------------------------------------------------------------
// Teaching builds an audience that follows a person across places, so a profile
// carries up to five links, drawn as a row the way a channel shows its socials.
// This is the answer to "where do I put my Instagram": on your profile, in the
// open, where everyone who visits — including anyone reviewing a report — sees
// the same thing. That is what separates it from a handle passed to one child
// in a chat, which is still refused.
//
// A link to a room full of people, a server or a public channel, is allowed.
// A link that opens a private message with one person is not.

const MAX_LINKS = 5;

const DM_LINKS = [
  /^m\.me$/i, /^ig\.me$/i, /^wa\.me$/i, /^api\.whatsapp\.com$/i,
  /^chat\.whatsapp\.com$/i, /^join\.skype\.com$/i, /^snapchat\.com$/i,
];
const DM_PATHS = [
  /^\/\+/, /^\/joinchat/i, /^\/add\b/i, /^\/users\//i, /^\/m\//i,
];
// Links whose destination can't be seen until it's opened.
const SHORTENERS = ['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'is.gd', 'cutt.ly',
  'rb.gy', 'shorturl.at', 'rebrand.ly', 'ow.ly', 'lnkd.in', 'linktr.ee'];

// A place is known by its host; the glyph and the way the handle reads follow.
const SOCIALS = [
  { hosts: ['youtube.com', 'youtu.be'], name: 'YouTube', at: true,
    icon: () => svg('<rect x="2.6" y="5.4" width="18.8" height="13.2" rx="4.2"/><path d="M10.4 9.5 15.6 12l-5.2 2.5z" stroke-linejoin="round"/>') },
  { hosts: ['x.com', 'twitter.com'], name: 'X', at: true,
    icon: () => svg('<path d="M4.4 3.8 19.6 20.2M20 3.8 4 20.2" stroke-width="2.3"/>') },
  { hosts: ['instagram.com'], name: 'Instagram', at: true,
    icon: () => svg('<rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5.2"/><circle cx="12" cy="12" r="4.1"/><circle cx="17.2" cy="6.9" r="1.15" fill="currentColor" stroke="none"/>') },
  { hosts: ['tiktok.com'], name: 'TikTok', at: true,
    icon: () => svg('<path d="M13.8 3.6v10.9a3.9 3.9 0 1 1-3.9-3.9c.35 0 .7.05 1 .14"/><path d="M13.8 3.6c.4 2.7 2.4 4.6 5.1 4.8"/>') },
  { hosts: ['twitch.tv'], name: 'Twitch', at: true,
    icon: () => svg('<path d="M4.4 3.5h15.2v10.3l-4 4h-3.1L9.4 20.5H7.2v-2.7H4.4z" stroke-linejoin="round"/><path d="M11.3 7.5v4.3M15.5 7.5v4.3"/>') },
  { hosts: ['github.com'], name: 'GitHub', at: false,
    icon: () => GITHUB_CAT },
  { hosts: ['gitlab.com'], name: 'GitLab', at: false,
    icon: () => svg('<path d="M12 20.4 3.6 14.2l1.2-6.1 2.1 5h10.2l2.1-5 1.2 6.1z" stroke-linejoin="round"/>') },
  { hosts: ['linkedin.com'], name: 'LinkedIn', at: false,
    icon: () => svg('<rect x="3.2" y="3.2" width="17.6" height="17.6" rx="3.6"/><path d="M7.7 10.3v6.5M11.5 16.8v-6.5M11.5 12.8c0-1.3 1-2.3 2.3-2.3s2.3 1 2.3 2.3v4"/><circle cx="7.7" cy="7.5" r="1.05" fill="currentColor" stroke="none"/>') },
  { hosts: ['discord.gg', 'discord.com', 'discordapp.com'], name: 'Discord', at: false,
    icon: () => svg('<path d="M8.9 5.3A14 14 0 0 1 12 5c1.1 0 2.1.1 3.1.3l.9-1.3c1.7.5 3.2 1.3 4 2.2.9 2.9 1.2 6.3.6 9.8-1.5 1.2-3.1 2.1-4.8 2.6l-.9-1.6M8.9 5.3 8 4c-1.7.5-3.2 1.3-4 2.2-.9 2.9-1.2 6.3-.6 9.8 1.5 1.2 3.1 2.1 4.8 2.6l.9-1.6"/><circle cx="9.2" cy="12.2" r="1.3"/><circle cx="14.8" cy="12.2" r="1.3"/>') },
  { hosts: ['reddit.com'], name: 'Reddit', at: false,
    icon: () => svg('<circle cx="12" cy="13.2" r="7.2"/><path d="M9.6 16.2c1.5 1.1 3.3 1.1 4.8 0"/><path d="M15.4 5.6 14.3 9.9"/><circle cx="15.8" cy="5.2" r="1.25"/><circle cx="9.5" cy="12.6" r=".95" fill="currentColor" stroke="none"/><circle cx="14.5" cy="12.6" r=".95" fill="currentColor" stroke="none"/>') },
  { hosts: ['bsky.app'], name: 'Bluesky', at: true,
    icon: () => svg('<path d="M12 10.6C10.5 7.5 7 4.7 4.9 4.7c-1.5 0-1.9 1.4-1.9 3 0 2.8 1.6 5 4.5 5.4-2.2.5-2.7 1.8-1.5 3.3 1.4 1.7 4.1.9 6-3.4 1.9 4.3 4.6 5.1 6 3.4 1.2-1.5.7-2.8-1.5-3.3 2.9-.4 4.5-2.6 4.5-5.4 0-1.6-.4-3-1.9-3-2.1 0-5.6 2.8-7.1 5.9z" stroke-linejoin="round"/>') },
  { hosts: ['mastodon.social', 'fosstodon.org', 'hachyderm.io'], name: 'Mastodon', at: true,
    icon: () => svg('<path d="M4.2 14.3c-.6-3.3-.5-6.4.3-8 .9-1.7 5.2-2.4 7.5-2.4s6.6.7 7.5 2.4c.8 1.6.9 4.7.3 8"/><path d="M8.2 13.4V9.8c0-1.1 1.8-1.6 2.5-.5l1.3 2 1.3-2c.7-1.1 2.5-.6 2.5.5v3.6"/><path d="M6.4 16.6c2.4 1.5 8.1 1.7 10.6.2"/>') },
  { hosts: ['patreon.com'], name: 'Patreon', at: false,
    icon: () => svg('<circle cx="14.4" cy="9.8" r="5.6"/><path d="M4.4 3.9v16.2" stroke-width="2.6"/>') },
  { hosts: ['ko-fi.com', 'buymeacoffee.com'], name: 'Tip jar', at: false,
    icon: () => svg('<path d="M3.8 6.2h12.4v6.2a4.4 4.4 0 0 1-4.4 4.4H8.2a4.4 4.4 0 0 1-4.4-4.4z"/><path d="M16.2 7.8h1.5a2.5 2.5 0 0 1 0 5h-1.5"/><path d="M4.4 20.1h11.4"/>') },
  { hosts: ['substack.com'], name: 'Substack', at: false,
    icon: () => svg('<path d="M5.2 4.6h13.6M5.2 9.2h13.6M5.2 13.6v5.8l6.8-3.2 6.8 3.2v-5.8z" stroke-linejoin="round"/>') },
];

const GLOBE = () => svg('<circle cx="12" cy="12" r="8.6"/><path d="M3.5 12h17M12 3.4c4.5 5 4.5 12.2 0 17.2-4.5-5-4.5-12.2 0-17.2z"/>');

/** The link as it was typed, made into a URL, or null when it isn't one. */
function asUrl(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(text) ? text : 'https://' + text);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return null;
    return u;
  } catch (e) { return null; }
}

function placeFor(host) {
  return SOCIALS.find(s => s.hosts.some(h => host === h || host.endsWith('.' + h))) || null;
}

/** Why this can't go on a profile, or '' when it can. */
function linkProblem(raw) {
  const text = String(raw || '').trim();
  if (!text) return 'Put a link in, or remove the empty row.';
  if (text.length > 200) return 'That link is too long.';
  if (EMAIL.test(text)) return 'This is for links. An email address can’t go on a Codera profile.';
  if (PHONE.test(text.replace(/\b\d{1,4}px\b|\b0x[0-9a-f]+\b/gi, ''))) {
    return 'This is for links. A phone number can’t go on a Codera profile.';
  }
  const u = asUrl(text);
  if (!u) return '“' + text.slice(0, 40) + '” doesn’t look like a link.';
  const host = u.hostname.replace(/^www\./, '').toLowerCase();
  if (SHORTENERS.includes(host)) {
    return 'Shortened links hide where they go. Use the real address.';
  }
  const dmHost = DM_LINKS.some(p => p.test(host));
  const dmPath = DM_PATHS.some(p => p.test(u.pathname));
  if (dmHost || (dmPath && /^(t\.me|telegram\.me|discord\.com|discordapp\.com)$/i.test(host))) {
    return 'That link opens a private message with you. A channel, a server or a page is fine — a direct line to one person isn’t.';
  }
  return '';
}

/** @name from the address, so the row reads the way a channel's does. */
function handleFor(u, place) {
  const host = u.hostname.replace(/^www\./, '').toLowerCase();
  const first = u.pathname.split('/').filter(Boolean)[0] || '';
  if (!place) return host;
  if (!first) return place.name;
  const clean = first.replace(/^@/, '');
  // A path like /c/Name or /in/name is the route to a page rather than a
  // handle, so the name reads as it was written — bar a subreddit, which is
  // known to everyone as r/something.
  if (/^(c|channel|user|in|company|invite|r|watch|playlist)$/i.test(clean)) {
    const next = u.pathname.split('/').filter(Boolean)[1];
    if (!next) return place.name;
    return clean.toLowerCase() === 'r' ? 'r/' + next : next.replace(/^@/, '');
  }
  return place.at ? '@' + clean : clean;
}

function linkChip(raw) {
  const u = asUrl(raw);
  if (!u) return '';
  const host = u.hostname.replace(/^www\./, '').toLowerCase();
  const place = placeFor(host);
  const glyph = place ? place.icon() : GLOBE();
  const text = place ? handleFor(u, place) : host;
  const title = place ? place.name + ' — ' + u.href : u.href;
  // nofollow/ugc: these are links someone wrote about themselves, not Codera's
  // word for where they lead. noopener keeps the new tab away from this one.
  return '<a class="social" href="' + esc(u.href) + '" target="_blank" rel="noopener noreferrer nofollow ugc"'
    + ' title="' + esc(title) + '">' + glyph + '<span>' + esc(text) + '</span></a>';
}

// A description was always free text, and free text is where the links row's
// rule would leak away: gate the row at 18 and leave "my IG is @me" sitting in
// a bio, and the gate means nothing. So a bio points nowhere either, for anyone
// who hasn't proved their age — the same people, by the same rule.
//
// Nothing is edited. The words stay exactly as they were written; a reader who
// isn't a checked adult is simply not shown the part that leads away. Pass the
// check and the bio reads normally again.
//
// The cost is that this occasionally hides something that only looks like an
// address — a library called socket.io, say. Hiding a package name from a
// fifteen-year-old is a smaller harm than handing one a way off the site, and
// the author and any checked adult still see it in full.
const TLDS = 'com|net|org|io|dev|app|co|me|tv|gg|social|xyz|site|link|page|sh|ai|so'
  + '|to|gl|be|uk|us|ca|de|fr|in|club|live|online|store|blog|email|chat';
const LINKISH = new RegExp(
  '(?:https?:\\/\\/|www\\.)[^\\s]+'            // a written-out address
  + '|\\b(?:[a-z0-9-]+\\.)+(?:' + TLDS + ')\\b(?:\\/[^\\s]*)?', 'gi');
const EMAIL_ALL = new RegExp(EMAIL.source, 'gi');
const PHONE_ALL = new RegExp(PHONE.source, 'g');

// A character nobody can type into a bio, so it can stand in for a hidden run
// until the text has been escaped and it is safe to put a tag there.
const HOLE = '\u0000';

/** A bio as it should read for this person. */
function bioFor(text, show) {
  const raw = String(text || '');
  if (show) return esc(raw);
  const masked = raw
    .replace(EMAIL_ALL, HOLE)
    .replace(PHONE_ALL, HOLE)
    .replace(LINKISH, HOLE)
    .replace(new RegExp(HOLE + '[\\s,·|/-]*' + HOLE, 'g'), HOLE);   // runs of them read as one
  return esc(masked).split(HOLE).join('<span class="hid">link hidden</span>');
}

/** Whether a bio has anything in it that would be hidden. */
function bioPoints(text) {
  const raw = String(text || '');
  EMAIL_ALL.lastIndex = 0; PHONE_ALL.lastIndex = 0; LINKISH.lastIndex = 0;
  return EMAIL_ALL.test(raw) || PHONE_ALL.test(raw) || LINKISH.test(raw);
}

async function setLinks(list) {
  await setDoc(doc(db, 'profiles', auth.currentUser.uid), {
    links: list.length ? list.slice(0, MAX_LINKS) : null,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

// ---------------------------------------------------------------------------
// Who may open them
// ---------------------------------------------------------------------------
// A link leads off Codera, where these rules stop and nobody is checking who
// is at the other end. So the row is for adults on both sides: you prove your
// age to put links up, and you prove it to open someone else's.
//
// What proves it is a face check, not a date typed into a box. A browser can
// claim anything, so the claim is worth nothing: the only thing that opens
// this row is `by: 'face'`, which Yoti's answer writes through a Cloud
// Function and which the rules forbid any client to write. The date asked at
// sign-up still does its own job — the floor of 13 — and is kept as the day
// that person turns 18, nothing more.
//
// Until the check is wired up, FACE_CHECKS stays false: the row is dormant,
// locked for everybody, saying so plainly rather than offering a button that
// couldn't do anything.
const ADULT_AGE = 18;
const FACE_CHECKS = true;

let adultAt = null;
let adultBy = null;
let unsubAge = null;

// Which build this is. A client that doesn't say stops being answered once
// the floor in the rules is raised above 0 — which is the only way to retire a
// shipped app, since nothing in an old copy can be reached to fix it.
const BUILD = 1;

async function stamp(uid) {
  try {
    await setDoc(doc(db, 'clients', uid), {
      platform: 'web', build: BUILD, at: serverTimestamp(),
    }, { merge: true });
  } catch (e) { /* refused, most likely for being too old to be here */ }
}

function watchAge(uid) {
  return onSnapshot(doc(db, 'ages', uid), s => {
    const at = s.exists() ? s.get('adultAt') : null;
    adultAt = typeof at === 'number' ? at : null;
    adultBy = s.exists() ? (s.get('by') || null) : null;
    render();
  }, () => {});
}

/** Old enough, and checked — the one thing that opens the row. */
function isAdult() {
  return adultBy !== null && adultBy !== 'self' && adultAt !== null && Date.now() >= adultAt;
}

function adultAtFrom(dob) {
  const at = new Date(dob.getTime());
  at.setFullYear(at.getFullYear() + ADULT_AGE);
  return at.getTime();
}

/** The date from sign-up, kept as the day they turn 18. Never proof of it. */
async function saveAge(dob) {
  await setDoc(doc(db, 'ages', auth.currentUser.uid), {
    adultAt: adultAtFrom(dob), by: 'self', setAt: serverTimestamp(),
  }, { merge: true });
}

const LOCK = () => svg('<rect x="4.4" y="10.4" width="15.2" height="9.8" rx="2.6"/><path d="M8.2 10.4V7.8a3.8 3.8 0 0 1 7.6 0v2.6"/>');

/** Why this row is shut, in the words that fit whoever is reading it. */
function whyShut(n) {
  const these = n > 1 ? 'these' : 'it';
  const many = plural(n, 'link') + ' to where they are off Codera';
  if (!me) return many + '. Sign in and confirm your age to open ' + (n > 1 ? 'them' : 'it') + '.';
  if (!FACE_CHECKS) return many + '. Age checks open soon.';
  return many + ' — ' + these + ' open once you’ve confirmed you’re ' + ADULT_AGE + ' or over.';
}

/** The row on a profile. `mine` is true on your own page. */
function linkRow(links, mine) {
  const list = (Array.isArray(links) ? links : []).slice(0, MAX_LINKS);
  if (!list.length) return '';
  if (mine || isAdult()) {
    const chips = list.map(linkChip).filter(Boolean);
    return chips.length ? '<div class="socials">' + chips.join('') + '</div>' : '';
  }
  const ask = me && FACE_CHECKS
    ? '<button class="pill ghost2" id="ageBtn">Confirm your age</button>' : '';
  return '<div class="socials locked">' + LOCK()
    + '<span>' + whyShut(list.length) + '</span>' + ask + '</div>';
}

/**
 * The face check. Yoti estimates an age from a live camera frame — a held-up
 * photo of somebody else's face is what its liveness step is there to catch —
 * and the result comes back to a Cloud Function, never to this page.
 */
// Persona's own client, loaded from their CDN and pinned. It is a UMD bundle,
// so it puts `Persona` on the window and needs no build step here.
const PERSONA_JS = 'https://cdn.withpersona.com/dist/persona-v5.9.0.js';
let personaLoading = null;

function loadPersona() {
  if (window.Persona) return Promise.resolve(window.Persona);
  if (personaLoading) return personaLoading;
  personaLoading = new Promise((ok, no) => {
    const tag = document.createElement('script');
    tag.src = PERSONA_JS;
    tag.onload = () => (window.Persona ? ok(window.Persona) : no(new Error('no client')));
    tag.onerror = () => no(new Error('could not load'));
    document.head.appendChild(tag);
  });
  return personaLoading;
}

/**
 * The age check, inside Codera rather than away from it.
 *
 * Persona draws its own flow in an iframe, so the words inside it wear the
 * theme set on their side — there is no reaching into another origin to
 * restyle it, by us or anyone. What this does is put that frame in a Codera
 * panel: our ground, our type around it, our way of closing it, and no moment
 * where someone is thrown out to a stranger's website mid-check.
 *
 * Nothing here decides anything. The client reports what happened so the panel
 * can close politely, but the record is written by the webhook, from Persona's
 * own account of it, and the page only changes when that lands.
 */
function startAgeCheck() {
  if (!FACE_CHECKS) {
    toast('Age checks aren’t open yet. They’re coming shortly.');
    return;
  }
  sheet(`
    <h2>Confirm your age</h2>
    <p class="note">Links people add lead off Codera, so opening them — and adding
      your own — is for ${ADULT_AGE} and over. Persona, an independent age-check
      service, works it out from a short look at your face. <b>Codera never sees
      the picture</b>, Persona deletes it once it has an answer, and all we are
      told is whether you are over ${ADULT_AGE}.</p>
    <p class="note" id="faceErr" hidden style="color:var(--red)"></p>
    <button class="brand-btn" id="faceGo">Start</button>`);

  el('faceGo').onclick = async () => {
    const go = el('faceGo');
    const fail = why => {
      const err = el('faceErr');
      err.textContent = why;
      err.hidden = false;
      go.disabled = false;
      go.textContent = 'Start';
    };

    go.disabled = true;
    go.textContent = 'Opening…';

    let started;
    try {
      started = await httpsCallable(fns, 'ageStart')();
    } catch (e) {
      return fail(message(e));
    }

    let client;
    try {
      client = await loadPersona();
    } catch (e) {
      // Their script is blocked or unreachable. The hosted page still works,
      // so the check is never lost to an ad blocker.
      closeSheet();
      window.open(started.data.url, '_blank', 'noopener');
      toast('Finish the check in the new tab. This page updates by itself.');
      return;
    }

    closeSheet();
    const panel = document.createElement('div');
    panel.className = 'face';
    panel.innerHTML = `
      <div class="face-in">
        <div class="face-top">
          <b>Confirming your age</b>
          <button class="pill" id="faceClose">Close</button>
        </div>
        <div class="face-frame" id="faceFrame"></div>
      </div>`;
    document.body.appendChild(panel);

    const shut = () => { try { panel.remove(); } catch (e) { /* gone already */ } };
    el('faceClose').onclick = shut;
    panel.onclick = e => { if (e.target === panel) shut(); };

    new client.Client({
      inquiryId: started.data.inquiry,
      parent: el('faceFrame'),
      frameWidth: '100%',
      frameHeight: '100%',
      onComplete: () => {
        shut();
        // Not "you're verified": the record is the webhook's to write, and it
        // may be a second or two behind. The row opens by itself when it lands.
        toast('Thanks — that’s with Persona now. This page updates by itself.');
      },
      onCancel: shut,
      onError: () => { shut(); toast('That didn’t finish. You can try again.'); },
    }).open();
  };
}

/** The button under a locked row, wherever that row was drawn. */
function wireAgeAsk(root) {
  const btn = (root || document).querySelector('#ageBtn');
  if (btn) btn.onclick = startAgeCheck;
}

// ---- your own row, and editing it -----------------------------------------

function myLinksBlock() {
  const links = Array.isArray(profile.links) ? profile.links : [];
  const row = linkRow(links, true);
  if (isAdult()) {
    return row + '<button class="pill ghost2" id="linkBtn">'
      + (links.length ? 'Edit links' : 'Add your links') + '</button>';
  }
  return row + '<div class="socials locked">' + LOCK() + '<span>'
    + (FACE_CHECKS
        ? 'Your channel, your GitHub, your site — confirm you’re ' + ADULT_AGE + ' or over to put them here.'
        : 'Your channel, your GitHub, your site. Adding them needs an age check, which opens soon.')
    + '</span>'
    + (FACE_CHECKS ? '<button class="pill ghost2" id="ageBtn">Confirm your age</button>' : '')
    + '</div>';
}

function wireMyLinks() {
  const btn = el('linkBtn');
  if (!btn) return;
  btn.onclick = () => {
    const wrap = el('linkWrap');
    const links = Array.isArray(profile.links) ? profile.links.slice() : [];
    wrap.innerHTML = `
      <p class="link-why">Your channel, your GitHub, your site — up to ${MAX_LINKS}.
        They show on your profile to anyone ${ADULT_AGE} or over. A link that opens a
        private message with you isn't allowed.</p>
      <div id="linkRows"></div>
      <div class="bio-row">
        <span class="who" id="linkErr"></span>
        <button class="pill" id="linkAdd">Add another</button>
        <button class="pill" id="linkCancel">Cancel</button>
        <button class="brand-btn" id="linkSave" style="width:auto;padding:0 20px;height:36px;font-size:14px;margin:0">Save</button>
      </div>`;
    const rows = el('linkRows');
    const addRow = value => {
      const row = document.createElement('div');
      row.className = 'link-row';
      row.innerHTML = `<input class="field" type="url" maxlength="200"
        placeholder="https://youtube.com/@you" value="${esc(value || '')}">
        <button class="pill ghost2" data-drop aria-label="Remove">${I.close()}</button>`;
      row.querySelector('[data-drop]').onclick = () => {
        row.remove();
        if (!rows.children.length) addRow('');
      };
      rows.appendChild(row);
      return row;
    };
    (links.length ? links : ['']).forEach(addRow);

    el('linkAdd').onclick = () => {
      if (rows.children.length >= MAX_LINKS) return toast('That is all ' + MAX_LINKS + '.');
      addRow('').querySelector('input').focus();
    };
    el('linkCancel').onclick = () => render(true);
    el('linkSave').onclick = async () => {
      const err = el('linkErr');
      const kept = [];
      err.textContent = '';
      for (const input of rows.querySelectorAll('input')) {
        input.classList.remove('bad');
        const text = input.value.trim();
        if (!text) continue;
        const problem = linkProblem(text);
        if (problem) { input.classList.add('bad'); input.focus(); err.textContent = problem; return; }
        kept.push(asUrl(text).href);
      }
      el('linkSave').disabled = true;
      try { await setLinks(kept); toast('Links saved.'); render(true); }
      catch (e) { err.textContent = message(e); el('linkSave').disabled = false; }
    };
    rows.querySelector('input').focus();
  };
}

// People you've blocked: you don't see each other's posts, streams or chat.
let blocked = new Set();
let unsubBlocks = null;

function watchBlocks(uid) {
  return onSnapshot(query(collection(db, 'blocks'), where('from', '==', uid)),
    snap => { blocked = new Set(snap.docs.map(d => d.get('to'))); render(); },
    () => {});
}

async function toggleBlock(uid, name) {
  const id = me.uid + '_' + uid;
  try {
    if (blocked.has(uid)) {
      await deleteDoc(doc(db, 'blocks', id));
      toast('Unblocked.');
      return;
    }
    await setDoc(doc(db, 'blocks', id), { from: me.uid, to: uid, at: serverTimestamp() });
    toast(`Blocked ${name || 'them'} — you won't see each other on Codera.`);
  } catch (e) {
    toast(message(e));
  }
}

// ---- Community Standards (web/community.html) -----------------------------------
//
// Every post is screened when it's written (functions/moderation.js), which
// marks it `moderation.state`: 'allowed' or 'held'. Other people see a post
// only once it's allowed; you always see your own, with the reason if it's
// held. Posts from before screening began have no verdict and stay as they were.
const MODERATION_START = Date.parse('2100-01-01T00:00:00Z');   // set to the moment screening goes live

function stampMs(t) {
  return t && typeof t.toMillis === 'function' ? t.toMillis() : (t && t.seconds ? t.seconds * 1000 : NaN);
}

function passed(p) {
  if (p.moderation && p.moderation.state) return p.moderation.state === 'allowed';
  const at = stampMs(p.createdAt);
  return Number.isFinite(at) && at < MODERATION_START;
}

const visibleToMe = p => (me && p.uid === me.uid) || (passed(p) && !blocked.has(p.uid));

/** A line on your own post saying where its review stands, when it isn't simply fine. */
function reviewNote(p) {
  if (!me || p.uid !== me.uid || passed(p)) return '';
  const held = p.moderation && p.moderation.state === 'held';
  return `<div class="review-note${held ? ' held' : ''}">${held
    ? `Only you can see this — ${esc(p.moderation.explanation || 'it doesn’t fit Codera’s Community Standards.')} <a href="/community.html" target="_blank">Standards</a>`
    : 'Checking this against the Community Standards — it shows to others in a moment.'}</div>`;
}

// Reporting: one report per person per post; enough of them hold it for review.
const REPORT_REASONS = [
  ['off_topic', 'Not about coding or tech'],
  ['inappropriate', 'Inappropriate or unsafe'],
  ['spam', 'Spam or a scam'],
  ['harassment', 'Harassment or hate'],
  ['other', 'Something else'],
];

function openReport(p, kind = 'post') {
  const what = kind === 'user' ? 'this person' : kind === 'stream' ? 'this stream' : 'this post';
  sheet(`<h2>${I.flag()} Report ${what}</h2>
    <p class="note">What's wrong? Reports are anonymous. If someone is in danger, tell the police too. See the <a href="/community.html" target="_blank">Community Standards</a>.</p>
    <div class="report-list">${REPORT_REASONS.map(([k, label]) =>
      `<button class="pill" data-reason="${k}">${esc(label)}</button>`).join('')}</div>
    <div class="row2"><button class="pill" data-close>Cancel</button></div>`);
  document.querySelectorAll('[data-reason]').forEach(b => {
    b.onclick = async () => {
      b.disabled = true;
      try {
        await setDoc(doc(db, 'reports', p.id + '_' + me.uid), {
          postId: p.id, kind, uid: me.uid, reason: b.dataset.reason, at: serverTimestamp(),
        });
        closeSheet();
        toast('Thanks — we’ll take a look.');
      } catch (e) {
        closeSheet();
        // The rules allow one report per person per post: a second is refused.
        toast(e.code === 'permission-denied' ? 'You’ve already reported this.' : message(e));
      }
    };
  });
}

/** Block or report the person whose page you're on. */
function safetyButtons(uid, name) {
  if (!me || uid === me.uid) return '';
  return `<button class="pill" data-block="${esc(uid)}">${blocked.has(uid) ? 'Unblock' : 'Block'}</button>
    <button class="pill" data-report-user="${esc(uid)}">${I.flag()}<span>Report</span></button>`;
}

function wireSafetyButtons(main, name) {
  const b = main.querySelector('[data-block]');
  if (b) b.onclick = () => toggleBlock(b.dataset.block, name);
  const r = main.querySelector('[data-report-user]');
  if (r) r.onclick = () => openReport({ id: r.dataset.reportUser }, 'user');
}

function watchData() {
  unsubPosts = onSnapshot(
    query(collection(db, POSTS), orderBy('createdAt', 'desc'), limit(150)),
    snap => {
      posts = snap.docs.map(d => Object.assign({ id: d.id }, d.data())).filter(visibleToMe);
      postsReady = true;
      learnFaces(posts);
      render();
    },
    err => { postsReady = true; toast(message(err)); render(); },
  );

  unsubPlus = onSnapshot(doc(db, 'users', me.uid), snap => {
    const p = snap.get('plus') || null;
    const endsAt = p && p.endsAt && p.endsAt.toMillis ? p.endsAt.toMillis() : 0;
    plus = {
      loading: false,
      active: !!(p && p.active) && endsAt > Date.now(),
      cancelled: !!(p && p.active && p.cancelled) && endsAt > Date.now(),
      test: !!(p && p.test),
      endsAt,
    };
    paintPlusTag();
    if (route().name === 'plus' && !payOpen) render(true);
    if (route().name === 'you') render(true);
  }, () => { plus = { loading: false, active: false, cancelled: false, test: false, endsAt: 0 }; paintPlusTag(); });

  unsubProfile = onSnapshot(doc(db, 'profiles', me.uid), snap => {
    profile = snap.exists() ? snap.data() : {};
    profileReady = true;
    // Your own picture changes here first; the feed should follow at once.
    faces.set(me.uid, { username: profile.username, photoUrl: profile.photoUrl });
    paintMe();
    // Nobody gets past this without a name to be known by.
    if (checkUsername()) return;
    if (route().name === 'you') render(true);
  }, () => {
    // Left as it was. Wiping it here is what made a banner vanish on its own
    // whenever the listener hiccupped.
  });

  // Who this account follows: the Follow buttons and the Following page.
  unsubFollows = onSnapshot(query(collection(db, 'follows'), where('from', '==', me.uid)), snap => {
    following = new Set(snap.docs.map(d => d.get('to')));
    paintFollows();
    if (route().name === 'followed') render(true);
  }, () => {});

  // Who is live. Streams beat every few seconds; only a change in which streams
  // are on air redraws a page, so a heartbeat never yanks anyone back to the top.
  unsubStreams = onSnapshot(query(collection(db, 'streams'), where('live', '==', true), limit(50)), snap => {
    streams = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
    learnFaces(streams, false);
    const key = streams.filter(onAir).map(s => s.id).sort().join(',');
    const changed = key !== streamsKey;
    streamsKey = key;
    const r = route().name;
    if (changed && ['home', 'followed'].includes(r)) render(true);
  }, () => {});

  unsubTaste = onSnapshot(doc(db, 'taste', me.uid), snap => {
    taste = snap.exists() ? snap.data() : {};
    if (!tasteReady) {
      tasteReady = true;
      if (tastePending.length) {
        tastePending.forEach(([t, w]) => { taste = learn(taste, t, w); });
        tastePending = [];
        saveTaste();
      }
    }
  }, () => {});
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

function author() {
  const u = auth.currentUser;
  if (!u) throw new Error('Sign in to post.');
  return {
    uid: u.uid,
    authorName: u.displayName || (u.email ? u.email.split('@')[0] : 'Someone'),
    authorPhoto: u.photoURL || null,
  };
}

async function uploadTo(path, file, onProgress) {
  await new Promise((resolve, reject) => {
    const task = uploadBytesResumable(ref(storage, path), file, { contentType: file.type });
    task.on('state_changed',
      s => onProgress && s.totalBytes && onProgress(s.bytesTransferred / s.totalBytes),
      reject, resolve);
  });
  return getDownloadURL(ref(storage, path));
}

/** How many pictures one post can carry. The rules allow the same. */
const MAX_PICS = 10;

async function createPost({ title, body, code, lang, images, onProgress }) {
  const who = author();
  const chosen = (images || []).slice(0, MAX_PICS);
  const imageUrls = [], imagePaths = [];
  // The pictures go up first: a post is never written pointing at a file that
  // failed to upload. Progress counts across all of them, not each in turn.
  for (let i = 0; i < chosen.length; i++) {
    const pic = chosen[i];
    const ext = (pic.type && pic.type.split('/')[1]) || 'jpg';
    const path = 'images/' + who.uid + '/' + Date.now() + '-' + i + '.' + ext;
    imagePaths.push(path);
    imageUrls.push(await uploadTo(path, pic, done => {
      if (onProgress) onProgress((i + done) / chosen.length);
    }));
  }
  // The first is written on its own as well, so an app that predates the list
  // — an APK nobody has updated — shows a picture rather than nothing.
  const imageUrl = imageUrls[0] || null;
  const imagePath = imagePaths[0] || null;
  return addDoc(collection(db, POSTS), Object.assign({}, who, {
    type: 'post',
    title: title.trim(),
    body: (body || '').trim(),
    code: (code || '').replace(/\s+$/, ''),
    lang: lang || null,
    imageUrl, imagePath,
    imageUrls: imageUrls.length > 1 ? imageUrls : null,
    imagePaths: imagePaths.length > 1 ? imagePaths : null,
    likeCount: 0, dislikeCount: 0, commentCount: 0,
    createdAt: serverTimestamp(),
  }));
}

async function uploadVideo({ file, kind, title, description, duration, onProgress }) {
  const who = author();
  const ext = (file.type && file.type.split('/')[1]) || 'mp4';
  const path = 'videos/' + who.uid + '/' + Date.now() + '.' + ext;
  const videoUrl = await uploadTo(path, file, onProgress);
  return addDoc(collection(db, POSTS), Object.assign({}, who, {
    type: kind,
    title: title.trim(),
    description: (description || '').trim() || null,
    videoUrl, videoPath: path,
    duration: duration || null,
    likeCount: 0, dislikeCount: 0, commentCount: 0,
    createdAt: serverTimestamp(),
  }));
}

async function removePost(post) {
  if (post.videoPath) { try { await deleteObject(ref(storage, post.videoPath)); } catch (e) {} }
  for (const path of picPathsOf(post)) {
    try { await deleteObject(ref(storage, path)); } catch (e) {}
  }
  await deleteDoc(doc(db, POSTS, post.id));
}

/**
 * Sets the banner across your page, or the picture on it.
 *
 * The file goes to your own Storage folder and its address is kept in
 * profiles/{uid} — the only document the rules let you write about yourself.
 * A picture is also written back to the account itself, so it becomes the face
 * on everything you post from either the site or the app.
 */
async function setProfileImage(kind, file) {
  const uid = auth.currentUser.uid;
  const ext = (file.type && file.type.split('/')[1]) || 'jpg';
  const path = 'profile/' + uid + '/' + kind + '-' + Date.now() + '.' + ext;
  const url = await uploadTo(path, file);

  const was = profile[kind + 'Path'];
  await setDoc(doc(db, 'profiles', uid), {
    [kind + 'Url']: url,
    [kind + 'Path']: path,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  if (kind === 'photo') await updateProfile(auth.currentUser, { photoURL: url });
  // Only once the new one is safely recorded.
  if (was) { try { await deleteObject(ref(storage, was)); } catch (e) {} }
}

const NAME_MAX = 20;
const NAME_OK = /^[a-z0-9_]{3,20}$/;

/** What a name looks like once it is a document id: lower case, no spaces. */
const nameKey = raw => String(raw || '').trim().toLowerCase().replace(/\s+/g, '_');

/** Is this name free? Only meaningful while signed in — reads need an account. */
async function nameFree(raw) {
  const snap = await getDoc(doc(db, 'usernames', nameKey(raw)));
  return !snap.exists();
}

/**
 * Takes a username for the signed-in account.
 *
 * The name is written as a document whose id is the name itself, and the rules
 * allow create only — so the second person to try the same name is writing over
 * a document that already exists, which is refused. That is what makes a name
 * one person's, without any server of our own deciding it.
 */
async function claimUsername(raw) {
  const key = nameKey(raw);
  if (!NAME_OK.test(key)) throw new Error('shape');
  const uid = auth.currentUser.uid;

  await setDoc(doc(db, 'usernames', key), { uid, at: serverTimestamp() });
  await setDoc(doc(db, 'profiles', uid), {
    username: key, updatedAt: serverTimestamp(),
  }, { merge: true });
  // So that everything posted from here on is signed with the name.
  await updateProfile(auth.currentUser, { displayName: key });
}

/** Which strip of a tall picture the banner shows, 0 (top) to 100 (bottom). */
async function setBannerY(y) {
  await setDoc(doc(db, 'profiles', auth.currentUser.uid), {
    bannerY: Math.round(Math.min(100, Math.max(0, y))),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/**
 * Everyone has a username. Accounts made before there were any get asked for
 * one the next time they open Codera, and there is no way past the question.
 */
function checkUsername() {
  if (!me || !profileReady) return false;
  const need = !profile.username;

  if (need && !naming) {
    naming = true;
    showApp(false);
    el('gate').hidden = false;
    paintName();
  } else if (!need && naming) {
    naming = false;
    el('gate').hidden = true;
    showApp(true);
    render(true);
  }
  return need;
}

/** The line someone writes about themselves. Empty clears it. */
async function setBio(text) {
  await setDoc(doc(db, 'profiles', auth.currentUser.uid), {
    bio: text.trim().slice(0, 300) || null,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

async function clearBanner() {
  const uid = auth.currentUser.uid;
  const was = profile.bannerPath;
  await setDoc(doc(db, 'profiles', uid), {
    bannerUrl: null, bannerPath: null, updatedAt: serverTimestamp(),
  }, { merge: true });
  if (was) { try { await deleteObject(ref(storage, was)); } catch (e) {} }
}

/** Opens the file picker and hands back one image. */
function pickImage() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => resolve(input.files[0] || null);
    // Pressing Cancel fires this instead of change; without it the promise —
    // and whatever was waiting on it — hung about for ever.
    input.oncancel = () => resolve(null);
    input.click();
  });
}

const voteRef = (postId, uid) => doc(db, POSTS, postId, 'votes', uid);

/**
 * Casts, changes or takes back a vote — the same transaction the app runs, so
 * the totals can never drift from the votes behind them. Posts and live streams
 * are voted on alike; `coll` says which. Resolves to the vote now standing.
 */
/**
 * What the thumbs are showing right now, before the database has agreed.
 *
 * A vote is a transaction — a read and a write — and on a slow connection that
 * is the better part of a second during which nothing on screen moves. People
 * press again, which either does nothing or undoes what they just did, and the
 * whole thing reads as broken. So the thumbs answer immediately and the
 * database catches up; if it refuses, the thumbs go back to what it says.
 */
const pretending = new Map();

/** Draws a pair of thumbs at a given state, wherever they are on the page. */
function paintThumbs(id, mine, likes, dislikes) {
  const up = document.querySelector('[data-vote="1"]') || el('upBtn');
  const down = document.querySelector('[data-vote="-1"]') || el('downBtn');
  if (!up || !down) return;
  up.classList.toggle('on', mine === 1);
  down.classList.toggle('on', mine === -1);
  down.classList.toggle('down', mine === -1);
  const upSvg = up.querySelector('svg');
  const downSvg = down.querySelector('svg');
  if (upSvg) upSvg.outerHTML = I.up(mine === 1);
  if (downSvg) downSvg.outerHTML = I.down(mine === -1);
  if (el('upN') && likes !== undefined) el('upN').textContent = compact(Math.max(0, likes));
  if (el('downN') && dislikes !== undefined) el('downN').textContent = compact(Math.max(0, dislikes));
}

async function voteOn(coll, id, want) {
  const u = auth.currentUser;
  if (!u) return 0;
  const mineRef = doc(db, coll, id, 'votes', u.uid);
  return runTransaction(db, async tx => {
    const mine = await tx.get(mineRef);
    const had = mine.exists() ? mine.get('v') || 0 : 0;
    const now = had === want ? 0 : want;
    if (now === had) return now;

    const d = { likeCount: 0, dislikeCount: 0 };
    if (had === 1) d.likeCount -= 1;
    if (had === -1) d.dislikeCount -= 1;
    if (now === 1) d.likeCount += 1;
    if (now === -1) d.dislikeCount += 1;

    if (now === 0) tx.delete(mineRef);
    else tx.set(mineRef, { v: now, uid: u.uid, at: serverTimestamp() });

    tx.update(doc(db, coll, id), {
      likeCount: increment(d.likeCount),
      dislikeCount: increment(d.dislikeCount),
    });
    return now;
  });
}

async function vote(postId, want) {
  // Shown before it is sent, and remembered so the watcher does not undo it
  // with the older value it is still holding.
  const post = byId(postId) || {};
  const was = pretending.has(postId) ? pretending.get(postId) : (myVoteNow || 0);
  const next = was === want ? 0 : want;
  const likes = (post.likeCount || 0) + (next === 1 ? 1 : 0) - (was === 1 ? 1 : 0);
  const dislikes = (post.dislikeCount || 0) + (next === -1 ? 1 : 0) - (was === -1 ? 1 : 0);
  pretending.set(postId, next);
  paintThumbs(postId, next, likes, dislikes);

  let now;
  try {
    now = await voteOn(POSTS, postId, want);
  } catch (e) {
    // Refused — put the thumbs back where the database has them.
    pretending.delete(postId);
    paintThumbs(postId, was, post.likeCount || 0, post.dislikeCount || 0);
    throw e;
  }
  pretending.delete(postId);
  // A like says more about what someone wants than a view does; a dislike, less.
  if (now) nudge(topicsOf(byId(postId)), now === 1 ? WEIGHT.like : WEIGHT.dislike);
}

function watchVoteOn(coll, id, onChange) {
  const u = auth.currentUser;
  if (!u) { onChange(0); return () => {}; }
  return onSnapshot(doc(db, coll, id, 'votes', u.uid),
    snap => onChange(snap.exists() ? snap.get('v') || 0 : 0),
    () => onChange(0));
}

const watchMyVote = (postId, onChange) => watchVoteOn(POSTS, postId, onChange);

/** The vote the database last reported for the post being looked at. */
let myVoteNow = 0;

async function addComment(postId, text) {
  const who = author();
  const body = text.trim();
  if (!body) return;
  await addDoc(collection(db, POSTS, postId, 'comments'), Object.assign({}, who, {
    text: body.slice(0, 1000),
    createdAt: serverTimestamp(),
  }));
  await updateDoc(doc(db, POSTS, postId), { commentCount: increment(1) });
  nudge(topicsOf(byId(postId)), WEIGHT.comment, 'comment:' + postId);
}

async function deleteComment(postId, id) {
  await deleteDoc(doc(db, POSTS, postId, 'comments', id));
  await updateDoc(doc(db, POSTS, postId), { commentCount: increment(-1) });
}

// ---------------------------------------------------------------------------
// Pieces of page
// ---------------------------------------------------------------------------

/**
 * The name and picture each person is wearing now.
 *
 * A post keeps the name and picture of whoever wrote it, copied in at the time
 * — which is what lets a feed be read without looking up an account per card.
 * The cost is that changing your picture leaves every old post showing the old
 * one. So the profiles behind the feed are read once and kept here, and a card
 * shows this if it has it, falling back to what the post itself carries.
 */
const faces = new Map();

/** A post, with its author's current name and picture if we know them. */
function face(p) {
  const f = p && p.uid && faces.get(p.uid);
  if (!f) return p;
  return {
    uid: p.uid,
    authorName: f.username || p.authorName,
    authorPhoto: f.photoUrl || p.authorPhoto,
  };
}

/** Reads the profiles of everyone in a list, once each. */
function learnFaces(list, redraw) {
  const missing = [...new Set((list || []).map(x => x.uid).filter(Boolean))]
    .filter(uid => !faces.has(uid));
  if (!missing.length) return;

  // Claimed before the read so the same profile is never asked for twice.
  missing.forEach(uid => faces.set(uid, {}));

  Promise.all(missing.map(async uid => {
    try {
      const snap = await getDoc(doc(db, 'profiles', uid));
      if (snap.exists()) {
        faces.set(uid, { username: snap.get('username'), photoUrl: snap.get('photoUrl') });
      }
    } catch (e) { /* unreadable: the post's own copy stands */ }
  })).then(() => {
    // Not while something is playing: a redraw would restart it.
    if (redraw !== false && !KEEPS.has(route().name)) render(true);
  });
}

const byId = id => posts.find(p => p.id === id) || known.get(id);
const isVideo = p => p.type === 'video' || p.type === 'short' || p.type === 'live';

function initials(name) {
  const n = (name || '?').trim();
  return n ? n[0].toUpperCase() : '?';
}

function avatar(p, size = 34) {
  const s = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px`;
  return p.authorPhoto
    ? `<span class="avatar" style="${s}"><img src="${esc(p.authorPhoto)}" alt=""></span>`
    : `<span class="avatar" style="${s}">${esc(initials(p.authorName))}</span>`;
}

/**
 * The pictures on a post.
 *
 * Posts written before a post could carry several have the one, in imageUrl.
 */
function picsOf(p) {
  if (Array.isArray(p.imageUrls) && p.imageUrls.length) return p.imageUrls;
  return p.imageUrl ? [p.imageUrl] : [];
}

function picPathsOf(p) {
  if (Array.isArray(p.imagePaths) && p.imagePaths.length) return p.imagePaths;
  return p.imagePath ? [p.imagePath] : [];
}

/**
 * Every picture on a post, laid out at once.
 *
 * One fills the width. Two sit side by side, three and four make a block, and
 * beyond that the last tile shown says how many more there are and opens them.
 * Nothing is hidden behind a swipe: what a post came with is on the page.
 */
function picGrid(p, show) {
  const pics = picsOf(p);
  if (!pics.length) return '';
  const room = Math.min(pics.length, show || pics.length);
  const over = pics.length - room;
  const shape = pics.length === 1 ? 'one' : pics.length === 2 ? 'two'
    : pics.length === 3 ? 'three' : 'many';

  const tiles = pics.slice(0, room).map((url, i) => {
    const more = over > 0 && i === room - 1
      ? '<span class="pic-more">+' + over + '</span>' : '';
    return '<button class="pic-tile" data-pic="' + i + '" aria-label="Picture ' + (i + 1) + '">'
      + '<img src="' + esc(url) + '" alt="" loading="lazy">' + more + '</button>';
  }).join('');

  return '<div class="pics ' + shape + '" data-pics="' + esc(JSON.stringify(pics)) + '">'
    + tiles + '</div>';
}

/**
 * One picture, filling the window.
 *
 * Arrow keys and the buttons move between them; Escape, the cross, or the
 * darkness around the picture closes it.
 */
function openPics(pics, at) {
  if (!pics.length) return;
  let i = Math.max(0, Math.min(at || 0, pics.length - 1));

  const box = document.createElement('div');
  box.className = 'lightbox';
  box.innerHTML = '<button class="lb-shut" aria-label="Close">' + I.close() + '</button>'
    + '<button class="lb-step back" aria-label="Previous">' + I.back() + '</button>'
    + '<img alt="">'
    + '<button class="lb-step on" aria-label="Next">' + '<span class="flip">' + I.back() + '</span>' + '</button>'
    + '<div class="lb-count"></div>';

  const picture = box.querySelector('img');
  const count = box.querySelector('.lb-count');
  const steps = box.querySelectorAll('.lb-step');

  const draw = () => {
    picture.src = pics[i];
    count.textContent = (i + 1) + ' / ' + pics.length;
    steps.forEach(b => { b.hidden = pics.length < 2; });
  };

  const move = by => { i = (i + by + pics.length) % pics.length; draw(); };
  const shut = () => {
    box.remove();
    document.removeEventListener('keydown', keys);
    document.body.classList.remove('lb-open');
  };
  const keys = e => {
    if (e.key === 'Escape') shut();
    else if (e.key === 'ArrowLeft') move(-1);
    else if (e.key === 'ArrowRight') move(1);
  };

  box.querySelector('.lb-shut').onclick = shut;
  box.querySelector('.back').onclick = () => move(-1);
  box.querySelector('.on').onclick = () => move(1);
  // The darkness closes it; the picture itself does not.
  box.onclick = e => { if (e.target === box) shut(); };

  draw();
  document.body.appendChild(box);
  document.body.classList.add('lb-open');
  document.addEventListener('keydown', keys);
}

/**
 * A thumbnail for a video or short.
 *
 * The video element is its own poster: asking for a moment just past the start
 * makes the browser decode one frame, which saves storing a second file for
 * every upload. Hovering plays it muted, the way a preview does.
 */
function thumb(p, tall) {
  const time = p.videoUrl ? esc(p.videoUrl) + '#t=0.1' : '';
  const badge = (p.type === 'short'
    ? '<span class="badge left">SHORT</span>'
    : (p.duration ? `<span class="badge">${clock(p.duration)}</span>` : ''))
    + (p.type === 'live' ? '<span class="badge left live">STREAM</span>' : '');
  return `<div class="thumb${tall ? ' tall' : ''}">
    <video src="${time}" preload="metadata" muted playsinline disablepictureinpicture></video>
    ${badge}
  </div>`;
}

function cardVideo(p, opts) {
  const mine = me && p.uid === me.uid;
  const who = face(p);
  return `<article class="card" data-open="${p.id}">
    ${thumb(p, p.type === 'short')}
    <div class="card-body">
      ${avatar(who)}
      <div style="min-width:0">
        <h3>${esc(p.title)}</h3>
        <div class="who">${userLink(p)}</div>
        <div class="who">${plural(p.likeCount, 'like')} · ${ago(p.createdAt)}</div>
        ${reviewNote(p)}
      </div>
      ${mine && opts && opts.own ? `<button class="dots" data-menu="${p.id}">${I.dots()}</button>` : ''}
    </div>
  </article>`;
}

function cardPost(p, opts) {
  const mine = me && p.uid === me.uid;
  const who = face(p);
  return `<article class="pcard" data-open="${p.id}">
    <div class="card-body" style="padding:0">
      ${avatar(who, 30)}
      <div style="min-width:0;flex:1">
        <div class="who">${userLink(p)} · ${ago(p.createdAt)}</div>
        <h3>${esc(p.title)}</h3>
      </div>
      ${mine && opts && opts.own ? `<button class="dots" data-menu="${p.id}">${I.dots()}</button>` : ''}
    </div>
    ${reviewNote(p)}
    ${picGrid(p, 4)}
    ${p.body ? `<div class="body">${esc(p.body)}</div>` : ''}
    ${p.code ? `<pre class="code">${esc(p.code.split('\n').slice(0, 6).join('\n'))}</pre>` : ''}
    <div class="who">${plural(p.likeCount, 'like')} · ${plural(p.commentCount, 'comment')}</div>
  </article>`;
}

const card = (p, opts) => (isVideo(p) ? cardVideo(p, opts) : cardPost(p, opts));

// ---------------------------------------------------------------------------
// The player
//
// Codera's own, not the browser's: the mark's green→blue on the played part of
// the bar, controls that get out of the way while something is playing, and the
// gestures people already expect of a video — tap to pause, double-tap the sides
// to skip, drag the bar to scrub, and every keyboard shortcut a video site has.
// ---------------------------------------------------------------------------

const PLAYER_ICONS = {
  play: '<path d="M7.5 4.9v14.2a.7.7 0 0 0 1.07.6l11.2-7.1a.7.7 0 0 0 0-1.2L8.57 4.3A.7.7 0 0 0 7.5 4.9z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6.6" y="5" width="3.9" height="14" rx="1.3" fill="currentColor" stroke="none"/>'
    + '<rect x="13.5" y="5" width="3.9" height="14" rx="1.3" fill="currentColor" stroke="none"/>',
  loud: '<path d="M4 9.2h3.1L11.6 5a.8.8 0 0 1 1.4.6v12.8a.8.8 0 0 1-1.4.6L7.1 14.8H4a1 1 0 0 1-1-1v-3.6a1 1 0 0 1 1-1z" fill="currentColor" stroke="none"/>'
    + '<path d="M16 9.4a3.7 3.7 0 0 1 0 5.2M18.6 6.8a7.4 7.4 0 0 1 0 10.4" stroke-width="1.9"/>',
  quiet: '<path d="M4 9.2h3.1L11.6 5a.8.8 0 0 1 1.4.6v12.8a.8.8 0 0 1-1.4.6L7.1 14.8H4a1 1 0 0 1-1-1v-3.6a1 1 0 0 1 1-1z" fill="currentColor" stroke="none"/>'
    + '<path d="M16.2 9.8l4.6 4.4M20.8 9.8l-4.6 4.4" stroke-width="1.9"/>',
  full: '<path d="M9.2 3.6H4.8a1.2 1.2 0 0 0-1.2 1.2v4.4M14.8 3.6h4.4a1.2 1.2 0 0 1 1.2 1.2v4.4'
    + 'M9.2 20.4H4.8a1.2 1.2 0 0 1-1.2-1.2v-4.4M14.8 20.4h4.4a1.2 1.2 0 0 0 1.2-1.2v-4.4" stroke-width="1.9"/>',
  exit: '<path d="M3.6 9.2H8a1.2 1.2 0 0 0 1.2-1.2V3.6M20.4 9.2H16a1.2 1.2 0 0 1-1.2-1.2V3.6'
    + 'M3.6 14.8H8a1.2 1.2 0 0 1 1.2 1.2v4.4M20.4 14.8H16a1.2 1.2 0 0 0-1.2 1.2v4.4" stroke-width="1.9"/>',
  pip: '<rect x="3" y="4.8" width="18" height="14.4" rx="2.8" stroke-width="1.9"/>'
    + '<rect x="11.6" y="11.4" width="7.4" height="6" rx="1.6" fill="currentColor" stroke="none"/>',
  gear: '<circle cx="12" cy="12" r="2.9" stroke-width="1.9"/>'
    + '<path d="M12 3.4l1.1 2.2 2.4-.5.6 2.4 2.3.9-1.2 2.2 1.2 2.2-2.3.9-.6 2.4-2.4-.5L12 20.6'
    + 'l-1.1-2.2-2.4.5-.6-2.4-2.3-.9 1.2-2.2-1.2-2.2 2.3-.9.6-2.4 2.4.5z" stroke-width="1.7"/>',
  back10: '<path d="M11.5 4.2 7.8 7l3.7 2.8V4.2z" fill="currentColor" stroke="none"/>'
    + '<path d="M9 7h2.6a7 7 0 1 1-7 7" stroke-width="2"/>',
  fwd10: '<path d="M12.5 4.2 16.2 7l-3.7 2.8V4.2z" fill="currentColor" stroke="none"/>'
    + '<path d="M15 7h-2.6a7 7 0 1 0 7 7" stroke-width="2"/>',
};
const pI = name => `<svg viewBox="0 0 24 24" class="i">${PLAYER_ICONS[name]}</svg>`;

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];
const rateLabel = r => (r === 1 ? 'Normal' : r + '×');

/** The markup for one player. `wirePlayer` brings it to life. */
function playerHTML(src, opts) {
  const o = opts || {};
  return `<div class="vp${o.short ? ' short' : ''}" data-vp>
    <video src="${esc(src)}" playsinline preload="auto"
           ${o.loop ? 'loop' : ''} ${o.muted ? 'muted' : ''}></video>

    <div class="flash" data-vp-flash></div>

    <div class="skin">
      <button class="big" data-vp-toggle aria-label="Play">${pI('play')}</button>

      <div class="ctl">
        <div class="seek" data-vp-seek>
          <div class="track"><div class="buf"></div><div class="fill"></div><div class="knob"></div></div>
          <div class="tip" data-vp-tip hidden>0:00</div>
        </div>

        <div class="times">
          <button class="cbtn" data-vp-toggle aria-label="Play">${pI('play')}</button>
          <button class="cbtn wide-only" data-vp-back aria-label="Back 10 seconds">${pI('back10')}</button>
          <button class="cbtn wide-only" data-vp-fwd aria-label="Forward 10 seconds">${pI('fwd10')}</button>
          <span class="vol">
            <button class="cbtn" data-vp-mute aria-label="Mute">${pI('loud')}</button>
            <input type="range" min="0" max="1" step="0.02" value="1" data-vp-vol aria-label="Volume">
          </span>
          <span class="clock" data-vp-time>0:00<i>/</i>0:00</span>
          <span class="grow"></span>
          <span class="gearwrap">
            <button class="cbtn" data-vp-gear aria-label="Playback speed">${pI('gear')}</button>
            <div class="speeds" data-vp-speeds hidden>
              <div class="speeds-head">Speed</div>
              ${RATES.map(r => `<button data-rate="${r}">${rateLabel(r)}</button>`).join('')}
            </div>
          </span>
          <button class="cbtn" data-vp-pip aria-label="Picture in picture">${pI('pip')}</button>
          <button class="cbtn" data-vp-full aria-label="Fullscreen">${pI('full')}</button>
        </div>
      </div>
    </div>
  </div>`;
}

/**
 * Wires one player, and hands back the function that unhooks it again — which
 * the page keeps, so leaving takes every listener with it.
 */
function wirePlayer(root) {
  const v = root.querySelector('video');
  const seek = root.querySelector('[data-vp-seek]');
  const fill = root.querySelector('.fill');
  const buf = root.querySelector('.buf');
  const knob = root.querySelector('.knob');
  const tip = root.querySelector('[data-vp-tip]');
  const time = root.querySelector('[data-vp-time]');
  const volBtn = root.querySelector('[data-vp-mute]');
  const vol = root.querySelector('[data-vp-vol]');
  const gear = root.querySelector('[data-vp-gear]');
  const speeds = root.querySelector('[data-vp-speeds]');
  const full = root.querySelector('[data-vp-full]');
  const pip = root.querySelector('[data-vp-pip]');
  const flash = root.querySelector('[data-vp-flash]');
  const toggles = root.querySelectorAll('[data-vp-toggle]');

  const off = [];
  const on = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); off.push(() => t.removeEventListener(ev, fn, opt)); };

  // A recording made in a browser (every saved stream) often arrives without its
  // length written in, which leaves the bar unable to seek. Asking for a moment
  // far past the end makes the browser read to the end and work it out.
  on(v, 'loadedmetadata', () => {
    if (v.duration !== Infinity) return;
    const back = () => {
      if (v.duration === Infinity) return;
      v.removeEventListener('durationchange', back);
      v.currentTime = 0;
    };
    v.addEventListener('durationchange', back);
    v.currentTime = 1e101;
  });

  const setIcons = () => {
    const icon = v.paused ? 'play' : 'pause';
    toggles.forEach(b => { b.innerHTML = pI(icon); b.setAttribute('aria-label', v.paused ? 'Play' : 'Pause'); });
    root.classList.toggle('playing', !v.paused);
    volBtn.innerHTML = pI(v.muted || !v.volume ? 'quiet' : 'loud');
  };

  const paint = () => {
    const d = v.duration || 0;
    const pct = d ? (v.currentTime / d) * 100 : 0;
    fill.style.width = pct + '%';
    knob.style.left = pct + '%';
    time.innerHTML = clock(v.currentTime) + '<i>/</i>' + (d ? clock(d) : '0:00');
    if (v.buffered.length) buf.style.width = (d ? (v.buffered.end(v.buffered.length - 1) / d) * 100 : 0) + '%';
  };

  // A word in the middle of the picture when something changes that has no
  // control of its own to look at — a skip, the volume, the speed.
  let flashOff = null;
  const say = text => {
    flash.textContent = text;
    flash.classList.add('on');
    clearTimeout(flashOff);
    flashOff = setTimeout(() => flash.classList.remove('on'), 620);
  };

  const toggle = () => { if (v.paused) v.play().catch(() => {}); else v.pause(); };
  const skip = by => {
    const d = v.duration || 0;
    v.currentTime = Math.min(d, Math.max(0, v.currentTime + by));
    say((by > 0 ? '+' : '−') + Math.abs(by) + 's');
  };

  toggles.forEach(b => on(b, 'click', toggle));
  on(root.querySelector('[data-vp-back]'), 'click', () => skip(-10));
  on(root.querySelector('[data-vp-fwd]'), 'click', () => skip(10));

  // One tap plays or pauses; two taps near an edge skip, two in the middle go
  // full screen. The single tap waits a moment to see whether a second follows.
  let tapTimer = null;
  on(v, 'click', () => {
    if (tapTimer) return;
    tapTimer = setTimeout(() => { tapTimer = null; toggle(); }, 220);
  });
  on(v, 'dblclick', e => {
    clearTimeout(tapTimer);
    tapTimer = null;
    const r = v.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    if (x < 0.32) skip(-10);
    else if (x > 0.68) skip(10);
    else full.click();
  });

  on(v, 'play', setIcons);
  on(v, 'pause', setIcons);
  on(v, 'volumechange', () => { setIcons(); vol.value = v.muted ? 0 : v.volume; });
  on(v, 'timeupdate', paint);
  on(v, 'progress', paint);
  on(v, 'loadedmetadata', paint);
  on(v, 'waiting', () => root.classList.add('waiting'));
  on(v, 'playing', () => root.classList.remove('waiting'));
  on(v, 'canplay', () => root.classList.remove('waiting'));

  // Scrubbing: press anywhere on the bar, and keep dragging past its ends.
  const at = e => {
    const r = seek.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  };
  const move = e => { if (v.duration) v.currentTime = at(e) * v.duration; };
  on(seek, 'pointerdown', e => {
    seek.classList.add('dragging');
    seek.setPointerCapture(e.pointerId);
    move(e);
  });
  on(seek, 'pointermove', e => {
    if (seek.classList.contains('dragging')) move(e);
    // The time under the pointer, so you can find a moment before letting go.
    if (v.duration) {
      const f = at(e);
      tip.hidden = false;
      tip.textContent = clock(f * v.duration);
      tip.style.left = (f * 100) + '%';
    }
  });
  on(seek, 'pointerleave', () => { tip.hidden = true; });
  on(seek, 'pointerup', e => {
    seek.classList.remove('dragging');
    try { seek.releasePointerCapture(e.pointerId); } catch (err) {}
  });

  on(volBtn, 'click', () => { v.muted = !v.muted; say(v.muted ? 'Muted' : 'Sound on'); });
  on(vol, 'input', () => { v.volume = Number(vol.value); v.muted = Number(vol.value) === 0; });

  // Speed, as a short list rather than a button that cycles and hopes you were
  // watching it.
  const paintRates = () => {
    speeds.querySelectorAll('[data-rate]').forEach(b => {
      b.classList.toggle('on', Number(b.dataset.rate) === v.playbackRate);
    });
    gear.classList.toggle('lit', v.playbackRate !== 1);
  };
  on(gear, 'click', e => { e.stopPropagation(); speeds.hidden = !speeds.hidden; paintRates(); });
  on(speeds, 'click', e => {
    const b = e.target.closest('[data-rate]');
    if (!b) return;
    v.playbackRate = Number(b.dataset.rate);
    speeds.hidden = true;
    paintRates();
    say(rateLabel(v.playbackRate) + ' speed');
  });
  on(root, 'pointerdown', e => { if (!e.target.closest('.gearwrap')) speeds.hidden = true; });

  on(full, 'click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (root.requestFullscreen) root.requestFullscreen().catch(() => {});
  });
  on(document, 'fullscreenchange', () => {
    const isFs = document.fullscreenElement === root;
    root.classList.toggle('fs', isFs);
    full.innerHTML = pI(isFs ? 'exit' : 'full');
  });

  if (!document.pictureInPictureEnabled) pip.hidden = true;
  on(pip, 'click', () => {
    if (document.pictureInPictureElement) document.exitPictureInPicture();
    else if (v.requestPictureInPicture) v.requestPictureInPicture().catch(() => {});
  });

  // Controls fade while it plays and nothing is being pointed at.
  let idle = null;
  const wake = () => {
    root.classList.remove('idle');
    clearTimeout(idle);
    idle = setTimeout(() => {
      if (!v.paused && speeds.hidden) root.classList.add('idle');
    }, 2400);
  };
  on(root, 'pointermove', wake);
  on(root, 'pointerleave', () => { if (!v.paused && speeds.hidden) root.classList.add('idle'); });
  on(v, 'play', wake);

  // The keys a video site is expected to answer to, while nothing is being typed.
  const keys = e => {
    if (/input|textarea/i.test(document.activeElement.tagName)) return;
    const d = v.duration || 0;
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'k') { e.preventDefault(); toggle(); }
    else if (k === 'arrowright') { e.preventDefault(); skip(5); }
    else if (k === 'arrowleft') { e.preventDefault(); skip(-5); }
    else if (k === 'l') { e.preventDefault(); skip(10); }
    else if (k === 'j') { e.preventDefault(); skip(-10); }
    else if (k === 'arrowup') {
      e.preventDefault();
      v.volume = Math.min(1, v.volume + 0.1);
      v.muted = false;
      say(Math.round(v.volume * 100) + '%');
    } else if (k === 'arrowdown') {
      e.preventDefault();
      v.volume = Math.max(0, v.volume - 0.1);
      say(Math.round(v.volume * 100) + '%');
    } else if (k === 'm') { v.muted = !v.muted; say(v.muted ? 'Muted' : 'Sound on'); }
    else if (k === 'f') { full.click(); }
    else if (k === '<' || k === ',') {
      const i = Math.max(0, RATES.indexOf(v.playbackRate) - 1);
      v.playbackRate = RATES[i];
      paintRates();
      say(rateLabel(RATES[i]) + ' speed');
    } else if (k === '>' || k === '.') {
      const i = Math.min(RATES.length - 1, RATES.indexOf(v.playbackRate) + 1);
      v.playbackRate = RATES[i];
      paintRates();
      say(rateLabel(RATES[i]) + ' speed');
    } else if (/^[0-9]$/.test(k) && d) { v.currentTime = (Number(k) / 10) * d; }
    else return;
    wake();
  };
  on(document, 'keydown', keys);

  setIcons();
  paint();
  paintRates();
  return () => { clearTimeout(idle); clearTimeout(flashOff); clearTimeout(tapTimer); off.forEach(f => f()); };
}


function empty(icon, title, body) {
  return `<div class="empty">
    <div class="ring">${I[icon]()}</div>
    <b>${esc(title)}</b><span>${esc(body)}</span>
  </div>`;
}

const spinner = () => '<div class="spinner"></div>';

/** The shape of the feed while the first page of posts is on its way. */
function skeletons(n) {
  const one = `<div><div class="sk ph"></div><div class="sk ln"></div><div class="sk ln short"></div></div>`;
  return `<div class="grid">${one.repeat(n)}</div>`;
}

/**
 * Cards come in one after another rather than all at once: each is told its
 * place in the run, and the stylesheet turns that into a delay.
 */
function stagger(root) {
  root.querySelectorAll('.grid > *, .shelf > *, .next .row').forEach((n, i) => {
    n.style.setProperty('--i', Math.min(i, 14));
  });
}

/**
 * Picks a frame worth showing as a thumbnail.
 *
 * The very first frame of a recording is usually black or a title card, so each
 * thumbnail seeks a little way in — a quarter of the way through, up to three
 * seconds — as soon as the file says how long it is.
 */
function posterFrames(root) {
  root.querySelectorAll('.thumb video').forEach(v => {
    const seek = () => {
      const d = v.duration;
      if (!d || !isFinite(d)) return;
      try { v.currentTime = Math.min(3, d * 0.25); } catch (e) {}
    };
    if (v.readyState >= 1) seek();
    else v.addEventListener('loadedmetadata', seek, { once: true });
  });
}

// ---------------------------------------------------------------------------
// Taste: what someone watches, for the recommended feed (see taste.js)
// ---------------------------------------------------------------------------

let tasteTimer = null;
const nudged = new Set();
// Until the saved scores have been read, actions wait here: writing before then
// would replace everything learned so far with just the latest action.
let tasteReady = false;
let tastePending = [];

/**
 * Moves someone's subject scores after they watch, like, dislike, search or
 * comment. `once` stops a page that redraws from counting the same view twice.
 * Written back after a pause, so a burst of actions is one write.
 */
function nudge(topics, weight, once) {
  if (!me || !topics || !topics.length || !weight) return;
  if (once) {
    if (nudged.has(once)) return;
    nudged.add(once);
  }
  if (!tasteReady) { tastePending.push([topics, weight]); return; }
  taste = learn(taste, topics, weight);
  saveTaste();
}

function saveTaste() {
  clearTimeout(tasteTimer);
  const uid = me && me.uid;
  if (!uid) return;
  tasteTimer = setTimeout(() => setDoc(doc(db, 'taste', uid), taste).catch(() => {}), 1500);
}

const millis = ts => (ts && ts.toMillis ? ts.toMillis() : 0);

// ---------------------------------------------------------------------------
// Following, and everyone's own page
// ---------------------------------------------------------------------------

/** The address of someone's page: their name when it is known, else their id. */
function userHref(p) {
  const f = p && p.uid && faces.get(p.uid);
  return '#/u/' + encodeURIComponent((f && f.username) || (p && p.uid) || '');
}

/** A name that leads to its owner's page. */
const userLink = (p, text) =>
  `<a class="to-user" data-uid="${esc((p && p.uid) || '')}" href="${userHref(p)}">${esc(text == null ? face(p).authorName : text)}</a>`;

function followBtn(uid) {
  if (!me || !uid || uid === me.uid) return '';
  const on = following.has(uid);
  return `<button class="pill follow${on ? ' on' : ''}" data-follow="${esc(uid)}">${on ? 'Following' : 'Follow'}</button>`;
}

/** Every Follow button on the page, brought up to date without a redraw. */
function paintFollows() {
  document.querySelectorAll('[data-follow]').forEach(b => {
    const on = following.has(b.dataset.follow);
    b.classList.toggle('on', on);
    b.textContent = on ? 'Following' : 'Follow';
  });
  const n = el('followersN');
  if (n && n.dataset.base != null) {
    const base = Number(n.dataset.base) - (n.dataset.was === '1' ? 1 : 0);
    n.textContent = plural(base + (following.has(n.dataset.uid) ? 1 : 0), 'follower');
  }
}

async function toggleFollow(uid) {
  if (!me || !uid || uid === me.uid) return;
  const ref = doc(db, 'follows', me.uid + '_' + uid);
  const was = following.has(uid);
  // Shown at once; the listener on follows confirms it a moment later.
  if (was) following.delete(uid); else following.add(uid);
  paintFollows();
  try {
    if (was) await deleteDoc(ref);
    else await setDoc(ref, { from: me.uid, to: uid, at: serverTimestamp() });
  } catch (e) {
    if (was) following.add(uid); else following.delete(uid);
    paintFollows();
    toast(message(e));
  }
}

/** A name in an address, or an id, turned into an account id. */
async function resolveUser(arg) {
  const key = String(arg || '').trim().toLowerCase();
  if (!key) return null;
  for (const [uid, f] of faces) {
    if (f && f.username && f.username.toLowerCase() === key) return uid;
  }
  try {
    const s = await getDoc(doc(db, 'usernames', key));
    if (s.exists()) return s.get('uid');
  } catch (e) { /* fall through: perhaps it is an id */ }
  return String(arg).trim();
}

// Posts read for someone's page that are older than the feed's latest 150.
const known = new Map();
let userFilter = 'all';

function pageUser(main, arg) {
  document.title = 'Codera';
  main.innerHTML = `<div class="page">${spinner()}</div>`;
  let alive = true;
  teardown.push(() => { alive = false; });

  (async () => {
    const uid = await resolveUser(arg);
    if (!alive) return;
    if (!uid) { main.innerHTML = `<div class="page">${empty('person', 'Nobody by that name', 'Check the spelling, or find them through one of their posts.')}</div>`; return; }
    if (me && uid === me.uid) { location.replace('#/you'); return; }

    const [pSnap, listSnap, followers, followingN] = await Promise.all([
      getDoc(doc(db, 'profiles', uid)).catch(() => null),
      getDocs(query(collection(db, POSTS), where('uid', '==', uid), limit(120))).catch(() => null),
      getCountFromServer(query(collection(db, 'follows'), where('to', '==', uid))).then(c => c.data().count).catch(() => 0),
      getCountFromServer(query(collection(db, 'follows'), where('from', '==', uid))).then(c => c.data().count).catch(() => 0),
    ]);
    if (!alive) return;

    const prof = pSnap && pSnap.exists() ? pSnap.data() : {};
    const theirs = (listSnap ? listSnap.docs.map(d => Object.assign({ id: d.id }, d.data())) : [])
      .sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
    theirs.forEach(p => known.set(p.id, p));

    if (!prof.username && !theirs.length) {
      main.innerHTML = `<div class="page">${empty('person', 'Nobody here', 'This account has no page yet.')}</div>`;
      return;
    }

    faces.set(uid, { username: prof.username, photoUrl: prof.photoUrl });
    const name = prof.username || (theirs[0] && theirs[0].authorName) || 'someone';
    const photo = prof.photoUrl || (theirs[0] && theirs[0].authorPhoto) || null;
    document.title = name + ' — Codera';

    const count = t => theirs.filter(p => p.type === t).length;
    const CHOICES = [
      { id: 'all', label: 'All', n: theirs.length },
      { id: 'video', label: 'Videos', n: count('video') },
      { id: 'short', label: 'Shorts', n: count('short') },
      { id: 'live', label: 'Streams', n: count('live') },
      { id: 'post', label: 'Posts', n: count('post') },
    ].filter(c => c.id === 'all' || c.n);
    if (!CHOICES.some(c => c.id === userFilter)) userFilter = 'all';
    const shown = userFilter === 'all' ? theirs : theirs.filter(p => p.type === userFilter);
    const likes = theirs.reduce((n, p) => n + (p.likeCount || 0), 0);
    const onAirNow = streams.find(s => s.uid === uid && onAir(s));
    const bannerY = typeof prof.bannerY === 'number' ? prof.bannerY : 50;

    main.innerHTML = `<div class="page">
      <div class="banner${prof.bannerUrl ? '' : ' plain'}" style="--by: ${bannerY}">
        ${prof.bannerUrl ? `<img src="${esc(prof.bannerUrl)}" alt="" draggable="false">` : ''}
      </div>
      <div class="profile">
        <span class="ring2">${avatar({ authorName: name, authorPhoto: photo }, 96)}</span>
        <div class="who3">
          <h1>${esc(name)}</h1>
          <div class="line2">
            <span>@${esc(prof.username || name)}</span>
            <span>·</span><span id="followersN" data-uid="${esc(uid)}" data-base="${followers}" data-was="${following.has(uid) ? 1 : 0}">${plural(followers, 'follower')}</span>
            <span>·</span><span>${compact(followingN)} following</span>
            <span>·</span><span>${plural(likes, 'like')}</span>
          </div>
        </div>
        <div class="tools">
          ${onAirNow ? `<a class="pill live-pill" href="#/stream/${onAirNow.id}"><span class="dot"></span>Live now</a>` : ''}
          ${followBtn(uid)}
          ${safetyButtons(uid, name)}
        </div>
      </div>
      ${prof.bio ? `<div class="bio"><p class="bio-txt">${bioFor(prof.bio, (me && me.uid === uid) || isAdult())}</p></div>` : ''}
      ${linkRow(prof.links, me && me.uid === uid)}
      <div class="chips">${CHOICES.map(c =>
        `<button class="chip${userFilter === c.id ? ' on' : ''}" data-ufilter="${c.id}">${c.label}<span class="n">${c.n}</span></button>`).join('')}</div>
      ${shown.length
        ? `<div class="grid">${shown.map(p => card(p)).join('')}</div>`
        : empty('person', 'Nothing here yet', esc(name) + ' hasn’t posted anything like this yet.')}
    </div>`;
    stagger(main);
    wireSafetyButtons(main, name);
    wireAgeAsk(main);
    posterFrames(main);
  })().catch(e => { if (alive) main.innerHTML = `<div class="page">${empty('person', 'Couldn’t open that page', esc(message(e)))}</div>`; });
}

function pageFollowed(main) {
  document.title = 'Following — Codera';
  if (!following.size) {
    main.innerHTML = `<div class="page narrow">
      <h1 class="title">Following</h1>
      ${empty('followed', 'Not following anyone yet',
              'Open someone’s page from their name on any post and press Follow. Their new videos and streams land here.')}
    </div>`;
    return;
  }
  const people = [...following];
  learnFaces(people.map(uid => ({ uid })));
  // Who is live shows as a ring on their picture; the streams themselves are listed on Home.
  const liveF = streams.filter(s => following.has(s.uid) && onAir(s));
  const list = posts.filter(p => following.has(p.uid));

  main.innerHTML = `<div class="page">
    <h1 class="title">Following</h1>
    <div class="people">${people.map(uid => {
      const f = faces.get(uid) || {};
      const who = { uid, authorName: f.username || '…', authorPhoto: f.photoUrl || null };
      const live = liveF.find(s => s.uid === uid);
      return `<a class="person${live ? ' is-live' : ''}" href="${live ? '#/stream/' + live.id : userHref(who)}">
        ${avatar(who, 56)}<span>${esc(who.authorName)}</span>${live ? '<em>LIVE</em>' : ''}</a>`;
    }).join('')}</div>
    ${list.length
      ? `<h2 class="sub">Latest from people you follow</h2><div class="grid">${list.map(p => card(p)).join('')}</div>`
      : empty('followed', 'Nothing new yet', 'When the people you follow post something, it shows up here.')}
  </div>`;
}

// ---------------------------------------------------------------------------
// Live streams
// ---------------------------------------------------------------------------

/**
 * Whether a stream is really on air: marked live, and its streamer's app has
 * checked in within the last minute. A streamer whose browser crashed never
 * gets to say the stream is over; this is how it stops being listed.
 */
function onAir(s) {
  if (!s || !s.live) return false;
  const beat = millis(s.beat);
  return !beat || Date.now() - beat < 75000;
}

function streamCard(s) {
  const who = face(s);
  return `<article class="card" data-stream-open="${s.id}">
    <div class="thumb live-thumb">
      <div class="live-art">${avatar(who, 64)}</div>
      <span class="badge left live">LIVE</span>
      <span class="badge">${compact(s.watching || 0)} watching</span>
    </div>
    <div class="card-body">
      ${avatar(who)}
      <div style="min-width:0">
        <h3>${esc(s.title)}</h3>
        <div class="who">${userLink(s)}</div>
        <div class="who">Started ${ago(s.startedAt)}</div>
      </div>
    </div>
  </article>`;
}

// The stream this browser is sending, if any. It outlives page changes, so a
// streamer can look around Codera without taking the stream down.
let studio = null;

function paintOnAir() {
  let pill = el('onAir');
  const show = studio && route().name !== 'golive';
  if (!show) { if (pill) pill.remove(); return; }
  if (!pill) {
    pill = document.createElement('a');
    pill.id = 'onAir';
    pill.className = 'on-air';
    pill.href = '#/golive';
    document.body.appendChild(pill);
  }
  pill.innerHTML = `<span class="dot"></span><b>You’re live</b><span>${elapsed(Date.now() - studio.startedAt)} · ${compact(studio.watching)} watching</span>`;
}

function onUnloadLive() {
  if (studio) updateDoc(doc(db, 'streams', studio.id), { live: false, endedAt: serverTimestamp() }).catch(() => {});
}

async function goLive(title, media, source, picks) {
  const who = author();
  const ref = await addDoc(collection(db, 'streams'), Object.assign({}, who, {
    title: title.trim().slice(0, 120),
    live: true, watching: 0, likeCount: 0, dislikeCount: 0,
    startedAt: serverTimestamp(), beat: serverTimestamp(), endedAt: null,
  }));
  // Viewers and the recording take the mixer's steady output, so the camera,
  // microphone or screen behind it can be switched at any point in the stream.
  const mix = mixer(media);
  const s = {
    id: ref.id, uid: who.uid, title: title.trim(), mix, source,
    picks: Object.assign({ cam: '', mic: '' }, picks), startedAt: Date.now(), watching: 0,
  };
  studio = s;
  watchSourceEnd(s);
  s.host = hostStream(db, ref.id, mix.stream, {
    onWatching: n => {
      s.watching = n;
      updateDoc(doc(db, 'streams', s.id), { watching: n }).catch(() => {});
    },
  });
  s.rec = recorder(mix.stream);
  // The phone app asks before its screen is closed while this is running.
  if (APP_MODE) toApp({ type: 'live', on: true });
  s.beat = setInterval(() => {
    updateDoc(doc(db, 'streams', s.id), { beat: serverTimestamp() }).catch(() => {});
  }, 20000);
  s.tick = setInterval(() => {
    const t = el('liveTime');
    if (t) t.textContent = elapsed(Date.now() - s.startedAt);
    const w = el('stWatch');
    if (w) w.textContent = compact(s.watching);
    paintOnAir();
  }, 1000);
  window.addEventListener('beforeunload', onUnloadLive);
  nudge(topicsOfText(title), WEIGHT.stream);
}

/**
 * Switches what the stream shows: a camera, or the screen, with a microphone.
 * Viewers and the recording carry straight on; only the picture and sound change.
 */
async function switchSource(kind, picks) {
  const s = studio;
  if (!s) return;
  const next = Object.assign({}, s.picks, picks);
  const media = await capture(kind, next);
  if (studio !== s) { media.getTracks().forEach(t => t.stop()); return; }
  s.picks = next;
  s.source = kind;
  s.mix.use(media);
  watchSourceEnd(s);
}

// Stopping a screen share from the browser's own bar goes back to the camera
// rather than ending the stream.
function watchSourceEnd(s) {
  const track = s.mix.current().getVideoTracks()[0];
  if (!track) return;
  track.addEventListener('ended', () => {
    if (studio !== s || s.mix.current().getVideoTracks()[0] !== track) return;
    switchSource('camera').then(() => { if (route().name === 'golive') render(true); })
      .catch(() => toast('Your screen share stopped. Pick something to show.'));
  });
}

async function endLive() {
  const s = studio;
  if (!s || s.ending) return;
  s.ending = true;
  clearInterval(s.beat);
  clearInterval(s.tick);
  s.host.stop();
  const blob = s.rec ? await s.rec.stop() : null;
  s.mix.stop();
  if (s.chatWindow && !s.chatWindow.closed) s.chatWindow.close();
  window.removeEventListener('beforeunload', onUnloadLive);
  await updateDoc(doc(db, 'streams', s.id), { live: false, endedAt: serverTimestamp(), watching: 0 }).catch(() => {});
  const secs = Math.max(1, Math.round((Date.now() - s.startedAt) / 1000));
  studio = null;
  paintOnAir();
  if (APP_MODE) toApp({ type: 'live', on: false });

  if (!blob || !blob.size) {
    deleteDoc(doc(db, 'streams', s.id)).catch(() => {});
    toast('Stream ended.');
    finishLive();
    return;
  }
  askSave(s, blob, secs);
}

/** After a stream: back to Home, or, inside the phone app, back to the app. */
function finishLive() {
  if (APP_MODE) toApp({ type: 'done' });
  else location.hash = '#/';
}

/** The question at the end of every stream: keep it, or let it go. */
function askSave(s, blob, secs) {
  const size = blob.size / 1048576;
  const box = sheet(`
    <h2>Save this stream?</h2>
    <p class="note">“${esc(s.title)}” ran for ${elapsed(secs * 1000)}. Saved streams go on your page and into people’s feeds, where they can watch them back. Nothing has been uploaded yet.</p>
    <div class="bar" id="saveBar" hidden><i></i></div>
    <p class="err" id="saveErr"></p>
    <div class="row2">
      <button class="pill" id="saveNo">Don’t save</button>
      <button class="brand-btn" id="saveYes" style="width:auto;padding:0 22px">Save stream <span style="opacity:.75;font-weight:600">(${size < 1 ? '<1' : Math.round(size)} MB)</span></button>
    </div>`);
  box.onclick = null;           // no closing this one by clicking outside

  el('saveNo').onclick = () => {
    deleteDoc(doc(db, 'streams', s.id)).catch(() => {});
    closeSheet();
    toast('Stream ended. It wasn’t saved.');
    finishLive();
  };
  el('saveYes').onclick = async () => {
    const yes = el('saveYes'), no = el('saveNo'), bar = el('saveBar');
    yes.disabled = true; no.disabled = true; bar.hidden = false;
    yes.textContent = 'Uploading…';
    try {
      const who = author();
      const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
      const path = 'videos/' + who.uid + '/live-' + s.id + '.' + ext;
      const file = new File([blob], 'stream.' + ext, { type: blob.type || 'video/webm' });
      const videoUrl = await uploadTo(path, file, f => { bar.querySelector('i').style.width = Math.round(f * 100) + '%'; });
      await addDoc(collection(db, POSTS), Object.assign({}, who, {
        type: 'live',
        title: s.title,
        description: null,
        videoUrl, videoPath: path,
        duration: secs,
        likeCount: 0, dislikeCount: 0, commentCount: 0,
        createdAt: serverTimestamp(),
      }));
      deleteDoc(doc(db, 'streams', s.id)).catch(() => {});
      closeSheet();
      toast('Saved. It’s on your page and in the feed.');
      finishLive();
    } catch (e) {
      el('saveErr').textContent = message(e);
      yes.disabled = false; no.disabled = false;
      yes.textContent = 'Try again';
    }
  };
}

/**
 * The "Tips from your streams" card on your own page: whether viewers can tip
 * you, and the way into Stripe to set up or manage where the money goes.
 * Stripe keeps the bank details; Codera only learns whether it's ready.
 */
let payoutsSeen = null;       // { at, status }: asked of Stripe at most once a minute

// Where Stripe can pay streamers out. Stripe needs the country before anything
// else, and it can't be changed once the account exists.
const PAYOUT_COUNTRIES = 'AE AT AU BE BG BR CA CH CY CZ DE DK EE ES FI FR GB GI GR HK HR HU IE IN IT JP LI LT LU LV MT MX MY NL NO NZ PL PT RO SE SG SI SK TH US'.split(' ');

function countryPicker() {
  let names = null;
  try { names = new Intl.DisplayNames([navigator.language || 'en'], { type: 'region' }); } catch (e) {}
  const mine = ((navigator.language || '').split('-')[1] || '').toUpperCase();
  const pick = PAYOUT_COUNTRIES.includes(mine) ? mine : 'US';
  const opts = PAYOUT_COUNTRIES
    .map(c => [c, (names && names.of(c)) || c])
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([c, n]) => `<option value="${c}"${c === pick ? ' selected' : ''}>${esc(n)}</option>`).join('');
  return `<select class="field sel pay-country" id="payCountry" aria-label="Your country">${opts}</select>`;
}

function wirePayouts() {
  const text = el('payText'), acts = el('payActs');
  if (!text || !acts) return;
  const paint = st => {
    if (!el('payText')) return;
    const waiting = st.held > 0 ? `$${(st.held / 100).toFixed(2)}` : '';
    if (st.ready) {
      text.textContent = `Viewers can tip you while you’re live. Codera keeps 3%; the rest is paid out to you by Stripe${st.payoutsEnabled ? '' : ' once your bank details are confirmed'}.`
        + (waiting ? ` ${waiting} in earlier tips is on its way to you.` : '');
      acts.innerHTML = '<button class="pill" id="payDash">Payouts dashboard</button>';
    } else if (st.hasAccount) {
      text.innerHTML = (waiting ? `You have ${waiting} in tips waiting. ` : '')
        + 'Almost there: Stripe needs a few more details before your tips can be paid to you. <a href="#" id="payRestart">Wrong country? Start again</a>';
      acts.innerHTML = '<button class="brand-btn" id="paySetup">Finish setting up</button>';
    } else {
      text.textContent = waiting
        ? `You have ${waiting} in tips waiting. Set up payouts and it’s sent to your bank, along with every tip after it.`
        : 'Viewers can tip you while you’re live. Set up payouts to get the tips, minus Codera’s 3% and Stripe’s card fee, in your bank. Tips given before then are kept for you.';
      acts.innerHTML = countryPicker() + '<button class="brand-btn" id="paySetup">Set up payouts</button>';
    }
    const go = async (fn, btn) => {
      btn.disabled = true;
      const was = btn.textContent;
      btn.textContent = 'Opening Stripe…';
      try {
        const country = el('payCountry') ? el('payCountry').value : undefined;
        const res = await httpsCallable(fns, fn)({ back: location.origin + '/#/you', country, restart: !!country && !!st.hasAccount });
        location.href = res.data.url;
      } catch (e) {
        btn.disabled = false;
        btn.textContent = was;
        toast(message(e));
      }
    };
    if (el('paySetup')) el('paySetup').onclick = e => go('payoutsLink', e.currentTarget);
    if (el('payDash')) el('payDash').onclick = e => go('payoutsDashboard', e.currentTarget);
    if (el('payRestart')) el('payRestart').onclick = e => {
      e.preventDefault();
      text.textContent = 'Pick your country and Stripe will start a fresh setup.';
      acts.innerHTML = countryPicker() + '<button class="brand-btn" id="paySetup">Start again</button>';
      el('paySetup').onclick = ev => go('payoutsLink', ev.currentTarget);
    };
  };
  if (payoutsSeen && Date.now() - payoutsSeen.at < 60000) { paint(payoutsSeen.status); return; }
  httpsCallable(fns, 'payoutsStatus')()
    .then(res => { payoutsSeen = { at: Date.now(), status: res.data }; paint(res.data); })
    .catch(e => { if (el('payText')) text.textContent = message(e); });
}

/** The camera and microphone pickers: every device the machine has, OBS's virtual camera included. */
function deviceRow() {
  return `<div class="devices">
    <label>${I.camera()}<select class="field sel" id="camSel"><option value="">Default camera</option></select></label>
    <label>${I.mic()}<select class="field sel" id="micSel"><option value="">Default microphone</option></select></label>
  </div>`;
}

/** Fills the pickers once the browser will name the devices (after the first permission). */
async function fillDevices(picks) {
  const { cams, mics } = await devices().catch(() => ({ cams: [], mics: [] }));
  const fill = (id, list, chosen, word) => {
    const sel = el(id);
    if (!sel) return;
    sel.innerHTML = `<option value="">Default ${word}</option>`
      + list.map(d => `<option value="${esc(d.id)}"${d.id === chosen ? ' selected' : ''}>${esc(d.label)}</option>`).join('');
  };
  fill('camSel', cams, picks.cam, 'camera');
  fill('micSel', mics, picks.mic, 'microphone');
}

/** Starting a stream: pick the camera or the screen, name it, go. */
function pageGoLive(main) {
  document.title = 'Go live — Codera';
  if (studio) { studioPage(main); return; }
  if (!canStream()) {
    main.innerHTML = `<div class="page narrow">${empty('live', 'This browser can’t stream',
      'Open Codera in Chrome, Edge, Firefox or Safari on a computer to go live.')}</div>`;
    return;
  }

  let source = 'camera';
  let media = null;
  let handedOver = false;
  const picks = { cam: '', mic: '' };
  teardown.push(() => { if (media && !handedOver) media.getTracks().forEach(t => t.stop()); });

  main.innerHTML = `<div class="page narrow golive">
    <h1 class="title">${I.live()} Go live</h1>
    <p class="muted">Stream your camera${APP_MODE ? '' : ' or your screen'}. People watch on the website, the app and the desktop app, and chat alongside.</p>
    <div class="studio-prev">
      <video id="prev" muted playsinline autoplay></video>
      <div class="prev-empty" id="prevEmpty">${I.camera()}<span>Choose what to share</span></div>
    </div>
    <div class="chips">
      <button class="chip on" data-src="camera">${I.camera()}Camera</button>
      ${APP_MODE ? '' : `<button class="chip" data-src="screen">${I.screen()}Screen</button>`}
    </div>
    ${deviceRow()}
    <input class="field" id="liveTitle" maxlength="120" placeholder="What are you streaming?">
    <p class="err" id="liveErr"></p>
    <div class="golive-row">
      <a class="pill" href="#/" data-leave>Cancel</a>
      <button class="brand-btn" id="liveGo" style="width:auto;padding:0 26px">Go live</button>
    </div>
    <p class="note" id="tipsNote">You choose at the end whether to save the stream. Every viewer connects straight to you, so it suits a small audience.</p>
  </div>`;

  // Tips only reach a streamer whose payouts are set up; say so before going live.
  getDoc(doc(db, 'payouts', me.uid)).then(snap => {
    const n = el('tipsNote');
    if (n && !(snap.exists() && snap.get('ready')) && !APP_MODE) {
      n.insertAdjacentHTML('beforeend', ' Want tips from viewers? <a href="#/you">Set up payouts on your page</a> first.');
    }
  }).catch(() => {});

  const prev = el('prev');
  const show = m => {
    if (media && media !== m) media.getTracks().forEach(t => t.stop());
    media = m;
    prev.srcObject = m;
    el('prevEmpty').hidden = !!m;
  };
  const pick = async src => {
    source = src;
    main.querySelectorAll('[data-src]').forEach(b => b.classList.toggle('on', b.dataset.src === src));
    el('liveErr').textContent = '';
    try {
      show(await capture(src, picks));
      fillDevices(picks);
    } catch (e) {
      show(null);
      el('liveErr').textContent = src === 'screen'
        ? 'Screen sharing was cancelled or blocked.'
        : 'Codera can’t use that camera or microphone. Allow them in the browser’s address bar, or pick another.';
    }
  };
  main.querySelectorAll('[data-src]').forEach(b => { b.onclick = () => pick(b.dataset.src); });
  el('camSel').onchange = e => { picks.cam = e.target.value; if (source === 'camera') pick('camera'); };
  el('micSel').onchange = e => { picks.mic = e.target.value; pick(source); };
  pick('camera');

  el('liveGo').onclick = async () => {
    const title = el('liveTitle').value.trim();
    if (!title) { el('liveErr').textContent = 'Give your stream a title.'; el('liveTitle').focus(); return; }
    const go = el('liveGo');
    go.disabled = true; go.textContent = 'Starting…';
    try {
      if (!media) show(await capture(source, picks));
      handedOver = true;
      await goLive(title, media, source, picks);
      render(true);
    } catch (e) {
      handedOver = false;
      go.disabled = false; go.textContent = 'Go live';
      el('liveErr').textContent = message(e);
    }
  };
}

/** The streamer's own view while live: preview, counts, chat, and the end. */
function studioPage(main) {
  const s = studio;
  main.innerHTML = `<div class="page"><div class="watch stream-page">
    <div>
      <div class="player live-player">
        <video id="studioVideo" muted playsinline autoplay></video>
        <span class="live-tag">LIVE</span>
        <span class="live-time" id="liveTime">${elapsed(Date.now() - s.startedAt)}</span>
      </div>
      <h1>${esc(s.title)}</h1>
      <div class="byline">
        <div class="stats">
          <span><b id="stWatch">${compact(s.watching)}</b> watching</span>
          <span>${I.up()}<b id="stUp">0</b></span>
          <span>${I.down()}<b id="stDown">0</b></span>
          <span id="stTips"></span>
        </div>
        <div class="acts">
          ${APP_MODE ? '' : `<button class="act" id="popChat">${I.comment()}<span>Pop out chat</span></button>`}
          <button class="act danger" id="endLive">End stream</button>
        </div>
      </div>
      <div class="panel switcher">
        <div class="switch-head"><b>Showing</b><span class="muted">Switch at any time. Viewers and the recording carry straight on.</span></div>
        <div class="chips">
          <button class="chip${s.source === 'camera' ? ' on' : ''}" data-switch="camera">${I.camera()}Camera</button>
          ${APP_MODE ? '' : `<button class="chip${s.source === 'screen' ? ' on' : ''}" data-switch="screen">${I.screen()}Screen</button>`}
        </div>
        ${deviceRow()}
        <p class="err" id="switchErr"></p>
      </div>
      <div class="panel"><div class="text">Viewers find you at the top of Home while you’re on air, with a red ring on your picture for everyone who follows you. This preview is exactly what they see.</div></div>
    </div>
    ${chatPanel()}
  </div></div>`;

  // The mixer's own output: what viewers get, and what is being recorded.
  el('studioVideo').srcObject = s.mix.stream;
  fillDevices(s.picks);
  const change = async (kind, picks) => {
    el('switchErr').textContent = '';
    try {
      await switchSource(kind, picks);
      main.querySelectorAll('[data-switch]').forEach(b => b.classList.toggle('on', b.dataset.switch === s.source));
    } catch (e) {
      el('switchErr').textContent = kind === 'screen'
        ? 'Screen sharing was cancelled.'
        : 'Couldn’t use that camera or microphone. Is another app holding it?';
    }
  };
  main.querySelectorAll('[data-switch]').forEach(b => { b.onclick = () => change(b.dataset.switch); });
  el('camSel').onchange = e => change('camera', { cam: e.target.value });
  el('micSel').onchange = e => change(s.source, { mic: e.target.value });
  // The chat in a window of its own, to keep beside OBS or on a second screen.
  if (el('popChat')) {
    el('popChat').onclick = () => {
      if (s.chatWindow && !s.chatWindow.closed) { s.chatWindow.focus(); return; }
      s.chatWindow = window.open(`${location.origin}/?popout=chat#/chat/${s.id}`, 'codera-chat-' + s.id,
        'popup,width=420,height=720');
      if (!s.chatWindow) toast('Your browser blocked the chat window. Allow pop-ups for Codera.');
    };
  }
  el('endLive').onclick = async () => {
    const b = el('endLive');
    b.disabled = true; b.textContent = 'Ending…';
    await endLive();
  };
  teardown.push(onSnapshot(doc(db, 'streams', s.id), snap => {
    const d = snap.data();
    if (!d) return;
    const set = (id, v) => { const n = el(id); if (n) n.innerHTML = v; };
    set('stUp', compact(d.likeCount || 0));
    set('stDown', compact(d.dislikeCount || 0));
    set('stTips', d.tips ? `${I.tip()}<b>$${(d.tips / 100).toFixed(2)}</b> in tips` : '');
  }, () => {}));
  teardown.push(wireChat(s.id, s.uid));
}

/** Watching someone else's stream. */
function pageStream(main, id) {
  if (studio && studio.id === id) { location.replace('#/golive'); return; }
  document.title = 'Live — Codera';
  main.innerHTML = `<div class="page">${spinner()}</div>`;

  let viewer = null;
  let built = false;
  const stream = {};             // the vote tally and its painter, once built
  const stopViewer = () => { if (viewer) { viewer.stop(); viewer = null; } };
  teardown.push(stopViewer);

  const connect = () => {
    stopViewer();
    const v = el('liveVideo');
    if (!v) return;
    viewer = watchStream(db, id, me.uid, v, st => {
      const box = el('liveState');
      if (!box) return;
      box.hidden = st === 'connected';
      if (st === 'failed') {
        box.innerHTML = `<span>Couldn’t connect to this stream.</span><button class="pill" id="liveRetry">Try again</button>`;
        el('liveRetry').onclick = () => { box.innerHTML = '<span>Connecting…</span>'; connect(); };
      } else if (st !== 'connected') {
        box.innerHTML = '<span>Connecting…</span>';
      }
    });
  };

  teardown.push(onSnapshot(doc(db, 'streams', id), snap => {
    const s = snap.exists() ? Object.assign({ id }, snap.data()) : null;
    if (!s || !onAir(s)) {
      stopViewer();
      built = false;
      main.innerHTML = `<div class="page narrow">${empty('live', 'This stream has ended',
        s && s.authorName ? 'If ' + esc(s.authorName) + ' saved it, it’s on their page and in the feed.' : 'Saved streams are in the feed.')}
        <div style="text-align:center;margin-top:10px"><a class="pill" href="#/" data-leave>Back to Home</a></div></div>`;
      return;
    }
    learnFaces([s], false);
    if (!built) {
      built = true;
      document.title = s.title + ' — Codera';
      nudge(topicsOf(s), WEIGHT.stream, 'stream:' + id);
      main.innerHTML = `<div class="page"><div class="watch stream-page">
        <div>
          <div class="player live-player" id="livePlayer">
            <video id="liveVideo" playsinline autoplay muted></video>
            <span class="live-tag">LIVE</span>
            <div class="live-state" id="liveState"><span>Connecting…</span></div>
            <div class="live-ctl">
              <button class="pill" id="liveSound">${pI('loud')}Turn sound on</button>
              <button class="icon-btn" id="liveFull" aria-label="Full screen">${pI('full')}</button>
            </div>
          </div>
          <h1 id="sTitle">${esc(s.title)}</h1>
          <div class="byline">
            <a class="to-user" href="${userHref(s)}">${avatar(face(s), 40)}</a>
            <div>
              <div class="name">${userLink(s)}</div>
              <div class="when"><span id="sWatch">${compact(s.watching || 0)}</span> watching · started ${ago(s.startedAt)}</div>
            </div>
            <div class="acts">
              ${followBtn(s.uid)}
              <button class="act" data-lvote="1" id="lUp">${I.up()}<span id="lUpN">${compact(s.likeCount || 0)}</span></button>
              <button class="act" data-lvote="-1" id="lDown">${I.down()}<span id="lDownN">${compact(s.dislikeCount || 0)}</span></button>
              ${APP_MODE === 'ios' ? '' : `<button class="act tip-btn" id="tipBtn"${s.uid === me.uid ? ' hidden' : ''}>${I.tip()}<span>Tip</span></button>`}
            </div>
          </div>
        </div>
        ${chatPanel()}
      </div></div>`;

      const v = el('liveVideo');
      el('liveSound').onclick = e => { v.muted = false; v.play().catch(() => {}); e.currentTarget.remove(); };
      el('liveFull').onclick = () => {
        const box = el('livePlayer');
        if (document.fullscreenElement) document.exitFullscreen();
        else (box.requestFullscreen || box.webkitRequestFullscreen).call(box);
      };
      if (el('tipBtn')) el('tipBtn').onclick = () => openTip(s);

      // Votes show the moment they are pressed. The transaction behind them can
      // take a few seconds on a busy stream, whose document the streamer's app
      // is also writing; the stream's own snapshot then settles the numbers.
      const tally = { like: s.likeCount || 0, dislike: s.dislikeCount || 0, mine: 0 };
      const paintVotes = () => {
        const up = el('lUp'), down = el('lDown');
        if (!up || !down) return;
        up.classList.toggle('on', tally.mine === 1);
        down.classList.toggle('on', tally.mine === -1);
        down.classList.toggle('down', tally.mine === -1);
        el('lUpN').textContent = compact(Math.max(0, tally.like));
        el('lDownN').textContent = compact(Math.max(0, tally.dislike));
      };
      stream.tally = tally;
      stream.paintVotes = paintVotes;
      main.querySelectorAll('[data-lvote]').forEach(b => {
        b.onclick = () => {
          const want = Number(b.dataset.lvote);
          const had = tally.mine;
          const now = had === want ? 0 : want;
          tally.like += (now === 1) - (had === 1);
          tally.dislike += (now === -1) - (had === -1);
          tally.mine = now;
          paintVotes();
          voteOn('streams', id, want)
            .then(v => { if (v) nudge(topicsOf(s), v === 1 ? WEIGHT.like : WEIGHT.dislike); })
            .catch(err => {
              tally.like -= (now === 1) - (had === 1);
              tally.dislike -= (now === -1) - (had === -1);
              tally.mine = had;
              paintVotes();
              toast(message(err));
            });
        };
      });
      teardown.push(watchVoteOn('streams', id, mineV => { tally.mine = mineV; paintVotes(); }));
      teardown.push(wireChat(id, s.uid));
      connect();
    } else {
      const set = (k, v) => { const n = el(k); if (n) n.textContent = v; };
      set('sTitle', s.title);
      set('sWatch', compact(s.watching || 0));
      if (stream.tally) {
        stream.tally.like = s.likeCount || 0;
        stream.tally.dislike = s.dislikeCount || 0;
        stream.paintVotes();
      }
    }
  }, err => { main.innerHTML = `<div class="page">${empty('live', 'Couldn’t open this stream', esc(message(err)))}</div>`; }));
}

// ---- Chat --------------------------------------------------------------------

/**
 * A stream's chat on its own, filling the window: what "Pop out chat" opens, to
 * sit beside OBS or on a second screen. Closes itself when the stream ends.
 */
function pageChat(main, id) {
  document.title = 'Chat — Codera';
  main.innerHTML = `<div class="chat-window">${spinner()}</div>`;
  let built = false;
  teardown.push(onSnapshot(doc(db, 'streams', id), snap => {
    const s = snap.exists() ? snap.data() : null;
    if (!s || !onAir(s)) {
      main.innerHTML = `<div class="page narrow">${empty('comment', 'This stream has ended', 'You can close this window.')}</div>`;
      built = false;
      return;
    }
    const n = el('chatWinTitle');
    if (n) n.textContent = s.title;
    if (built) return;
    built = true;
    document.title = 'Chat — ' + s.title;
    main.innerHTML = `<div class="chat-window">
      <div class="chat-win-head"><span class="live-tag static">LIVE</span><b id="chatWinTitle">${esc(s.title)}</b></div>
      ${chatPanel()}
    </div>`;
    teardown.push(wireChat(id, s.uid));
  }, () => { main.innerHTML = `<div class="page">${empty('comment', 'Couldn’t open the chat', 'Close this window and try again.')}</div>`; }));
}

function chatPanel() {
  return `<aside class="chat">
    <div class="chat-head">Live chat</div>
    <div class="chat-list" id="chatList"><div class="chat-empty">${spinner()}</div></div>
    <form class="chat-form" id="chatForm" autocomplete="off">
      <input id="chatText" maxlength="300" placeholder="Say something">
      <button class="icon-btn" aria-label="Send">${I.send()}</button>
    </form>
  </aside>`;
}

function msgHTML(m, hostUid) {
  const who = face(m);
  const mayDelete = me && (m.uid === me.uid || me.uid === hostUid) && !m.tip;
  return `<div class="msg${m.tip ? ' tip' : ''}${m.uid === hostUid ? ' host' : ''}">
    ${avatar(who, 26)}
    <div class="msg-body">
      <b>${userLink(m)}</b>${m.uid === hostUid ? '<span class="host-tag">Streamer</span>' : ''}
      ${m.tip ? `<span class="tip-amt">${I.tip()}$${(m.tip / 100).toFixed(2)}</span>` : ''}
      ${m.text ? `<span class="msg-text">${esc(m.text)}</span>` : ''}
    </div>
    ${mayDelete ? `<button class="x" data-mdel="${m.id}" aria-label="Delete">×</button>` : ''}
  </div>`;
}

function wireChat(streamId, hostUid) {
  const list = el('chatList');
  const unsub = onSnapshot(
    query(collection(db, 'streams', streamId, 'chat'), orderBy('at', 'desc'), limit(100)),
    snap => {
      const box = el('chatList');
      if (!box) return;
      const msgs = snap.docs.map(d => Object.assign({ id: d.id }, d.data()))
        .filter(m => !blocked.has(m.uid))
        .reverse();
      learnFaces(msgs, false);
      const stick = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
      box.innerHTML = msgs.length
        ? msgs.map(m => msgHTML(m, hostUid)).join('')
        : '<div class="chat-empty">No messages yet. Say hello.</div>';
      if (stick) box.scrollTop = box.scrollHeight;
    },
    () => { const box = el('chatList'); if (box) box.innerHTML = '<div class="chat-empty">Chat is unavailable.</div>'; });

  el('chatForm').onsubmit = e => {
    e.preventDefault();
    const input = el('chatText');
    const text = input.value.trim();
    if (!text) return;
    const problem = contactProblem(text, me && me.uid === hostUid);
    if (problem) { toast(problem); return; }
    input.value = '';
    addDoc(collection(db, 'streams', streamId, 'chat'),
      Object.assign({}, author(), { text: text.slice(0, 300), at: serverTimestamp() }))
      .catch(err => { input.value = text; toast(message(err)); });
  };
  list.onclick = e => {
    const x = e.target.closest('[data-mdel]');
    if (x) deleteDoc(doc(db, 'streams', streamId, 'chat', x.dataset.mdel)).catch(err => toast(message(err)));
  };
  return unsub;
}

// ---- Tips --------------------------------------------------------------------

const TIP_AMOUNTS = [200, 500, 1000, 2000, 5000];

/**
 * Tipping a streamer: pick an amount, add a message, pay with Stripe's form,
 * and the tip turns up highlighted in the chat once the server has checked the
 * payment went through.
 */
function openTip(s) {
  if (me && s.uid === me.uid) return;
  let amount = 500;
  let stripe = null, elements = null, intentId = null, account = null;
  const name = face(s).authorName;

  sheet(`
    <h2>${I.tip()} Tip ${esc(name)}</h2>
    <p class="note">Your tip goes to ${esc(name)} and shows up highlighted in the chat for everyone watching. Codera keeps 3%.</p>
    <div class="chips tip-amounts">${TIP_AMOUNTS.map(a =>
      `<button class="chip${a === amount ? ' on' : ''}" data-amt="${a}">$${a / 100}</button>`).join('')}</div>
    <input class="field" id="tipMsg" maxlength="200" placeholder="Add a message (optional)">
    <div id="tipPay" class="tip-pay"></div>
    <p class="err" id="tipErr"></p>
    <div class="row2">
      <button class="pill" data-close>Cancel</button>
      <button class="brand-btn" id="tipGo" style="width:auto;padding:0 22px">Continue</button>
    </div>`);

  const go = el('tipGo');
  const setAmount = a => {
    amount = a;
    document.querySelectorAll('[data-amt]').forEach(b => b.classList.toggle('on', Number(b.dataset.amt) === a));
  };
  document.querySelectorAll('[data-amt]').forEach(b => { b.onclick = () => { if (!elements) setAmount(Number(b.dataset.amt)); }; });

  go.onclick = async () => {
    el('tipErr').textContent = '';
    go.disabled = true;
    try {
      if (!elements) {
        go.textContent = 'One moment…';
        const res = await httpsCallable(fns, 'tipIntent')({
          streamId: s.id, amount, message: el('tipMsg').value.trim(),
        });
        const d = res.data;
        intentId = d.intentId;
        account = d.account;
        if (!window.Stripe) throw new Error('Stripe didn’t load. Check your connection and try again.');
        // Paid on the streamer's own Stripe account, Codera taking its 3%; or, if they
        // haven't set up payouts yet, to Codera, which keeps their share for them.
        stripe = window.Stripe(d.livemode ? STRIPE_PK.live : STRIPE_PK.test,
          d.account ? { stripeAccount: d.account } : undefined);
        const dark = document.documentElement.dataset.theme === 'dark'
          || (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
        elements = stripe.elements({
          clientSecret: d.clientSecret,
          appearance: {
            theme: dark ? 'night' : 'stripe',
            variables: { colorPrimary: '#22c55e', borderRadius: '12px', fontFamily: 'system-ui, sans-serif' },
          },
        });
        elements.create('payment', { layout: 'tabs' }).mount('#tipPay');
        document.querySelectorAll('[data-amt]').forEach(b => { b.disabled = true; });
        el('tipMsg').disabled = true;
        go.textContent = 'Pay $' + (amount / 100).toFixed(2);
        go.disabled = false;
        return;
      }
      go.textContent = 'Paying…';
      const out = await stripe.confirmPayment({
        elements, redirect: 'if_required', confirmParams: { return_url: location.href },
      });
      if (out.error) throw new Error(out.error.message || 'That payment didn’t go through.');
      await httpsCallable(fns, 'tipConfirm')({ intentId, account });
      closeSheet();
      toast('Tip sent. Thank you!');
    } catch (e) {
      el('tipErr').textContent = message(e);
      go.disabled = false;
      go.textContent = elements ? 'Pay $' + (amount / 100).toFixed(2) : 'Continue';
    }
  };
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

function route() {
  const raw = location.hash.replace(/^#\/?/, '');
  const parts = raw.split('/');
  const name = parts.shift() || 'home';
  return { name, arg: decodeURIComponent(parts.join('/') || '') };
}

// Pages that own a playing video: a new snapshot must not tear them down and
// start playback over, so they are only rebuilt when the route itself changes.
const KEEPS = new Set(['watch', 'shorts', 'stream', 'golive', 'chat']);
let painted = null;

function render(force) {
  if (shutNow) return;
  if (!me) return;
  const r = route();
  const key = r.name + '/' + r.arg;

  if (!force && painted === key && KEEPS.has(r.name)) { patchCounts(); return; }

  dropView();
  painted = key;
  paintNav();
  layout();

  const main = el('main');
  main.scrollTop = 0;
  window.scrollTo(0, 0);

  const page = {
    home: pageHome, shorts: pageShorts, followed: pageFollowed, you: pageYou,
    plus: pagePlus, watch: pageWatch, search: pageSearch,
    golive: pageGoLive, stream: pageStream, u: pageUser, chat: pageChat,
  }[r.name] || pageHome;

  page(main, r.arg);
  stagger(main);
  posterFrames(main);
  paintOnAir();
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

let homeFilter = 'all';
const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'video', label: 'Videos' },
  { id: 'short', label: 'Shorts' },
  { id: 'post', label: 'Posts' },
];

// ---- a video ad on Home -------------------------------------------------------
//
// One sponsored card on Home, after the first video, that plays only if you
// press Watch — never on its own, and never over anything you are watching.
// It turns up at most once every AD_GAP_MS, and never for Plus members.
//
// The ad itself comes through Google's IMA SDK from a VAST tag. AD_TAG is
// Google's own sample tag until Codera has an Ad Manager ad unit: it plays
// Google's test creative and earns nothing, and the card says "test ad".
const AD_TAG_LIVE = null;   // Codera's Ad Manager video tag, once there is one
const AD_TAG = AD_TAG_LIVE || 'https://pubads.g.doubleclick.net/gampad/ads?iu=/21775744923/external/single_preroll_skippable&sz=640x480&ciu_szs=300x250%2C728x90&gdfp_req=1&output=vast&unviewed_position_start=1&env=vp&impl=s&correlator=';
const AD_GAP_MS = 20 * 60 * 1000;

function adDue() {
  if (plus.loading || plus.active) return false;
  let last = 0;
  try { last = Number(localStorage.getItem('codera.adAt')) || 0; } catch (e) { /* private window */ }
  return Date.now() - last > AD_GAP_MS;
}

function adSeen() {
  try { localStorage.setItem('codera.adAt', String(Date.now())); } catch (e) { /* fine */ }
}

function adCard() {
  return `<article class="card ad-card" id="homeAd">
    <div class="thumb ad-stage" id="adStage">
      <video id="adVideo" playsinline muted></video>
      <div class="ad-slot" id="adSlot"></div>
      <div class="ad-poster" id="adPoster">
        <span class="ad-badge">Sponsored${AD_TAG_LIVE ? '' : ' · test ad'}</span>
        <button class="ad-play" id="adPlay">${I.play()}<span>Watch</span></button>
      </div>
    </div>
    <div class="card-body">
      <div style="min-width:0;flex:1">
        <h3>A short video from a sponsor</h3>
        <div class="who">Only if you want to watch it. Codera Plus has no ads.</div>
      </div>
      <button class="dots ad-x" id="adClose" aria-label="Hide this ad">${I.close()}</button>
    </div>
  </article>`;
}

let imaLoading = null;
function loadIma() {
  if (window.google && window.google.ima) return Promise.resolve();
  if (!imaLoading) {
    imaLoading = new Promise((resolve, reject) => {
      const tag = document.createElement('script');
      tag.src = 'https://imasdk.googleapis.com/js/sdkloader/ima3.js';
      tag.onload = resolve;
      tag.onerror = () => { imaLoading = null; reject(new Error('The ad player could not load.')); };
      document.head.appendChild(tag);
    });
  }
  return imaLoading;
}

function wireHomeAd() {
  const card = el('homeAd');
  if (!card) return;
  const done = message => {
    adSeen();
    const stage = el('adStage');
    if (stage) stage.innerHTML = `<div class="ad-done">${esc(message)}</div>`;
    setTimeout(() => { const c = el('homeAd'); if (c) c.remove(); }, 2500);
  };
  el('adClose').onclick = () => { adSeen(); card.remove(); };
  el('adPlay').onclick = async () => {
    const play = el('adPlay');
    play.disabled = true;
    try {
      await loadIma();
      const ima = window.google.ima;
      const video = el('adVideo');
      const slot = el('adSlot');
      const shown = new ima.AdDisplayContainer(slot, video);
      shown.initialize();   // must happen inside the click, for the browser to allow sound
      const loader = new ima.AdsLoader(shown);
      loader.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, () => done('No ad right now.'));
      loader.addEventListener(ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED, e => {
        const ads = e.getAdsManager(video);
        ads.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, () => done('No ad right now.'));
        ads.addEventListener(ima.AdEvent.Type.STARTED, () => { const p = el('adPoster'); if (p) p.hidden = true; });
        ads.addEventListener(ima.AdEvent.Type.ALL_ADS_COMPLETED, () => done('Thanks for watching.'));
        ads.addEventListener(ima.AdEvent.Type.SKIPPED, () => done('Skipped.'));
        const box = el('adStage').getBoundingClientRect();
        ads.init(Math.round(box.width), Math.round(box.height), ima.ViewMode.NORMAL);
        ads.start();
      });
      const request = new ima.AdsRequest();
      request.adTagUrl = AD_TAG + Date.now();
      const box = el('adStage').getBoundingClientRect();
      request.linearAdSlotWidth = Math.round(box.width);
      request.linearAdSlotHeight = Math.round(box.height);
      loader.requestAds(request);
    } catch (e) {
      done(e.message || 'No ad right now.');
    }
  };
}

function pageHome(main) {
  document.title = 'Codera';
  if (!postsReady) { main.innerHTML = `<div class="page">${skeletons(8)}</div>`; return; }

  // Saved streams are part of the feed, with a STREAM badge.
  const feed = posts;
  const shorts = rank(feed.filter(p => p.type === 'short'), taste, following);
  const rest = feed.filter(p => p.type !== 'short');
  const list = rank(homeFilter === 'all' ? rest : feed.filter(p => p.type === homeFilter), taste, following);
  const onNow = streams.filter(onAir)
    .sort((a, b) => (following.has(b.uid) - following.has(a.uid)) || (b.watching || 0) - (a.watching || 0));

  const chips = FILTERS.map(f =>
    `<button class="chip${homeFilter === f.id ? ' on' : ''}" data-filter="${f.id}">${f.label}</button>`).join('');

  const liveShelf = homeFilter === 'all' && onNow.length
    ? `<h2 class="sub">${I.live()} Live now</h2>
       <div class="grid">${onNow.map(streamCard).join('')}</div>`
    : '';

  const shelf = homeFilter === 'all' && shorts.length
    ? `<h2 class="sub">${I.shorts()} Shorts</h2>
       <div class="shelf">${shorts.slice(0, 12).map(p => cardVideo(p)).join('')}</div>`
    : '';

  // The one ad goes after the first video — or the third post, if there is none.
  const withAd = items => {
    const cards = items.map(p => card(p));
    if (homeFilter !== 'all' || !adDue() || cards.length < 2) return cards;
    const firstVideo = items.findIndex(isVideo);
    cards.splice(firstVideo >= 0 ? firstVideo + 1 : Math.min(3, cards.length), 0, adCard());
    return cards;
  };

  main.innerHTML = `<div class="page">
    <div class="chips">${chips}</div>
    ${liveShelf}
    ${shelf}
    ${list.length
      ? `${homeFilter === 'all' ? '' : `<h2 class="sub">${FILTERS.find(f => f.id === homeFilter).label}</h2>`}
         <div class="grid">${withAd(list).join('')}</div>`
      : empty('code', 'Nothing here yet',
              'Post something, or open the app and upload a tutorial — it turns up here straight away.')}
  </div>`;
  wireHomeAd();
}

function pageSearch(main, q) {
  document.title = q ? q + ' — Codera' : 'Search — Codera';
  const needle = q.toLowerCase();
  // What people search for is a good sign of what they want to learn.
  nudge(topicsOfText(q), WEIGHT.search, 'search:' + needle);
  const hits = rank(posts.filter(p =>
    [p.title, p.body, p.code, p.description, p.authorName, face(p).authorName, p.lang]
      .some(v => v && String(v).toLowerCase().includes(needle))), taste, following);
  const liveHits = streams.filter(s => onAir(s)
    && [s.title, s.authorName, face(s).authorName].some(v => v && String(v).toLowerCase().includes(needle)));

  main.innerHTML = `<div class="page">
    <h1 class="title">${hits.length + liveHits.length} result${hits.length + liveHits.length === 1 ? '' : 's'} for “${esc(q)}”</h1>
    ${liveHits.length ? `<div class="grid">${liveHits.map(streamCard).join('')}</div>` : ''}
    ${hits.length
      ? `<div class="grid"${liveHits.length ? ' style="margin-top:24px"' : ''}>${hits.map(p => card(p)).join('')}</div>`
      : liveHits.length ? '' : empty('code', 'Nothing matched', 'Try a shorter word, or the name of whoever posted it.')}
  </div>`;
}

// ---------------------------------------------------------------------------
// Watching one post
// ---------------------------------------------------------------------------

function pageWatch(main, id) {
  const p = byId(id);
  if (!p) {
    main.innerHTML = `<div class="page">${spinner()}</div>`;
    if (!postsReady) return;
    // Older than the feed's latest posts, reached from someone's page or a link:
    // read it on its own.
    getDoc(doc(db, POSTS, id)).then(snap => {
      if (route().name !== 'watch' || route().arg !== id) return;
      if (snap.exists()) { known.set(id, Object.assign({ id }, snap.data())); render(true); return; }
      main.innerHTML = `<div class="page">${empty('code', 'That post is gone', 'It may have been deleted by whoever posted it.')}</div>`;
    }).catch(() => {
      main.innerHTML = `<div class="page">${empty('code', 'That post is gone', 'It may have been deleted by whoever posted it.')}</div>`;
    });
    return;
  }
  document.title = p.title + ' — Codera';
  nudge(topicsOf(p), WEIGHT.watch, 'watch:' + p.id);

  const next = rank(posts.filter(o => o.id !== p.id && o.type !== 'short'), taste, following).slice(0, 20);
  const mine = me && p.uid === me.uid;

  main.innerHTML = `<div class="page">
    <div class="watch">
      <div>
        ${isVideo(p)
          ? playerHTML(p.videoUrl, {})
          : picGrid(p, 6)}
        <h1>${esc(p.title)}</h1>
        <div class="byline">
          <a class="to-user" href="${userHref(p)}">${avatar(face(p), 40)}</a>
          <div>
            <div class="name">${userLink(p)}</div>
            <div class="when">${ago(p.createdAt)}${p.type === 'short' ? ' · Short' : p.type === 'live' ? ' · Saved stream' : ''}</div>
          </div>
          <div class="acts">
            ${followBtn(p.uid)}
            <button class="act" data-vote="1" id="upBtn">${I.up()}<span id="upN">${compact(p.likeCount || 0)}</span></button>
            <button class="act" data-vote="-1" id="downBtn">${I.down()}<span id="downN">${compact(p.dislikeCount || 0)}</span></button>
            ${mine ? `<button class="act danger" data-del="${p.id}">${I.trash()}<span>Delete</span></button>`
                    : `<button class="act" id="reportBtn">${I.flag()}<span>Report</span></button>`}
          </div>
        </div>
        ${reviewNote(p)}

        ${p.body || p.code || p.description ? `<div class="panel">
          ${p.lang ? `<div class="lang">${esc(p.lang)}</div>` : ''}
          ${p.description ? `<div class="text">${esc(p.description)}</div>` : ''}
          ${p.body ? `<div class="text">${esc(p.body)}</div>` : ''}
          ${p.code ? `<pre class="code" style="margin-top:12px">${esc(p.code)}</pre>` : ''}
        </div>` : ''}

      </div>

      <aside>
        <details class="cdrop" id="cWrap">
          <summary><h2 class="sub" id="cN">${plural(p.commentCount, 'comment')}</h2></summary>
          <div class="cbox">
            ${avatar({ authorName: profile.username || me.displayName, authorPhoto: profile.photoUrl || me.photoURL }, 36)}
            <textarea id="cText" placeholder="Add a comment" maxlength="1000"></textarea>
            <button class="pill" id="cSend" style="height:42px">Comment</button>
          </div>
          <div id="cList">${spinner()}</div>
        </details>
        <h2 class="sub" style="margin-top:0">Up next</h2>
        <div class="next">${next.map(o => `
          <div class="row" data-open="${o.id}">
            ${isVideo(o) ? thumb(o) : `<div class="thumb" style="display:grid;place-items:center;background:var(--bg3);color:var(--muted)">${I.code()}</div>`}
            <div style="min-width:0">
              <h4>${esc(o.title)}</h4>
              <div class="who">${esc(face(o).authorName)}</div>
              <div class="who">${plural(o.likeCount, 'like')} · ${ago(o.createdAt)}</div>
            </div>
          </div>`).join('')}
        </div>
      </aside>
    </div>
  </div>`;

  const vp = main.querySelector('[data-vp]');
  if (vp) {
    teardown.push(wirePlayer(vp));
    // Starts itself where the browser allows it. Where it does not, it simply
    // waits with the play button showing — better than starting silently and
    // leaving someone to work out why there is no sound.
    vp.querySelector('video').play().catch(() => {});
  }

  // Open where there is a column to put it in, folded where there is not:
  // stacked, an unfolded comment list pushes Up next off the bottom of the page.
  const cWrap = el('cWrap');
  if (cWrap) cWrap.open = window.matchMedia('(min-width: 1151px)').matches;

  // My own vote, live, so the thumbs show what I already pressed.
  teardown.push(watchMyVote(p.id, v => {
    if (el('reportBtn')) el('reportBtn').onclick = () => openReport(p);
    myVoteNow = v;
    // A press still on its way owns the thumbs until it lands; otherwise this
    // would flick them back to the old value for as long as the trip takes.
    if (pretending.has(p.id)) return;
    paintThumbs(p.id, v);
  }));

  teardown.push(onSnapshot(
    query(collection(db, POSTS, p.id, 'comments'), orderBy('createdAt', 'asc'), limit(200)),
    snap => {
      const list = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
      const box = el('cList');
      if (!box) return;
      // Comment authors too, though without redrawing the page under a video.
      learnFaces(list, false);
      box.innerHTML = list.length ? list.map(c => `
        <div class="comment">
          ${avatar(face(c), 34)}
          <div style="flex:1;min-width:0">
            <div class="line"><b>${userLink(c)}</b>${ago(c.createdAt)}</div>
            <div class="txt">${esc(c.text)}</div>
          </div>
          ${(me.uid === c.uid || mine) ? `<button class="x" data-cdel="${c.id}">Delete</button>` : ''}
        </div>`).join('')
        : '<div class="who" style="color:var(--muted);padding:6px 0 20px">No comments yet. Say the first thing.</div>';
    },
    () => { const box = el('cList'); if (box) box.innerHTML = ''; }));
}

/** Counts change under a page that must not be rebuilt; they are written in. */
function patchCounts() {
  const r = route();
  if (r.name !== 'watch') return;
  const p = byId(r.arg);
  if (!p) return;
  const set = (id, v) => { const n = el(id); if (n) n.textContent = v; };
  set('upN', compact(p.likeCount || 0));
  set('downN', compact(p.dislikeCount || 0));
  set('cN', plural(p.commentCount, 'comment'));
}

// ---------------------------------------------------------------------------
// Shorts
// ---------------------------------------------------------------------------

function pageShorts(main, id) {
  document.title = 'Shorts — Codera';
  const list = posts.filter(p => p.type === 'short');
  if (!postsReady) { main.innerHTML = `<div class="page">${spinner()}</div>`; return; }
  if (!list.length) {
    main.innerHTML = `<div class="page">${empty('shorts', 'No shorts yet',
      'Shorts are up to a minute. Post one from the app, or with Create above.')}</div>`;
    return;
  }

  main.innerHTML = `<div class="shorts" id="shortsFeed">
    ${list.map(p => `
      <section class="short" data-short="${p.id}">
        <div class="stage">
          <video src="${esc(p.videoUrl)}" loop playsinline preload="metadata" muted></video>
          <div class="cap">
            <b>${esc(p.title)}</b>
            <span>${esc(face(p).authorName)} · ${ago(p.createdAt)}</span>
          </div>
        </div>
        <div class="side">
          <button class="sbtn" data-svote="1" data-id="${p.id}">
            <span class="ring">${I.up()}</span><span data-up="${p.id}">${compact(p.likeCount || 0)}</span>
          </button>
          <button class="sbtn" data-svote="-1" data-id="${p.id}">
            <span class="ring">${I.down()}</span><span data-down="${p.id}">${compact(p.dislikeCount || 0)}</span>
          </button>
          <a class="sbtn" href="#/watch/${p.id}">
            <span class="ring">${I.comment()}</span><span>${compact(p.commentCount || 0)}</span>
          </a>
        </div>
      </section>`).join('')}
  </div>`;

  // One short plays at a time: whichever is filling the screen.
  const feed = el('shortsFeed');
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      const v = e.target.querySelector('video');
      if (!v) return;
      if (e.isIntersecting && e.intersectionRatio > 0.6) { v.muted = false; v.play().catch(() => { v.muted = true; v.play().catch(() => {}); }); }
      else { v.pause(); }
    });
  }, { root: feed, threshold: [0, 0.6, 1] });
  feed.querySelectorAll('.short').forEach(s => io.observe(s));
  teardown.push(() => io.disconnect());

  list.forEach(p => teardown.push(watchMyVote(p.id, v => {
    const up = feed.querySelector(`[data-svote="1"][data-id="${p.id}"]`);
    const down = feed.querySelector(`[data-svote="-1"][data-id="${p.id}"]`);
    if (!up || !down) return;
    up.classList.toggle('on', v === 1);
    down.classList.toggle('on', v === -1);
    down.classList.toggle('down', v === -1);
    up.querySelector('svg').outerHTML = I.up(v === 1);
    down.querySelector('svg').outerHTML = I.down(v === -1);
  })));

  if (id) {
    const target = feed.querySelector(`[data-short="${id}"]`);
    if (target) target.scrollIntoView();
  }
}

// ---------------------------------------------------------------------------
// Followed, You, Plus
// ---------------------------------------------------------------------------

let youFilter = 'all';

function pageYou(main) {
  document.title = 'You — Codera';
  const mineAll = posts.filter(p => me && p.uid === me.uid);
  const count = t => mineAll.filter(p => p.type === t).length;
  const CHOICES = [
    { id: 'all', label: 'All', n: mineAll.length },
    { id: 'post', label: 'Posts', n: count('post') },
    { id: 'short', label: 'Shorts', n: count('short') },
    { id: 'video', label: 'Videos', n: count('video') },
  ];
  const shown = youFilter === 'all' ? mineAll : mineAll.filter(p => p.type === youFilter);
  const none = {
    all: 'Nothing posted yet. Use Create to put up a post, a short or a video.',
    post: "You haven't written a post yet.",
    short: "You haven't posted a short yet.",
    video: "You haven't posted a video yet.",
  }[youFilter];

  const likes = mineAll.reduce((n, p) => n + (p.likeCount || 0), 0);
  const face = { authorName: me.displayName || me.email, authorPhoto: me.photoURL || profile.photoUrl || null };
  const banner = profile.bannerUrl;
  // Where the picture sits inside the strip. Half way down unless moved.
  const bannerY = typeof profile.bannerY === 'number' ? profile.bannerY : 50;

  main.innerHTML = `<div class="page">
    <div class="banner" id="bannerBox" style="--by: ${bannerY}">
      ${banner ? `<img src="${esc(banner)}" alt="" draggable="false">` : `
        <div class="hint"><b>Add a banner</b><span>Drop a picture here, or press the button. Wide pictures fit best.</span></div>`}
      <div class="moving-bar" hidden>
        <span>Drag the picture to choose what shows</span>
        <button class="pill" data-move="cancel">Cancel</button>
        <button class="pill" data-move="save">Save</button>
      </div>
      <button class="pill edit" id="bannerBtn">${I.image()}
        <span>${banner ? 'Change banner' : 'Add a banner'}</span></button>
    </div>

    <div class="profile">
      <span class="ring2">${avatar(face, 96)}</span>
      <div class="who3">
        <h1>${esc(me.displayName || (me.email || '').split('@')[0])}</h1>
        <div class="line2">
          <span>@${esc(profile.username || me.displayName || '')}</span>
          <span>·</span><span>${plural(mineAll.length, 'post')}</span>
          <span>·</span><span>${plural(likes, 'like')}</span>
          ${plus.active ? `<span class="plus-chip">${I.sparkle()}Plus</span>` : ''}
        </div>
      </div>
      <div class="tools">
        <button class="pill" id="photoBtn">${I.camera()}<span>Picture</span></button>
        <button class="pill create" data-act="create">${I.plus()}<span>Create</span></button>
      </div>
    </div>

    <div class="bio" id="bioWrap">
      ${profile.bio
        ? `<p class="bio-txt">${esc(profile.bio)}</p>
           ${bioPoints(profile.bio) && !isAdult()
             ? `<p class="bio-warn">Where this points is hidden from anyone who has not
                 confirmed they are ${ADULT_AGE} or over. Confirm yours, or move it into
                 your links.</p>`
             : ''}
           <button class="pill ghost2" id="bioBtn">Edit description</button>`
        : `<button class="pill ghost2" id="bioBtn">Add a description</button>`}
    </div>

    <div class="socials-wrap" id="linkWrap">${myLinksBlock()}</div>

    <div class="payouts" id="payouts">
      <span class="pay-ico">${I.tip()}</span>
      <div class="pay-words"><b>Tips from your streams</b><span class="muted" id="payText">Checking…</span></div>
      <div class="pay-acts" id="payActs"></div>
    </div>

    <div class="chips">${CHOICES.map(c =>
      `<button class="chip${youFilter === c.id ? ' on' : ''}" data-you="${c.id}">${c.label}<span class="n">${c.n}</span></button>`).join('')}</div>
    ${shown.length
      ? `<div class="grid">${shown.map(p => card(p, { own: true })).join('')}</div>`
      : empty('person', 'Nothing here yet', none)}
  </div>`;

  wirePayouts();

  // Changing either picture: pick, upload, and the page redraws itself when the
  // profile document comes back changed.
  const swap = async (kind, btn, label) => {
    const file = await pickImage();
    if (!file) return;
    btn.disabled = true;
    const had = btn.innerHTML;
    btn.innerHTML = '<span>Uploading…</span>';
    try {
      await setProfileImage(kind, file);
      toast(kind === 'banner' ? 'Banner updated.' : 'Picture updated.');
      render(true);
    } catch (e) {
      toast(message(e));
      btn.disabled = false;
      btn.innerHTML = had;
    }
  };

  el('photoBtn').onclick = e => swap('photo', e.currentTarget);

  const box = el('bannerBox');

  /**
   * Drag the picture up and down to choose the strip that shows.
   *
   * Without this the browser picks the middle and the visible slice shifts
   * every time the window changes width — which is what made a banner look
   * like it kept changing on its own.
   */
  function reposition() {
    const img = box.querySelector('img');
    if (!img) return;
    let y = bannerY;
    let from = null;
    const bar = box.querySelector('.moving-bar');
    box.classList.add('moving');
    bar.hidden = false;

    const down = e => { from = { py: e.clientY, y }; box.setPointerCapture(e.pointerId); };
    const move = e => {
      if (!from) return;
      // How far the picture can travel depends on how much taller than the
      // strip it is; a drag of the strip's own height covers the lot.
      y = Math.min(100, Math.max(0, from.y - ((e.clientY - from.py) / box.clientHeight) * 100));
      box.style.setProperty('--by', y);
    };
    const up = e => { from = null; try { box.releasePointerCapture(e.pointerId); } catch (err) {} };
    box.addEventListener('pointerdown', down);
    box.addEventListener('pointermove', move);
    box.addEventListener('pointerup', up);

    const stop = () => {
      box.classList.remove('moving');
      bar.hidden = true;
      box.removeEventListener('pointerdown', down);
      box.removeEventListener('pointermove', move);
      box.removeEventListener('pointerup', up);
    };

    bar.querySelector('[data-move="cancel"]').onclick = () => { stop(); render(true); };
    bar.querySelector('[data-move="save"]').onclick = async () => {
      stop();
      try { await setBannerY(y); toast('Banner saved.'); }
      catch (e) { toast(message(e)); render(true); }
    };
  }

  const over = yes => e => { e.preventDefault(); box.classList.toggle('drop', yes); };
  box.addEventListener('dragover', over(true));
  box.addEventListener('dragleave', over(false));
  box.addEventListener('drop', async e => {
    e.preventDefault();
    box.classList.remove('drop');
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file || file.type.indexOf('image/') !== 0) return toast('That needs to be a picture.');
    try { await setProfileImage('banner', file); toast('Banner updated.'); render(true); }
    catch (err) { toast(message(err)); }
  });

  // The description is written in place rather than in a dialog: it is one
  // line about yourself, not a form to fill in.
  el('bioBtn').onclick = () => {
    const wrap = el('bioWrap');
    wrap.innerHTML = `
      <textarea class="field" id="bioText" maxlength="300"
        placeholder="Say what you post about. 300 characters.">${esc(profile.bio || '')}</textarea>
      <div class="bio-row">
        <span class="who" id="bioLeft"></span>
        <button class="pill" id="bioCancel">Cancel</button>
        <button class="brand-btn" id="bioSave" style="width:auto;padding:0 20px;height:36px;font-size:14px;margin:0">Save</button>
      </div>`;
    const box = el('bioText');
    const left = el('bioLeft');
    const count = () => { left.textContent = (300 - box.value.length) + ' left'; };
    box.oninput = count;
    count();
    box.focus();
    box.selectionStart = box.value.length;

    el('bioCancel').onclick = () => render(true);
    el('bioSave').onclick = async () => {
      el('bioSave').disabled = true;
      try { await setBio(box.value); toast('Description saved.'); render(true); }
      catch (e) { toast(message(e)); el('bioSave').disabled = false; }
    };
  };

  wireMyLinks();
  wireAgeAsk(main);

  el('bannerBtn').onclick = e => {
    const btn = e.currentTarget;
    if (!banner) return swap('banner', btn);
    // Once there is one, the button asks which of the three things you meant.
    menuAt(btn, `<button data-swap>${I.image()}Change banner</button>
                 <button data-move>${I.camera()}Reposition</button>
                 <button class="danger" data-rm>${I.trash()}Remove banner</button>`, m => {
      m.querySelector('[data-swap]').onclick = () => { closeMenu(); swap('banner', btn); };
      m.querySelector('[data-move]').onclick = () => { closeMenu(); reposition(); };
      m.querySelector('[data-rm]').onclick = async () => {
        closeMenu();
        try { await clearBanner(); toast('Banner removed.'); render(true); }
        catch (err) { toast(message(err)); }
      };
    });
  };
}

const PERKS = [
  ['No ads on shorts or videos', 'Watch straight through — nothing between you and the tutorial.'],
  ['Every new Plus perk, first', 'Whatever gets built for Plus is yours the day it ships.'],
  ['Cancel anytime', 'One tap. Plus stays until the period you paid for runs out.'],
];

function pagePlus(main) {
  document.title = 'Codera Plus';
  const date = plus.endsAt ? plusDate(plus.endsAt) : '';
  const note = plus.cancelled
    ? `Plus stays until ${date}. Subscribe again and nothing is charged until then.`
    : plus.active ? `Renews ${date}.`
    : 'Renews monthly. Cancel anytime.';

  const label = plus.cancelled ? 'Subscribe again'
    : plus.active ? 'Cancel Plus'
    : `Subscribe for ${PLUS_PRICE}/month`;

  main.innerHTML = `<div class="page narrow">
    <div class="plus-wrap"><div class="plus-in">
      <div class="orb">${I.sparkle()}</div>
      <h1>Codera <em>Plus</em></h1>
      <p class="lede">Support Codera, lose the ads, and get every perk the moment it exists.</p>

      <div class="plan"><div class="plan-in">
        <div class="price"><b id="priceBig">${PLUS_PRICE}</b><span>/ month</span></div>
        ${PERKS.map(([t, b]) => `<div class="perk">
          <span class="tick">${I.check()}</span>
          <span><b>${t}</b><span>${b}</span></span>
        </div>`).join('')}
        <button class="brand-btn" id="plusBtn" ${plus.loading ? 'disabled' : ''}>
          ${plus.loading ? 'Checking…' : label}
        </button>
        ${plus.active && !plus.cancelled ? '<button class="pill wide-pill" id="cardBtn">Change card</button>' : ''}
        <p class="plus-note">${note}</p>
      </div></div>

      <div class="paybox" id="payBox" hidden>
        <div class="payside">
          <div class="payhead">
            <b id="payTitle">Codera Plus</b>
            <button class="pill" id="payBack">Back</button>
          </div>
          <div class="payprice"><b id="payPriceBig">$10</b><span>/ month</span></div>
          ${PERKS.map(([t]) => `<div class="payperk">${I.check()}<span>${t}</span></div>`).join('')}
          <p class="plus-note" id="payNote">Card details go straight to Stripe.
            Codera never sees them.</p>
        </div>
        <div>
          <div id="payExpress"></div>
          <div class="payor" id="payOr" hidden><span>or pay by card</span></div>
          <div id="payMount"></div>
          <p class="err" id="payErr" hidden></p>
          <button class="brand-btn" id="payGo" hidden>Subscribe for $10/month</button>
        </div>
      </div>

      <p class="plus-note">Payment is handled by Stripe — card details never reach Codera.
        Cancel any time from this page.</p>
    </div></div>
  </div>`;

  // Written in once the rate arrives, so nothing waits on it: the dollar
  // price is what stands there until it does.
  showLocalPrice();

  const btn = el('plusBtn');
  btn.onclick = async () => {
    btn.disabled = true;
    btn.textContent = 'Working…';
    try {
      if (plus.active && !plus.cancelled) {
        await httpsCallable(fns, 'plusCancel')();
        toast('Plus will not renew.');
      } else {
        // Subscribing, or subscribing again after a cancellation: both are a
        // purchase, card and confirmation, and the server decides whether the
        // first charge is today or when the paid month runs out.
        await openStripeForm(plus.cancelled ? 'renew' : 'pay');
        return;                       // the form is up; the button stays put
      }
    } catch (e) {
      toast(message(e));
    }
    btn.disabled = false;
    btn.textContent = label;
  };

  const cardBtn = el('cardBtn');
  if (cardBtn) {
    cardBtn.onclick = async () => {
      cardBtn.disabled = true;
      try { await openStripeForm('card'); }
      catch (e) { toast(message(e)); cardBtn.disabled = false; }
    };
  }

  /** Stripe's library, fetched now if the tag in the page has not arrived. */
  function ensureStripe() {
    if (window.Stripe) return Promise.resolve();
    return new Promise((res, rej) => {
      const tag = document.createElement('script');
      tag.src = 'https://js.stripe.com/v3/';
      tag.onload = res;
      tag.onerror = () => rej(new Error('stripe'));
      document.head.appendChild(tag);
    });
  }

  /**
   * Asks before anything is charged or changed, in Codera's own sheet.
   * Resolves true only for the explicit yes.
   */
  function confirmBox(title, text, yes) {
    return new Promise(resolve => {
      sheet(`
        <h2>${esc(title)}</h2>
        <p class="note">${esc(text)}</p>
        <div class="row2">
          <button class="pill" id="cNo">Not now</button>
          <button class="brand-btn" id="cYes" style="width:auto;padding:0 22px;height:38px;font-size:14px;margin:0">${esc(yes)}</button>
        </div>`);
      const done = v => { closeSheet(); resolve(v); };
      el('cNo').onclick = () => done(false);
      el('cYes').onclick = () => done(true);
      el('sheet').onclick = e => { if (e.target === el('sheet')) done(false); };
    });
  }

  /**
   * Codera's own payment form, in three moods.
   *
   *   pay    — subscribe now: $10 today, then monthly.
   *   renew  — subscribe again inside a month already paid for: the card is
   *            saved now and the first $10 waits for that month to end.
   *   card   — change the card an active subscription is charged to.
   *
   * The fields are Stripe's — a card number must never touch anything of ours —
   * but their look is entirely ours.
   */
  async function openStripeForm(mode) {
    try { await ensureStripe(); } catch (e) {}
    if (!window.Stripe) { toast("Couldn't load the payment form. Check any ad blocker."); return; }

    const res = await httpsCallable(fns, mode === 'card' ? 'plusCard' : 'plusIntent')();
    const data = (res && res.data) || {};
    const secret = data.clientSecret || data.setupSecret;
    if (!secret) throw new Error('no secret');
    // The server has the final say on whether this is a payment or a saved card.
    const saving = !!data.setupSecret;
    if (mode !== 'card') mode = saving ? 'renew' : 'pay';

    const pk = data.livemode ? STRIPE_PK.live : STRIPE_PK.test;
    if (!pk) { toast('No payment key for this mode.'); return; }

    const startsOn = data.startsAt ? plusDate(data.startsAt) : date;
    const WORDS = {
      pay:   { title: 'Codera Plus', go: 'Subscribe for $10/month', busy: 'Paying…',
               note: 'Card details go straight to Stripe. Codera never sees them.' },
      renew: { title: 'Subscribe again', go: 'Subscribe again · nothing charged today', busy: 'Saving…',
               note: `Nothing is charged today. Your first $10.00 is on ${startsOn}, when your current month ends.` },
      card:  { title: 'Change card', go: 'Save card', busy: 'Saving…',
               note: `Nothing is charged now. Your next $10.00${date ? ' on ' + date : ''} goes on the new card.` },
    }[mode];

    const box = el('payBox');
    box.hidden = false;
    document.querySelector('.plus-in').classList.add('paying');
    el('payTitle').textContent = WORDS.title;
    el('payNote').textContent = WORDS.note;
    if (mode === 'pay') showLocalPrice();
    payOpen = true;
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // The palette the page is actually wearing, read off the page itself, so
    // the form follows light and dark along with everything else.
    const css = getComputedStyle(document.documentElement);
    const v = name => css.getPropertyValue(name).trim();
    const dark = !document.documentElement.getAttribute('data-theme')
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : document.documentElement.getAttribute('data-theme') === 'dark';

    const stripe = window.Stripe(pk);
    const elements = stripe.elements({
      clientSecret: secret,
      // Scoutie Sans, fetched from this site. Stripe loads it inside its own
      // frame, which is why the fonts are served with a cross-origin header.
      fonts: [
        { family: 'Scoutie Sans', src: `url(${location.origin}/fonts/ScoutieSans-Medium.ttf)`, weight: '500' },
        { family: 'Scoutie Sans', src: `url(${location.origin}/fonts/ScoutieSans-Bold.ttf)`, weight: '700' },
      ],
      appearance: {
        theme: dark ? 'night' : 'stripe',
        variables: {
          fontFamily: "'Scoutie Sans', system-ui, sans-serif",
          fontSizeBase: '15px',
          colorPrimary: v('--green') || '#22c55e',
          colorBackground: v('--bg2'),
          colorText: v('--text'),
          colorTextSecondary: v('--muted'),
          colorTextPlaceholder: v('--muted'),
          colorDanger: v('--red') || '#ef4444',
          borderRadius: '12px',
          spacingUnit: '4px',
        },
        rules: {
          '.Input': { border: '1px solid ' + v('--border'), boxShadow: 'none', padding: '12px 13px' },
          '.Input:focus': { border: '1px solid ' + (v('--blue') || '#3b82f6'), boxShadow: 'none' },
          '.Label': { fontWeight: '700', marginBottom: '6px' },
          '.Tab': { border: '1px solid ' + v('--border'), boxShadow: 'none' },
          '.Tab--selected': { borderColor: v('--blue') || '#3b82f6' },
        },
      },
    });

    // Wallet buttons only when paying now: they are one-tap charges, which is
    // the wrong promise for saving a card that pays later.
    let wallets = null;
    if (mode === 'pay') {
      wallets = elements.create('expressCheckout', {
        buttonHeight: 46,
        buttonTheme: { applePay: dark ? 'white' : 'black', googlePay: dark ? 'white' : 'black' },
      });
      wallets.mount('#payExpress');
      wallets.on('ready', e => {
        const has = e && e.availablePaymentMethods
          && Object.values(e.availablePaymentMethods).some(Boolean);
        el('payOr').hidden = !has;
      });
      wallets.on('confirm', () => finish(true));
    }

    const payment = elements.create('payment', {
      layout: { type: 'accordion', defaultCollapsed: false, radios: false, spacedAccordionItems: true },
      fields: { billingDetails: { address: { country: 'auto', postalCode: 'auto' } } },
    });
    payment.mount('#payMount');

    const go = el('payGo');
    const err = el('payErr');
    go.hidden = false;
    go.textContent = WORDS.go;

    const reset = () => { go.disabled = false; go.textContent = WORDS.go; };

    /**
     * Confirms what the person chose. A wallet has already asked for itself,
     * so it skips Codera's own confirmation; the card fields do not.
     */
    async function finish(fromWallet) {
      err.hidden = true;

      if (!fromWallet) {
        // The form checks itself first, so a half-typed card is caught before
        // anyone is asked to confirm a payment that could not happen.
        const checked = await elements.submit();
        if (checked.error) { err.textContent = checked.error.message; err.hidden = false; return; }

        const ask = {
          pay: ['Subscribe to Codera Plus?',
            'You pay $10.00 today, then $10.00 every month until you cancel.', 'Pay $10.00'],
          renew: ['Subscribe to Codera Plus again?',
            `Nothing is charged today. $10.00 on ${startsOn}, when your current month ends, then every month until you cancel.`,
            'Confirm'],
          card: ['Use this card for Plus?',
            `Your next $10.00${date ? ' on ' + date : ''} will go on this card. Nothing is charged now.`,
            'Use this card'],
        }[mode];
        if (!(await confirmBox(ask[0], ask[1], ask[2]))) return;
      }

      go.disabled = true;
      go.textContent = WORDS.busy;

      // redirect: 'if_required' keeps everyone on this page except the few
      // whose bank insists on its own screen for 3-D Secure.
      const confirmParams = { return_url: location.origin + '/#/plus' };
      const out = saving || mode === 'card'
        ? await stripe.confirmSetup({ elements, confirmParams, redirect: 'if_required' })
        : await stripe.confirmPayment({ elements, confirmParams, redirect: 'if_required' });

      if (out.error) {
        // A declined card or a wrong number: say what Stripe said, since it is
        // written for the person holding the card.
        err.textContent = out.error.message || 'That did not go through.';
        err.hidden = false;
        reset();
        return;
      }

      const status = (out.paymentIntent || out.setupIntent || {}).status;
      if (status !== 'succeeded' && status !== 'processing') {
        err.textContent = 'That is still pending. Give it a moment.';
        err.hidden = false;
        reset();
        return;
      }

      if (mode === 'card') {
        try {
          await httpsCallable(fns, 'plusCardSave')({ setupIntentId: data.setupIntentId });
        } catch (e) {
          err.textContent = message(e);
          err.hidden = false;
          reset();
          return;
        }
        toast('Card updated.');
      }

      el('payNote').textContent = mode === 'pay' ? 'Payment received. Switching Plus on…'
        : mode === 'renew' ? `Card saved. Nothing charged today — your next $10.00 is on ${startsOn}.`
        : 'Card updated. The next charge goes on it.';
      go.textContent = 'Done';
      payOpen = false;
      setTimeout(() => render(true), 2500);
    }

    go.onclick = () => finish(false);

    const destroy = () => { try { payment.destroy(); if (wallets) wallets.destroy(); } catch (e) {} };
    el('payBack').onclick = () => { destroy(); payOpen = false; render(true); };
    teardown.push(() => { destroy(); payOpen = false; });
  }
}

// ---------------------------------------------------------------------------
// Sheets: create, confirm, account menu
// ---------------------------------------------------------------------------

function closeSheet() { const s = el('sheet'); s.hidden = true; s.innerHTML = ''; }

function sheet(html) {
  const s = el('sheet');
  s.innerHTML = `<div class="card2">${html}</div>`;
  s.hidden = false;
  s.onclick = e => { if (e.target === s) closeSheet(); };
  return s;
}

function openCreate() {
  sheet(`
    <h2>Create</h2>
    <p class="note">Everything you post lands in the app as well.</p>
    <div style="display:grid;gap:10px">
      <button class="nav-item" data-new="post" style="height:56px;border:1px solid var(--border);background:var(--bg2)">
        ${I.code()}<span><b style="display:block;font-size:14.5px">Post</b>
        <span style="color:var(--muted);font-size:13px;font-weight:500">Something you learned, with an optional snippet</span></span>
      </button>
      <button class="nav-item" data-new="short" style="height:56px;border:1px solid var(--border);background:var(--bg2)">
        ${I.shorts()}<span><b style="display:block;font-size:14.5px">Short</b>
        <span style="color:var(--muted);font-size:13px;font-weight:500">Up to a minute, vertical works best</span></span>
      </button>
      <button class="nav-item" data-new="video" style="height:56px;border:1px solid var(--border);background:var(--bg2)">
        ${I.play()}<span><b style="display:block;font-size:14.5px">Video</b>
        <span style="color:var(--muted);font-size:13px;font-weight:500">A full tutorial. Screen recordings work well</span></span>
      </button>
      <button class="nav-item" data-new="live" style="height:56px;border:1px solid var(--border);background:var(--bg2)">
        ${I.live()}<span><b style="display:block;font-size:14.5px">Go live</b>
        <span style="color:var(--muted);font-size:13px;font-weight:500">Stream your camera or screen, with live chat</span></span>
      </button>
    </div>
    <div class="row2"><button class="pill" data-close>Cancel</button></div>`);
}

const LANGS = ['JavaScript', 'Python', 'TypeScript', 'Java', 'C++', 'Go', 'Rust', 'Other'];

function composePost() {
  let images = [];
  let lang = null;

  sheet(`
    <h2>New post</h2>
    <p class="note">A title and either words or code.</p>
    <input class="field" id="npTitle" placeholder="Title" maxlength="120">
    <textarea class="field" id="npBody" placeholder="What did you learn, build or break?" maxlength="4000"></textarea>
    <button class="pickfile" id="npPick">Add pictures</button>
    <div id="npPreview"></div>
    <textarea class="field mono" id="npCode" placeholder="// optional snippet" spellcheck="false" maxlength="8000"></textarea>
    <div class="chips" id="npLangs" hidden>${LANGS.map(l => `<button class="chip" data-lang="${l}">${l}</button>`).join('')}</div>
    <p class="err" id="npErr" hidden></p>
    <div class="bar" id="npBar" hidden><i></i></div>
    <div class="row2">
      <button class="pill" data-close>Cancel</button>
      <button class="brand-btn" id="npGo" style="width:auto;padding:0 22px;height:38px;font-size:14px">Post</button>
    </div>`);

  const file = document.createElement('input');
  file.type = 'file';
  file.accept = 'image/*';
  file.multiple = true;

  // Each one shows with a cross on it, because the way to drop the third of
  // four is to press the third of four.
  const drawPicked = () => {
    const box = el('npPreview');
    if (!images.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="picked">' + images.map((pic, i) =>
      '<span><img src="' + URL.createObjectURL(pic) + '" alt="">'
      + '<button data-drop="' + i + '" aria-label="Remove">' + I.close() + '</button></span>').join('')
      + '</div>';
    box.querySelectorAll('[data-drop]').forEach(b => {
      b.onclick = () => { images.splice(Number(b.dataset.drop), 1); drawPicked(); };
    });
  };

  file.onchange = () => {
    // Picked in more than one go: adding three and then two makes five.
    images = images.concat(Array.from(file.files || [])).slice(0, MAX_PICS);
    file.value = '';
    drawPicked();
  };
  el('npPick').onclick = () => file.click();

  const code = el('npCode');
  code.oninput = () => { el('npLangs').hidden = !code.value.trim(); };
  el('npLangs').onclick = e => {
    const b = e.target.closest('[data-lang]');
    if (!b) return;
    lang = lang === b.dataset.lang ? null : b.dataset.lang;
    el('npLangs').querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c.dataset.lang === lang));
  };

  el('npGo').onclick = async () => {
    const title = el('npTitle').value.trim();
    const body = el('npBody').value.trim();
    const snippet = code.value.trim();
    const err = el('npErr');
    err.hidden = true;
    if (!title) { err.textContent = 'Give it a title.'; err.hidden = false; return; }
    if (!body && !snippet) { err.textContent = 'Write something, or paste some code.'; err.hidden = false; return; }

    const go = el('npGo');
    go.disabled = true;
    go.textContent = 'Posting…';
    const bar = el('npBar');
    try {
      await createPost({
        title, body, code: snippet, lang: snippet ? lang : null, images,
        onProgress: f => { bar.hidden = false; bar.firstElementChild.style.width = (f * 100) + '%'; },
      });
      closeSheet();
      toast('Posted.');
    } catch (e) {
      err.textContent = e && e.code === 'permission-denied'
        ? "You don't have permission to post yet." : message(e);
      err.hidden = false;
      go.disabled = false;
      go.textContent = 'Post';
    }
  };
}

function composeVideo(kind) {
  const copy = kind === 'short'
    ? { h: 'New short', hint: 'Up to 60 seconds. Vertical works best.' }
    : { h: 'New video', hint: 'A full tutorial. Screen recordings work well.' };
  let chosen = null, duration = null;

  sheet(`
    <h2>${copy.h}</h2>
    <p class="note">${copy.hint}</p>
    <button class="pickfile" id="nvPick">Choose a video</button>
    <div id="nvPreview"></div>
    <input class="field" id="nvTitle" placeholder="Title" maxlength="120">
    <textarea class="field" id="nvDesc" placeholder="Description (optional)" maxlength="4000"></textarea>
    <p class="err" id="nvErr" hidden></p>
    <div class="bar" id="nvBar" hidden><i></i></div>
    <div class="row2">
      <button class="pill" data-close>Cancel</button>
      <button class="brand-btn" id="nvGo" style="width:auto;padding:0 22px;height:38px;font-size:14px">Publish</button>
    </div>`);

  const file = document.createElement('input');
  file.type = 'file';
  file.accept = 'video/*';
  file.onchange = () => {
    const f = file.files[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => {
      duration = probe.duration;
      // Checked here as well as in the app: a four-minute clip is not a short
      // no matter which side it was picked on.
      if (kind === 'short' && duration > SHORT_MAX + 0.5) {
        const err = el('nvErr');
        err.textContent = `That clip is ${clock(duration)}. Shorts can be up to 1:00.`;
        err.hidden = false;
        chosen = null;
        el('nvPreview').innerHTML = '';
        return;
      }
      el('nvErr').hidden = true;
      chosen = f;
      el('nvPreview').innerHTML = `<video src="${url}" controls playsinline
        style="width:100%;max-height:260px;border-radius:12px;background:#000;margin-bottom:11px"></video>
        <div class="who" style="color:var(--muted);margin-bottom:11px">${esc(f.name)} · ${clock(duration)}</div>`;
    };
    probe.src = url;
  };
  el('nvPick').onclick = () => file.click();

  el('nvGo').onclick = async () => {
    const title = el('nvTitle').value.trim();
    const err = el('nvErr');
    err.hidden = true;
    if (!chosen) { err.textContent = 'Choose a video first.'; err.hidden = false; return; }
    if (!title) { err.textContent = 'Give it a title.'; err.hidden = false; return; }

    const go = el('nvGo');
    go.disabled = true;
    go.textContent = 'Uploading…';
    const bar = el('nvBar');
    bar.hidden = false;
    try {
      await uploadVideo({
        file: chosen, kind, title, duration,
        description: el('nvDesc').value,
        onProgress: f => { bar.firstElementChild.style.width = (f * 100) + '%'; go.textContent = Math.round(f * 100) + '%'; },
      });
      closeSheet();
      toast(kind === 'short' ? 'Short posted.' : 'Video posted.');
    } catch (e) {
      err.textContent = message(e);
      err.hidden = false;
      go.disabled = false;
      go.textContent = 'Publish';
    }
  };
}

function confirmDelete(post) {
  const what = post.type === 'short' ? 'short' : post.type === 'video' ? 'video' : 'post';
  sheet(`
    <h2>Delete ${what}?</h2>
    <p class="note">“${esc(post.title)}” goes for good, along with its likes and comments.</p>
    <div class="row2">
      <button class="pill" data-close>Cancel</button>
      <button class="pill" id="delGo" style="color:var(--red);border-color:var(--red)">Delete</button>
    </div>`);
  el('delGo').onclick = async () => {
    el('delGo').disabled = true;
    try {
      await removePost(post);
      closeSheet();
      toast(what[0].toUpperCase() + what.slice(1) + ' deleted.');
      if (route().name === 'watch') location.hash = '#/you';
    } catch (e) {
      toast(message(e));
      el('delGo').disabled = false;
    }
  };
}

// A dropdown anchored under whatever was pressed, like the app's ••• menu.
//
// The button that opened it is remembered, because the very click that opens a
// menu carries on up to the document — where "a click outside closes the menu"
// would otherwise shut it again before anyone saw it.
let openMenu = null;
let menuOwner = null;
function menuAt(target, html, wire) {
  closeMenu();
  menuOwner = target;
  const m = document.createElement('div');
  m.className = 'menu';
  m.innerHTML = html;
  document.body.appendChild(m);
  const r = target.getBoundingClientRect();
  const w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px';
  m.style.top = (r.bottom + h > window.innerHeight ? r.top - h - 6 : r.bottom + 6) + 'px';
  openMenu = m;
  wire(m);
}
function closeMenu() {
  if (openMenu) { openMenu.remove(); openMenu = null; }
  menuOwner = null;
  document.querySelectorAll('.dots.open').forEach(d => d.classList.remove('open'));
}

// ---------------------------------------------------------------------------
// Signed out
// ---------------------------------------------------------------------------

/**
 * "Pick your username", with no way round it.
 *
 * The only other thing on the screen is signing out: an account without a name
 * is not one anybody can be shown as, so there is nothing else to do here.
 */
function paintName() {
  const suggestion = nameKey(
    (me.displayName || (me.email || '').split('@')[0] || '').slice(0, NAME_MAX));

  el('gate').innerHTML = `<div class="box">
    <span class="mark">${mark(62)}</span>
    <h1>Pick your username</h1>
    <p class="lede">This is how everyone sees you on Codera — on your posts, your
      comments and your page. Up to ${NAME_MAX} characters: letters, numbers and
      underscores. It cannot be taken by anyone else.</p>
    <div class="at">
      <span>@</span>
      <input class="field" id="nName" maxlength="${NAME_MAX}" autocomplete="username"
             spellcheck="false" autocapitalize="none" value="${esc(suggestion)}">
    </div>
    <p class="err" id="nErr" hidden></p>
    <p class="who" id="nFree"></p>
    <button class="brand-btn" id="nGo">Claim it</button>
    <p class="swap">Signed in as ${esc(me.email || '')}
      <button id="nOut">Sign out</button></p>
  </div>`;

  const box = el('nName');
  const err = el('nErr');
  const free = el('nFree');
  const go = el('nGo');

  const fail = m => { err.textContent = m; err.hidden = false; free.textContent = ''; };

  // Checked as it is typed, so nobody presses the button only to be told no.
  let timer = null;
  const look = () => {
    clearTimeout(timer);
    const key = nameKey(box.value);
    err.hidden = true;
    free.textContent = '';
    if (!key) return;
    if (!NAME_OK.test(key)) {
      return fail(key.length < 3
        ? 'At least 3 characters.'
        : 'Letters, numbers and underscores only.');
    }
    free.textContent = 'Checking…';
    timer = setTimeout(async () => {
      try {
        free.textContent = (await nameFree(key))
          ? '@' + key + ' is free'
          : '';
        if (!free.textContent) fail('@' + key + ' is taken. Try another.');
      } catch (e) { free.textContent = ''; }
    }, 350);
  };
  box.oninput = look;
  box.onkeydown = e => { if (e.key === 'Enter') go.click(); };
  box.focus();
  box.selectionStart = box.value.length;
  look();

  go.onclick = async () => {
    const key = nameKey(box.value);
    if (!NAME_OK.test(key)) {
      return fail(key.length < 3 ? 'At least 3 characters.'
        : 'Letters, numbers and underscores only.');
    }
    go.disabled = true;
    go.textContent = 'Claiming…';
    try {
      await claimUsername(key);
      toast('You are @' + key + '.');
      // The profile listener sees the name land and lets the app through.
    } catch (e) {
      fail(e && e.code === 'permission-denied'
        ? '@' + key + ' is taken. Try another.'
        : message(e));
      go.disabled = false;
      go.textContent = 'Claim it';
    }
  };

  el('nOut').onclick = () => { naming = false; signOut(auth); };
}

let gateMode = 'in';

// Codera is for people 13 and over (Community Standards). The date of birth is
// asked once, never stored and never sent anywhere — only whether it clears 13.
// A "no" is remembered on this browser so the form can't simply be tried again
// with a different year, which is what a neutral age screen has to do.
const MIN_AGE = 13;
const TOO_YOUNG = 'codera.tooYoung';

function yearsSince(dob) {
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const had = now.getMonth() > dob.getMonth()
    || (now.getMonth() === dob.getMonth() && now.getDate() >= dob.getDate());
  return had ? age : age - 1;
}

function turnedAway() {
  try { return localStorage.getItem(TOO_YOUNG) === '1'; } catch (e) { return false; }
}

function turnAway() {
  try { localStorage.setItem(TOO_YOUNG, '1'); } catch (e) { /* private window */ }
}

// The two sign-in buttons' own marks, drawn as their owners ask them to be.
const GOOGLE_G = '<svg viewBox="0 0 48 48" width="19" height="19" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.8-6.8C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.2 5.6c4.2-3.9 7.1-9.6 7.1-17z"/><path fill="#FBBC05" d="M10.6 28.6A14.6 14.6 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.7 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.2-5.6c-2 1.4-4.7 2.3-8.7 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>';
const GITHUB_CAT = '<svg viewBox="0 0 16 16" width="19" height="19" aria-hidden="true" fill="currentColor"><path d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.72 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 8 0z"/></svg>';

// Asks GitHub for the email address too, which Codera uses to tell accounts apart.
function githubProvider() {
  const p = new GithubAuthProvider();
  p.addScope('user:email');
  return p;
}

/**
 * Signs in through Google or GitHub, in a small window over the page. Where
 * the browser blocks that window, the whole page goes there and back instead.
 * A new account arrives without a username; the usual prompt asks for one.
 */
async function withProvider(provider, btn) {
  const err = el('gErr');
  err.hidden = true;
  btn.disabled = true;
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    btn.disabled = false;
    if (e.code === 'auth/popup-blocked') return signInWithRedirect(auth, provider);
    if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return;
    err.textContent = e.code === 'auth/account-exists-with-different-credential'
      ? 'You already have a Codera account with that email. Sign in the way you did before.'
      : message(e);
    err.hidden = false;
  }
}

function paintGate() {
  if (shutNow) return;
  const up = gateMode === 'up';
  el('gate').innerHTML = `<div class="box">
    <span class="mark">${mark(62)}</span>
    <h1>${up ? 'Make an account' : 'Welcome back'}</h1>
    <p class="lede">${up
      ? 'One account for the app and the site.'
      : 'Sign in with the same account you use in the Codera app.'}</p>
    ${up ? `<label class="dob">Date of birth
      <input class="field" id="gDob" type="date" max="${new Date().toISOString().slice(0, 10)}">
      <span class="dob-why">Codera is for 13 and over. All we keep is the day you turn 18 —
        not this date, and it never shows on your profile.</span></label>
      <div class="at"><span>@</span>
      <input class="field" id="gName" placeholder="username" autocomplete="username"
             maxlength="${NAME_MAX}" spellcheck="false" autocapitalize="none"></div>` : ''}
    <div class="oauth">
      <button class="oauth-btn" id="gGoogle">${GOOGLE_G}<span>Continue with Google</span></button>
      <button class="oauth-btn" id="gGithub">${GITHUB_CAT}<span>Continue with GitHub</span></button>
    </div>
    <div class="or"><span>or</span></div>
    <input class="field" id="gEmail" type="email" placeholder="Email" autocomplete="email">
    <input class="field" id="gPass" type="password" placeholder="Password"
           autocomplete="${up ? 'new-password' : 'current-password'}">
    <p class="err" id="gErr" hidden></p>
    <button class="brand-btn" id="gGo">${up ? 'Create account' : 'Sign in'}</button>
    <p class="legal">By continuing you agree to Codera’s <a href="/terms.html" target="_blank">Terms</a> and <a href="/privacy.html" target="_blank">Privacy Policy</a>.</p>
    <p class="swap">${up ? 'Already have an account?' : 'New to Codera?'}
      <button id="gSwap">${up ? 'Sign in' : 'Make one'}</button></p>
  </div>`;

  el('gSwap').onclick = () => { gateMode = up ? 'in' : 'up'; paintGate(); };
  el('gGoogle').onclick = () => withProvider(new GoogleAuthProvider(), el('gGoogle'));
  el('gGithub').onclick = () => withProvider(githubProvider(), el('gGithub'));
  el('gGo').onclick = submit;
  el('gate').querySelectorAll('.field').forEach(f => {
    f.onkeydown = e => { if (e.key === 'Enter') submit(); };
  });

  async function submit() {
    const err = el('gErr');
    const name = up ? el('gName').value.trim() : '';
    const email = el('gEmail').value.trim();
    const pass = el('gPass').value;
    const fail = m => { err.textContent = m; err.hidden = false; };
    err.hidden = true;

    let born = null;
    if (up) {
      if (turnedAway()) return fail('You need to be at least ' + MIN_AGE + ' to use Codera.');
      const dob = el('gDob').value;
      born = new Date(dob);
      if (!dob) return fail('Enter your date of birth.');
      const age = yearsSince(new Date(dob));
      if (!Number.isFinite(age) || age < 0 || age > 120) return fail('Check that date of birth.');
      if (age < MIN_AGE) {
        turnAway();
        return fail('Codera is for people ' + MIN_AGE + ' and over.');
      }
    }

    if (up && !NAME_OK.test(nameKey(name))) {
      return fail(nameKey(name).length < 3
        ? 'Pick a username of at least 3 characters.'
        : 'Usernames are letters, numbers and underscores, up to ' + NAME_MAX + '.');
    }
    if (!email) return fail('Enter your email.');
    // Eight rather than Firebase's six: the floor worth enforcing on an
    // account someone will keep.
    if (up && pass.length < 8) return fail('Use at least 8 characters.');
    if (!pass) return fail('Enter your password.');

    const go = el('gGo');
    go.disabled = true;
    go.textContent = up ? 'Creating…' : 'Signing in…';
    try {
      if (up) {
        // The account has to exist before the name can be claimed: claiming
        // writes to the database, and the database only listens to accounts.
        await createUserWithEmailAndPassword(auth, email, pass);
        // Their age travels with the account, so links open without asking again.
        try { await saveAge(born); } catch (e) { /* asked again when it matters */ }
        try {
          await claimUsername(name);
        } catch (e) {
          // Taken in the meantime, or refused. The account is real, so the
          // unskippable prompt picks it up from here.
          toast('Pick another username.');
        }
      } else {
        await signInWithEmailAndPassword(auth, email, pass);
      }
    } catch (e) {
      fail(message(e));
      go.disabled = false;
      go.textContent = up ? 'Create account' : 'Sign in';
    }
  }
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Where Codera is open
// ---------------------------------------------------------------------------
// Australia set a minimum age of 16 for social platforms in December 2025, and
// the platform carries the penalty, not the person who signed up. Whether a
// place for learning to code is caught by that at all turns on an exemption we
// have not had ruled on yet, and the downside of guessing wrong is roughly
// AU$49.5m. So Codera stays out until someone qualified says otherwise.
//
// This is worked out from the clock and the language the browser is set to,
// which is a guess, not a border: a VPN or a changed timezone walks straight
// through it. It is honest about what it is — a closed door, not a wall — and
// if the answer comes back that Codera is in scope, this has to become a real
// check against the address the request came from.
const SHUT = {
  AU: {
    where: 'Australia',
    zones: /^Australia\//i,
    tags: /-AU$/i,
  },
};

// The clock only. The language a browser is set to was in here too and it
// was wrong: an Australian living anywhere else still has en-AU, and would be
// shut out of a country they are not in. What someone's language says about
// them is who they are, not where they are.
function shutHere() {
  let zone = '';
  try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* older browser */ }
  for (const code of Object.keys(SHUT)) {
    if (SHUT[code].zones.test(zone)) return SHUT[code];
  }
  return null;
}

const NO_ENTRY = () => svg('<circle cx="12" cy="12" r="8.6" stroke-width="1.7"/>'
  + '<path d="M6.1 17.9 17.9 6.1" stroke-width="1.7"/>');

/** Takes the whole page. There is nothing to browse underneath it. */
function showShut(rule) {
  document.title = 'Codera isn\u2019t open in ' + rule.where;
  // Put out of sight rather than taken out: .splash sets its own display, so
  // the hidden attribute alone would leave it sitting over this page unseen —
  // but the wiring just below still writes a logo into it, so it has to stay.
  const splash = el('splash');
  if (splash) splash.style.display = 'none';
  // A class on the root, not the hidden attribute: every one of these sets
  // its own display in the stylesheet, and a stylesheet beats [hidden]. That
  // is how the top bar — with search and Create on it — stayed on screen.
  document.documentElement.classList.add('shut-here');
  for (const id of ['top', 'rail', 'drawer', 'bottom', 'scrim', 'gate']) {
    const part = document.getElementById(id);
    if (part) part.hidden = true;
  }
  const main = el('main');
  main.hidden = false;
  main.innerHTML = '<div class="shut">'
    + '<span class="shut-ico">' + NO_ENTRY() + '</span>'
    + '<h1>Codera isn\u2019t open in ' + esc(rule.where) + '</h1>'
    + '<p>New online safety rules there set a minimum age of 16 for social '
    + 'platforms. Codera is a place for learning to code, which may well sit '
    + 'outside those rules \u2014 but we would rather be shut for a while than '
    + 'be open and wrong about a rule written to keep children safe.</p>'
    + '<p>We are getting proper advice on it. If it says we are clear, this '
    + 'page goes away and nothing of yours is lost.</p>'
    + '<p class="shut-small">Think this is a mistake? Your browser says you are '
    + 'in ' + esc(rule.where) + '. <a href="/community.html">Community Standards</a> '
    + '\u00b7 <a href="/privacy.html">Privacy</a> \u00b7 <a href="/terms.html">Terms</a></p>'
    + '</div>';
}
var shutNow = shutHere();
if (shutNow) showShut(shutNow);

// Asked fresh every time, with the moment in the address and no-store on top.
// A cached answer to "where are you" is worse than none: it kept someone shut
// out for an hour after they turned a VPN off, which is exactly how this was
// found.
//
// The clock is a declaration; the address is evidence. Either one closing the
// door is enough — the clock catches an address we can't place, and the
// address catches someone who changed their clock. Asked after the page is
// already up, so a slow answer never holds the site back; it shuts a moment
// later if it has to.
fetch('https://us-central1-codera-46b86.cloudfunctions.net/whereAmI?t=' + Date.now(), { cache: 'no-store' })
  .then(r => r.json())
  .then(said => {
    if (said.shut && !shutNow) {
      shutNow = SHUT.AU;
      showShut(shutNow);
    }
  })
  .catch(() => { /* offline, or blocked: the clock check still stands */ });

el('brandMark').innerHTML = mark(30);
el('splashMark').innerHTML = mark(78);
applyTheme();

el('themeBtn').onclick = () => {
  theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
  localStorage.setItem('codera.theme', theme);
  applyTheme();
};

el('menuBtn').onclick = () => {
  if (navMode() === 'full' || (window.innerWidth >= 1300)) {
    wantFull = !wantFull;
    localStorage.setItem('codera.nav', wantFull ? 'full' : 'rail');
    overlay = false;
  } else {
    overlay = !overlay;
  }
  paintNav();
  layout();
};

el('scrim').onclick = () => { overlay = false; layout(); };
el('createBtn').onclick = () => openCreate();

el('meBtn').onclick = e => {
  const u = auth.currentUser;
  menuAt(e.currentTarget, `
    <div class="who2"><b>@${esc(profile.username || u.displayName || 'you')}</b>
      ${plus.active ? '<span>Codera Plus</span>' : ''}</div>
    <button data-go="#/you">${I.person()}Your posts</button>
    <button data-go="#/plus">${I.sparkle()}Codera Plus</button>
    <button class="danger" data-out>Sign out</button>`,
    m => {
      m.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { location.hash = b.dataset.go; closeMenu(); });
      m.querySelector('[data-out]').onclick = () => { closeMenu(); signOut(auth); };
    });
};

el('searchForm').onsubmit = e => {
  e.preventDefault();
  const q = el('searchInput').value.trim();
  document.body.classList.remove('searching');
  location.hash = q ? '#/search/' + encodeURIComponent(q) : '#/';
};
el('searchOpen').onclick = () => {
  document.body.classList.add('searching');
  el('searchInput').focus();
};
el('searchInput').onblur = () => setTimeout(() => document.body.classList.remove('searching'), 120);

// One listener for the whole page: cards, menus and sheets are all rebuilt
// often, and re-attaching handlers to each would be a leak waiting to happen.
document.addEventListener('click', e => {
  const t = e.target;

  if (openMenu && !t.closest('.menu') && !(menuOwner && menuOwner.contains(t))) closeMenu();
  if (t.closest('[data-close]')) { closeSheet(); return; }

  // Inside the phone app, a person opens in the app's own page for them, and leaving
  // the live pages closes the screen rather than wandering off into the site.
  if (APP_MODE) {
    const person = t.closest('a.to-user');
    if (person) { e.preventDefault(); toApp({ type: 'user', uid: person.dataset.uid }); return; }
    if (t.closest('[data-leave]')) { e.preventDefault(); toApp({ type: 'done' }); return; }
  }

  // A name or picture that leads to someone's page goes there, not into the post.
  if (t.closest('a.to-user')) return;

  const fol = t.closest('[data-follow]');
  if (fol) { e.preventDefault(); toggleFollow(fol.dataset.follow); return; }

  const so = t.closest('[data-stream-open]');
  if (so) { location.hash = '#/stream/' + so.dataset.streamOpen; return; }

  const uf = t.closest('[data-ufilter]');
  if (uf) { userFilter = uf.dataset.ufilter; render(true); return; }

  // Picking a page from the overlaid sidebar puts it away again, even when the
  // page picked is the one already open and no route change follows.
  const nav = t.closest('.drawer .nav-item, .bottom .nav-item');
  if (nav && navMode() !== 'full' && overlay) { overlay = false; layout(); }

  const create = t.closest('[data-act="create"]');
  if (create) { overlay = false; layout(); openCreate(); return; }

  const kind = t.closest('[data-new]');
  if (kind) {
    closeSheet();
    if (kind.dataset.new === 'post') composePost();
    else if (kind.dataset.new === 'live') location.hash = '#/golive';
    else composeVideo(kind.dataset.new);
    return;
  }

  const dots = t.closest('[data-menu]');
  if (dots) {
    e.stopPropagation();
    const p = byId(dots.dataset.menu);
    if (!p) return;
    dots.classList.add('open');
    const what = p.type === 'short' ? 'short' : p.type === 'video' ? 'video' : 'post';
    menuAt(dots, `<button class="danger" data-del2>${I.trash()}Delete ${what}</button>
                  <button data-cancel>Cancel</button>`,
      m => {
        m.querySelector('[data-del2]').onclick = () => { closeMenu(); confirmDelete(p); };
        m.querySelector('[data-cancel]').onclick = closeMenu;
      });
    return;
  }

  const filter = t.closest('[data-filter]');
  if (filter) { homeFilter = filter.dataset.filter; render(true); return; }

  const you = t.closest('[data-you]');
  if (you) { youFilter = you.dataset.you; render(true); return; }

  const v = t.closest('[data-vote]');
  if (v) { vote(route().arg, Number(v.dataset.vote)).catch(err => toast(message(err))); return; }

  const sv = t.closest('[data-svote]');
  if (sv) { vote(sv.dataset.id, Number(sv.dataset.svote)).catch(err => toast(message(err))); return; }

  const del = t.closest('[data-del]');
  if (del) { const p = byId(del.dataset.del); if (p) confirmDelete(p); return; }

  const cdel = t.closest('[data-cdel]');
  if (cdel) { deleteComment(route().arg, cdel.dataset.cdel).catch(err => toast(message(err))); return; }

  if (t.closest('#cSend')) {
    const box = el('cText');
    const text = box.value.trim();
    if (!text) return;
    const post = byId(route().arg);
    const problem = contactProblem(text, !!(me && post && post.uid === me.uid));
    if (problem) { toast(problem); return; }
    box.value = '';
    addComment(route().arg, text).catch(err => { box.value = text; toast(message(err)); });
    return;
  }

  // A picture opens itself rather than the post it is on.
  const tile = t.closest('[data-pic]');
  if (tile) {
    e.preventDefault();
    e.stopPropagation();
    const holder = tile.closest('[data-pics]');
    try {
      openPics(JSON.parse(holder.dataset.pics), Number(tile.dataset.pic));
    } catch (err) { /* nothing to open */ }
    return;
  }

  const open = t.closest('[data-open]');
  if (open && !t.closest('[data-menu]')) {
    const p = byId(open.dataset.open);
    // A short opens in the shorts feed, scrolled to itself — the same place
    // it lives in the app.
    location.hash = p && p.type === 'short' ? '#/shorts/' + p.id : '#/watch/' + open.dataset.open;
  }
});

// Hovering a thumbnail previews it, muted, the way a video site does.
document.addEventListener('mouseover', e => {
  const th = e.target.closest('.thumb');
  if (!th) return;
  const v = th.querySelector('video');
  if (v && v.paused) v.play().catch(() => {});
});
document.addEventListener('mouseout', e => {
  const th = e.target.closest('.thumb');
  if (!th) return;
  const v = th.querySelector('video');
  if (v) {
    v.pause();
    const d = v.duration;
    try { v.currentTime = d && isFinite(d) ? Math.min(3, d * 0.25) : 0.1; } catch (err) {}
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeMenu(); closeSheet(); if (overlay) { overlay = false; layout(); } }
  // "/" jumps to the search box, as it does on every site that has one.
  if (e.key === '/' && !/input|textarea/i.test(document.activeElement.tagName)) {
    e.preventDefault();
    document.body.classList.add('searching');
    el('searchInput').focus();
  }
});

window.addEventListener('hashchange', () => { closeMenu(); render(); });
window.addEventListener('resize', () => { layout(); });

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

onAuthStateChanged(auth, u => {
  me = u;
  const inApp = !!u;

  showApp(inApp);
  el('gate').hidden = inApp;
  if (!inApp) {
    dropView();
    if (unsubPosts) { unsubPosts(); unsubPosts = null; }
    if (unsubPlus) { unsubPlus(); unsubPlus = null; }
    if (unsubProfile) { unsubProfile(); unsubProfile = null; }
    if (unsubFollows) { unsubFollows(); unsubFollows = null; }
    if (unsubStreams) { unsubStreams(); unsubStreams = null; }
    if (unsubTaste) { unsubTaste(); unsubTaste = null; }
    if (studio) endLive();
    following = new Set();
    streams = [];
    streamsKey = '';
    taste = {};
    tasteReady = false;
    tastePending = [];
    profile = {};
    profileReady = false;
    faces.clear();
    naming = false;
    posts = [];
    postsReady = false;
    painted = null;
    if (unsubBlocks) { unsubBlocks(); unsubBlocks = null; }
    if (unsubAge) { unsubAge(); unsubAge = null; }
    adultAt = null;
    blocked = new Set();
    paintGate();
  } else {
    if (!unsubPosts) watchData();
    if (!unsubBlocks) unsubBlocks = watchBlocks(me.uid);
    if (!unsubAge) unsubAge = watchAge(me.uid);
    stamp(me.uid);
    paintMe();
    // The frame stays up while the profile is read back; if there is no
    // username on it, checkUsername takes the screen over from there.
    render(true);
  }

  // The splash lifts once there is something real underneath it.
  const splash = el('splash');
  if (!splash.classList.contains('gone')) {
    setTimeout(() => {
      splash.classList.add('gone');
      setTimeout(() => { splash.hidden = true; }, 400);
    }, 260);
  }
});
