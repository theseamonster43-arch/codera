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
} from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js';
import {
  getFirestore, collection, addDoc, deleteDoc, doc, getDoc, onSnapshot, query,
  orderBy, limit, serverTimestamp, runTransaction, increment, updateDoc, setDoc,
} from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js';
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
  return map[e && e.code] || 'Something went wrong. Try again.';
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
  { to: '#/followed', icon: 'followed', label: 'Followed' },
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
const teardown = [];           // listeners belonging to whatever is on screen

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

function watchData() {
  unsubPosts = onSnapshot(
    query(collection(db, POSTS), orderBy('createdAt', 'desc'), limit(150)),
    snap => {
      posts = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
      postsReady = true;
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
    // Nobody gets past this without a name to be known by.
    if (checkUsername()) return;
    if (route().name === 'you') render(true);
  }, () => {
    // Left as it was. Wiping it here is what made a banner vanish on its own
    // whenever the listener hiccupped.
  });
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

async function createPost({ title, body, code, lang, image, onProgress }) {
  const who = author();
  let imageUrl = null, imagePath = null;
  if (image) {
    // The picture goes up first: a post is never written pointing at a file
    // that failed to upload.
    const ext = (image.type && image.type.split('/')[1]) || 'jpg';
    imagePath = 'images/' + who.uid + '/' + Date.now() + '.' + ext;
    imageUrl = await uploadTo(imagePath, image, onProgress);
  }
  return addDoc(collection(db, POSTS), Object.assign({}, who, {
    type: 'post',
    title: title.trim(),
    body: (body || '').trim(),
    code: (code || '').replace(/\s+$/, ''),
    lang: lang || null,
    imageUrl, imagePath,
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
  if (post.imagePath) { try { await deleteObject(ref(storage, post.imagePath)); } catch (e) {} }
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
 * the totals on a post can never drift from the votes behind them.
 */
async function vote(postId, want) {
  const u = auth.currentUser;
  if (!u) return;
  await runTransaction(db, async tx => {
    const mine = await tx.get(voteRef(postId, u.uid));
    const had = mine.exists() ? mine.get('v') || 0 : 0;
    const now = had === want ? 0 : want;
    if (now === had) return;

    const d = { likeCount: 0, dislikeCount: 0 };
    if (had === 1) d.likeCount -= 1;
    if (had === -1) d.dislikeCount -= 1;
    if (now === 1) d.likeCount += 1;
    if (now === -1) d.dislikeCount += 1;

    if (now === 0) tx.delete(voteRef(postId, u.uid));
    else tx.set(voteRef(postId, u.uid), { v: now, uid: u.uid, at: serverTimestamp() });

    tx.update(doc(db, POSTS, postId), {
      likeCount: increment(d.likeCount),
      dislikeCount: increment(d.dislikeCount),
    });
  });
}

function watchMyVote(postId, onChange) {
  const u = auth.currentUser;
  if (!u) { onChange(0); return () => {}; }
  return onSnapshot(voteRef(postId, u.uid),
    snap => onChange(snap.exists() ? snap.get('v') || 0 : 0),
    () => onChange(0));
}

async function addComment(postId, text) {
  const who = author();
  const body = text.trim();
  if (!body) return;
  await addDoc(collection(db, POSTS, postId, 'comments'), Object.assign({}, who, {
    text: body.slice(0, 1000),
    createdAt: serverTimestamp(),
  }));
  await updateDoc(doc(db, POSTS, postId), { commentCount: increment(1) });
}

async function deleteComment(postId, id) {
  await deleteDoc(doc(db, POSTS, postId, 'comments', id));
  await updateDoc(doc(db, POSTS, postId), { commentCount: increment(-1) });
}

// ---------------------------------------------------------------------------
// Pieces of page
// ---------------------------------------------------------------------------

const byId = id => posts.find(p => p.id === id);
const isVideo = p => p.type === 'video' || p.type === 'short';

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
 * A thumbnail for a video or short.
 *
 * The video element is its own poster: asking for a moment just past the start
 * makes the browser decode one frame, which saves storing a second file for
 * every upload. Hovering plays it muted, the way a preview does.
 */
function thumb(p, tall) {
  const time = p.videoUrl ? esc(p.videoUrl) + '#t=0.1' : '';
  const badge = p.type === 'short'
    ? '<span class="badge left">SHORT</span>'
    : (p.duration ? `<span class="badge">${clock(p.duration)}</span>` : '');
  return `<div class="thumb${tall ? ' tall' : ''}">
    <video src="${time}" preload="metadata" muted playsinline disablepictureinpicture></video>
    ${badge}
  </div>`;
}

function cardVideo(p, opts) {
  const mine = me && p.uid === me.uid;
  return `<article class="card" data-open="${p.id}">
    ${thumb(p, p.type === 'short')}
    <div class="card-body">
      ${avatar(p)}
      <div style="min-width:0">
        <h3>${esc(p.title)}</h3>
        <div class="who">${esc(p.authorName)}</div>
        <div class="who">${plural(p.likeCount, 'like')} · ${ago(p.createdAt)}</div>
      </div>
      ${mine && opts && opts.own ? `<button class="dots" data-menu="${p.id}">${I.dots()}</button>` : ''}
    </div>
  </article>`;
}

function cardPost(p, opts) {
  const mine = me && p.uid === me.uid;
  return `<article class="pcard" data-open="${p.id}">
    <div class="card-body" style="padding:0">
      ${avatar(p, 30)}
      <div style="min-width:0;flex:1">
        <div class="who">${esc(p.authorName)} · ${ago(p.createdAt)}</div>
        <h3>${esc(p.title)}</h3>
      </div>
      ${mine && opts && opts.own ? `<button class="dots" data-menu="${p.id}">${I.dots()}</button>` : ''}
    </div>
    ${p.imageUrl ? `<img class="pic" src="${esc(p.imageUrl)}" alt="" loading="lazy">` : ''}
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
const KEEPS = new Set(['watch', 'shorts']);
let painted = null;

function render(force) {
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
  }[r.name] || pageHome;

  page(main, r.arg);
  stagger(main);
  posterFrames(main);
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

function pageHome(main) {
  document.title = 'Codera';
  if (!postsReady) { main.innerHTML = `<div class="page">${skeletons(8)}</div>`; return; }

  const shorts = posts.filter(p => p.type === 'short');
  const rest = posts.filter(p => p.type !== 'short');
  const list = homeFilter === 'all' ? rest
    : posts.filter(p => p.type === homeFilter);

  const chips = FILTERS.map(f =>
    `<button class="chip${homeFilter === f.id ? ' on' : ''}" data-filter="${f.id}">${f.label}</button>`).join('');

  const shelf = homeFilter === 'all' && shorts.length
    ? `<h2 class="sub">${I.shorts()} Shorts</h2>
       <div class="shelf">${shorts.slice(0, 12).map(p => cardVideo(p)).join('')}</div>`
    : '';

  main.innerHTML = `<div class="page">
    <div class="chips">${chips}</div>
    ${shelf}
    ${list.length
      ? `<h2 class="sub">${homeFilter === 'all' ? 'Latest' : FILTERS.find(f => f.id === homeFilter).label}</h2>
         <div class="grid">${list.map(p => card(p)).join('')}</div>`
      : empty('code', 'Nothing here yet',
              'Post something, or open the app and upload a tutorial — it turns up here straight away.')}
  </div>`;
}

function pageSearch(main, q) {
  document.title = q ? q + ' — Codera' : 'Search — Codera';
  const needle = q.toLowerCase();
  const hits = posts.filter(p =>
    [p.title, p.body, p.code, p.authorName, p.lang].some(v => v && String(v).toLowerCase().includes(needle)));

  main.innerHTML = `<div class="page">
    <h1 class="title">${hits.length} result${hits.length === 1 ? '' : 's'} for “${esc(q)}”</h1>
    ${hits.length
      ? `<div class="grid">${hits.map(p => card(p)).join('')}</div>`
      : empty('code', 'Nothing matched', 'Try a shorter word, or the name of whoever posted it.')}
  </div>`;
}

// ---------------------------------------------------------------------------
// Watching one post
// ---------------------------------------------------------------------------

function pageWatch(main, id) {
  const p = byId(id);
  if (!p) {
    main.innerHTML = postsReady
      ? `<div class="page">${empty('code', 'That post is gone', 'It may have been deleted by whoever posted it.')}</div>`
      : `<div class="page">${spinner()}</div>`;
    return;
  }
  document.title = p.title + ' — Codera';

  const next = posts.filter(o => o.id !== p.id).slice(0, 20);
  const mine = me && p.uid === me.uid;

  main.innerHTML = `<div class="page">
    <div class="watch">
      <div>
        ${isVideo(p)
          ? playerHTML(p.videoUrl, {})
          : (p.imageUrl ? `<div class="player"><img src="${esc(p.imageUrl)}" alt="" style="width:100%;display:block"></div>` : '')}
        <h1>${esc(p.title)}</h1>
        <div class="byline">
          ${avatar(p, 40)}
          <div>
            <div class="name">${esc(p.authorName)}</div>
            <div class="when">${ago(p.createdAt)}${p.type === 'short' ? ' · Short' : ''}</div>
          </div>
          <div class="acts">
            <button class="act" data-vote="1" id="upBtn">${I.up()}<span id="upN">${compact(p.likeCount || 0)}</span></button>
            <button class="act" data-vote="-1" id="downBtn">${I.down()}<span id="downN">${compact(p.dislikeCount || 0)}</span></button>
            ${mine ? `<button class="act danger" data-del="${p.id}">${I.trash()}<span>Delete</span></button>` : ''}
          </div>
        </div>

        ${p.body || p.code || p.description ? `<div class="panel">
          ${p.lang ? `<div class="lang">${esc(p.lang)}</div>` : ''}
          ${p.description ? `<div class="text">${esc(p.description)}</div>` : ''}
          ${p.body ? `<div class="text">${esc(p.body)}</div>` : ''}
          ${p.code ? `<pre class="code" style="margin-top:12px">${esc(p.code)}</pre>` : ''}
        </div>` : ''}

        <h2 class="sub" id="cN">${plural(p.commentCount, 'comment')}</h2>
        <div class="cbox">
          ${avatar({ authorName: me.displayName || me.email, authorPhoto: me.photoURL }, 36)}
          <textarea id="cText" placeholder="Add a comment" maxlength="1000"></textarea>
          <button class="pill" id="cSend" style="height:42px">Comment</button>
        </div>
        <div id="cList">${spinner()}</div>
      </div>

      <aside>
        <h2 class="sub" style="margin-top:0">Up next</h2>
        <div class="next">${next.map(o => `
          <div class="row" data-open="${o.id}">
            ${isVideo(o) ? thumb(o) : `<div class="thumb" style="display:grid;place-items:center;background:var(--bg3);color:var(--muted)">${I.code()}</div>`}
            <div style="min-width:0">
              <h4>${esc(o.title)}</h4>
              <div class="who">${esc(o.authorName)}</div>
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

  // My own vote, live, so the thumbs show what I already pressed.
  teardown.push(watchMyVote(p.id, v => {
    const up = el('upBtn'), down = el('downBtn');
    if (!up || !down) return;
    up.classList.toggle('on', v === 1);
    down.classList.toggle('on', v === -1);
    down.classList.toggle('down', v === -1);
    up.querySelector('svg').outerHTML = I.up(v === 1);
    down.querySelector('svg').outerHTML = I.down(v === -1);
  }));

  teardown.push(onSnapshot(
    query(collection(db, POSTS, p.id, 'comments'), orderBy('createdAt', 'asc'), limit(200)),
    snap => {
      const list = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
      const box = el('cList');
      if (!box) return;
      box.innerHTML = list.length ? list.map(c => `
        <div class="comment">
          ${avatar(c, 34)}
          <div style="flex:1;min-width:0">
            <div class="line"><b>${esc(c.authorName)}</b>${ago(c.createdAt)}</div>
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
            <span>${esc(p.authorName)} · ${ago(p.createdAt)}</span>
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

function pageFollowed(main) {
  document.title = 'Followed — Codera';
  main.innerHTML = `<div class="page narrow">
    <h1 class="title">Followed</h1>
    ${empty('followed', 'Not following anyone yet',
            'Follow a creator and their new tutorials land here first.')}
  </div>`;
}

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
           <button class="pill ghost2" id="bioBtn">Edit description</button>`
        : `<button class="pill ghost2" id="bioBtn">Add a description</button>`}
    </div>

    <div class="chips">${CHOICES.map(c =>
      `<button class="chip${youFilter === c.id ? ' on' : ''}" data-you="${c.id}">${c.label}<span class="n">${c.n}</span></button>`).join('')}</div>
    ${shown.length
      ? `<div class="grid">${shown.map(p => card(p, { own: true })).join('')}</div>`
      : empty('person', 'Nothing here yet', none)}
  </div>`;

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
  const note = plus.cancelled ? `Plus stays until ${date}. Resume any time before then.`
    : plus.active ? `Renews ${date}.`
    : 'Renews monthly. Cancel anytime.';

  const label = plus.cancelled ? 'Resume Plus'
    : plus.active ? 'Cancel Plus'
    : `Subscribe for ${PLUS_PRICE}/month`;

  main.innerHTML = `<div class="page narrow">
    <div class="plus-wrap"><div class="plus-in">
      <div class="orb">${I.sparkle()}</div>
      <h1>Codera <em>Plus</em></h1>
      <p class="lede">Support Codera, lose the ads, and get every perk the moment it exists.</p>

      <div class="plan"><div class="plan-in">
        <div class="price"><b>${PLUS_PRICE}</b><span>/ month</span></div>
        ${PERKS.map(([t, b]) => `<div class="perk">
          <span class="tick">${I.check()}</span>
          <span><b>${t}</b><span>${b}</span></span>
        </div>`).join('')}
        <button class="brand-btn" id="plusBtn" ${plus.loading ? 'disabled' : ''}>
          ${plus.loading ? 'Checking…' : label}
        </button>
        <p class="plus-note">${note}</p>

        
      </div></div>

      <div class="paybox" id="payBox" hidden>
        <div class="payside">
          <div class="payhead">
            <b>Codera Plus</b>
            <button class="pill" id="payBack">Back</button>
          </div>
          <div class="payprice"><b>$10</b><span>/ month</span></div>
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

  const btn = el('plusBtn');
  btn.onclick = async () => {
    btn.disabled = true;
    btn.textContent = 'Working…';
    try {
      if (plus.active && !plus.cancelled) {
        await httpsCallable(fns, 'plusCancel')();
        toast('Plus will not renew.');
      } else if (plus.cancelled) {
        await httpsCallable(fns, 'plusResume')();
        toast('Plus will renew after all.');
      } else {
        await openPayment();
        return;                       // the form is up; the button stays put
      }
    } catch (e) {
      toast(message(e));
    }
    btn.disabled = false;
    btn.textContent = label;
  };

  /**
   * Stripe's form, mounted inside this page rather than on stripe.com.
   *
   * The card is still typed into Stripe's own frame — that is what keeps card
   * numbers out of Codera entirely — but everything around it is ours.
   */
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
   * Codera's own payment form.
   *
   * The fields are Stripe's — a card number must never touch anything of ours —
   * but their look is entirely ours: the app's colours, Scoutie Sans, and the
   * brand gradient on the button. Stripe calls this the Payment Element.
   */
  async function openPayment() {
    try { await ensureStripe(); } catch (e) {}
    if (!window.Stripe) { toast("Couldn't load the payment form. Check any ad blocker."); return; }

    const res = await httpsCallable(fns, 'plusIntent')();
    const { clientSecret, livemode } = (res && res.data) || {};
    if (!clientSecret) throw new Error('no secret');

    const pk = livemode ? STRIPE_PK.live : STRIPE_PK.test;
    if (!pk) { toast('No payment key for this mode.'); return; }

    const box = el('payBox');
    box.hidden = false;
    document.querySelector('.plus-in').classList.add('paying');
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
      clientSecret,
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
          '.Input': {
            border: '1px solid ' + v('--border'),
            boxShadow: 'none',
            padding: '12px 13px',
          },
          '.Input:focus': {
            border: '1px solid ' + (v('--blue') || '#3b82f6'),
            boxShadow: 'none',
          },
          '.Label': { fontWeight: '700', marginBottom: '6px' },
          '.Tab': { border: '1px solid ' + v('--border'), boxShadow: 'none' },
          '.Tab--selected': { borderColor: v('--blue') || '#3b82f6' },
        },
      },
    });

    const wallets = elements.create('expressCheckout', {
      buttonHeight: 46,
      buttonTheme: { applePay: dark ? 'white' : 'black', googlePay: dark ? 'white' : 'black' },
    });
    wallets.mount('#payExpress');

    // Nothing is drawn on a machine with no wallet set up, so the divider only
    // appears once Stripe says there is something above it.
    wallets.on('ready', e => {
      const has = e && e.availablePaymentMethods
        && Object.values(e.availablePaymentMethods).some(Boolean);
      el('payOr').hidden = !has;
    });
    wallets.on('confirm', () => finish());

    const payment = elements.create('payment', {
      layout: { type: 'accordion', defaultCollapsed: false, radios: false, spacedAccordionItems: true },
      fields: { billingDetails: { address: { country: 'auto', postalCode: 'auto' } } },
    });
    payment.mount('#payMount');

    const go = el('payGo');
    const err = el('payErr');
    go.hidden = false;

    /** Confirms whatever the person chose — a wallet or the card fields. */
    async function finish() {
      err.hidden = true;
      go.disabled = true;
      go.textContent = 'Paying…';

      // redirect: 'if_required' keeps everyone on this page except the few
      // whose bank insists on its own screen for 3-D Secure.
      const out = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: location.origin + '/#/plus' },
        redirect: 'if_required',
      });

      if (out.error) {
        // A declined card or a wrong number: say what Stripe said, since it is
        // written for the person holding the card.
        err.textContent = out.error.message || 'That payment did not go through.';
        err.hidden = false;
        go.disabled = false;
        go.textContent = 'Subscribe for $10/month';
        return;
      }

      const status = out.paymentIntent && out.paymentIntent.status;
      if (status === 'succeeded' || status === 'processing') {
        el('payNote').textContent = 'Payment received. Switching Plus on…';
        go.textContent = 'Done';
        payOpen = false;
        setTimeout(() => render(true), 2500);
      } else {
        err.textContent = 'That payment is still pending. Give it a moment.';
        err.hidden = false;
        go.disabled = false;
        go.textContent = 'Subscribe for $10/month';
      }
    }

    go.onclick = finish;

    const close = () => {
      try { payment.destroy(); wallets.destroy(); } catch (e) {}
      payOpen = false;
      render(true);
    };
    el('payBack').onclick = close;
    teardown.push(() => { try { payment.destroy(); } catch (e) {} payOpen = false; });
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
    </div>
    <div class="row2"><button class="pill" data-close>Cancel</button></div>`);
}

const LANGS = ['JavaScript', 'Python', 'TypeScript', 'Java', 'C++', 'Go', 'Rust', 'Other'];

function composePost() {
  let image = null;
  let lang = null;

  sheet(`
    <h2>New post</h2>
    <p class="note">A title and either words or code.</p>
    <input class="field" id="npTitle" placeholder="Title" maxlength="120">
    <textarea class="field" id="npBody" placeholder="What did you learn, build or break?" maxlength="4000"></textarea>
    <button class="pickfile" id="npPick">Add a picture</button>
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
  file.onchange = () => {
    const f = file.files[0];
    if (!f) return;
    image = f;
    el('npPreview').innerHTML = `<img src="${URL.createObjectURL(f)}" alt=""
      style="width:100%;max-height:220px;object-fit:cover;border-radius:12px;margin-bottom:11px">
      <button class="pill" id="npDrop" style="margin-bottom:11px">Remove picture</button>`;
    el('npDrop').onclick = () => { image = null; el('npPreview').innerHTML = ''; };
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
        title, body, code: snippet, lang: snippet ? lang : null, image,
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

function paintGate() {
  const up = gateMode === 'up';
  el('gate').innerHTML = `<div class="box">
    <span class="mark">${mark(62)}</span>
    <h1>${up ? 'Make an account' : 'Welcome back'}</h1>
    <p class="lede">${up
      ? 'One account for the app and the site.'
      : 'Sign in with the same account you use in the Codera app.'}</p>
    ${up ? `<div class="at"><span>@</span>
      <input class="field" id="gName" placeholder="username" autocomplete="username"
             maxlength="${NAME_MAX}" spellcheck="false" autocapitalize="none"></div>` : ''}
    <input class="field" id="gEmail" type="email" placeholder="Email" autocomplete="email">
    <input class="field" id="gPass" type="password" placeholder="Password"
           autocomplete="${up ? 'new-password' : 'current-password'}">
    <p class="err" id="gErr" hidden></p>
    <button class="brand-btn" id="gGo">${up ? 'Create account' : 'Sign in'}</button>
    <p class="swap">${up ? 'Already have an account?' : 'New to Codera?'}
      <button id="gSwap">${up ? 'Sign in' : 'Make one'}</button></p>
  </div>`;

  el('gSwap').onclick = () => { gateMode = up ? 'in' : 'up'; paintGate(); };
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
    box.value = '';
    addComment(route().arg, text).catch(err => { box.value = text; toast(message(err)); });
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
    profile = {};
    profileReady = false;
    naming = false;
    posts = [];
    postsReady = false;
    painted = null;
    paintGate();
  } else {
    if (!unsubPosts) watchData();
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
