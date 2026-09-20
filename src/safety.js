import {
  collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, where,
} from 'firebase/firestore';

import { auth, db } from './firebase';
import { shared } from './social';

/**
 * The things that keep Codera from being somewhere a child gets hurt: who you
 * have blocked, reporting, what can't be said in a comment, and the age behind
 * the links on a profile.
 *
 * Every rule here is the same rule as the website's (web/app.js) — the same
 * host lists, the same wording, the same collections — because a rule that
 * only holds on one client isn't a rule, it's a detour.
 */

// ---- people you've blocked ---------------------------------------------------------

/** The uids this account has blocked, as a Set. */
export const useBlocked = shared((me, emit) => onSnapshot(
  query(collection(db, 'blocks'), where('from', '==', me)),
  snap => emit(new Set(snap.docs.map(d => d.get('to')))),
  () => {},
), new Set());

export async function toggleBlock(uid, blockedNow) {
  const me = auth.currentUser?.uid;
  if (!me || !uid || me === uid) return;
  const id = me + '_' + uid;
  if (blockedNow) {
    await deleteDoc(doc(db, 'blocks', id));
    return;
  }
  await setDoc(doc(db, 'blocks', id), { from: me, to: uid, at: serverTimestamp() });
}

// ---- reports -----------------------------------------------------------------------

export const REASONS = [
  { id: 'child', label: 'A child is in danger' },
  { id: 'sexual', label: 'Sexual content' },
  { id: 'violence', label: 'Violence or self-harm' },
  { id: 'hate', label: 'Hate or harassment' },
  { id: 'offtopic', label: 'Nothing to do with learning' },
  { id: 'spam', label: 'Spam or a scam' },
];

/**
 * One report per person per thing, so the id is the pair. `kind` is one of
 * post, user, stream or chat.
 */
export async function report(kind, targetId, aboutUid, reason) {
  const me = auth.currentUser?.uid;
  if (!me) return;
  await setDoc(doc(db, 'reports', targetId + '_' + me), {
    kind, target: targetId, about: aboutUid || null, by: me, reason, at: serverTimestamp(),
  });
}

// ---- how old someone is ------------------------------------------------------------

export const MIN_AGE = 13;
export const ADULT_AGE = 18;

/**
 * Turned on when the Yoti face check is wired up. Until then the links row is
 * dormant on every client at once — a gate that opens on one of them isn't a
 * gate. See web/app.js for the long version.
 */
export const FACE_CHECKS = false;

/** What we keep: the moment this person turns 18, and who says so. */
export const useAge = shared((me, emit) => onSnapshot(
  doc(db, 'ages', me),
  snap => emit({
    adultAt: typeof snap.get('adultAt') === 'number' ? snap.get('adultAt') : null,
    by: snap.exists() ? (snap.get('by') || null) : null,
  }),
  () => {},
), { adultAt: null, by: null });

/** Old enough, and checked. A date someone typed is never proof. */
export function isAdult(age) {
  return !!age && age.by === 'face' && age.adultAt !== null && Date.now() >= age.adultAt;
}

export function yearsSince(dob) {
  const now = new Date();
  const had = now.getMonth() > dob.getMonth()
    || (now.getMonth() === dob.getMonth() && now.getDate() >= dob.getDate());
  return now.getFullYear() - dob.getFullYear() - (had ? 0 : 1);
}

export function adultAtFrom(dob) {
  const at = new Date(dob.getTime());
  at.setFullYear(at.getFullYear() + ADULT_AGE);
  return at.getTime();
}

/** The date given at sign-up, kept as the day they turn 18. Their word only. */
export async function saveAge(dob) {
  await setDoc(doc(db, 'ages', auth.currentUser.uid), {
    adultAt: adultAtFrom(dob), by: 'self', setAt: serverTimestamp(),
  }, { merge: true });
}

// ---- what can't be said in a comment -----------------------------------------------

const PUBLIC_PLACES = [
  'github.com', 'gitlab.com', 'bitbucket.org', 'stackoverflow.com', 'stackexchange.com',
  'youtube.com', 'youtu.be', 'x.com', 'twitter.com', 'linkedin.com', 'mastodon.social',
  'dev.to', 'medium.com', 'npmjs.com', 'pypi.org', 'codepen.io', 'replit.com',
  'instagram.com', 'tiktok.com', 'twitch.tv', 'reddit.com', 'bsky.app', 'threads.net',
  'patreon.com', 'ko-fi.com', 'buymeacoffee.com', 'substack.com',
  'codesandbox.io', 'figma.com', 'notion.site', 'docs.google.com', 'developer.mozilla.org',
  'codera-46b86.web.app',
];

const PRIVATE_CHANNELS = [
  /\b(?:discord\.gg|discordapp\.com\/invite|discord\.com\/invite)\b/i,
  /\b(?:t\.me|telegram\.me|wa\.me|api\.whatsapp\.com|ig\.me|m\.me|snapchat\.com\/add|join\.skype\.com)\b/i,
  /\b(?:discord|telegram|whatsapp|snap(?:chat)?|kik|signal|skype)\b\s*(?:is|:|@|=|->)\s*\S+/i,
  /\b(?:add|dm|pm|message)\s+me\s+on\b/i,
];

export const EMAIL = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i;
// Seven or more digits together: a phone number however it's spaced out.
export const PHONE = /(?:\d[\s().-]?){7,}/;

function hostsIn(text) {
  const found = [];
  const links = text.match(/(?:https?:\/\/|www\.)[^\s<>"']+/gi) || [];
  for (const link of links) {
    try {
      found.push(new URL(link.startsWith('http') ? link : 'https://' + link)
        .hostname.replace(/^www\./, ''));
    } catch (e) { found.push(link); }
  }
  return found;
}

/**
 * Why this comment can't be sent, or '' when it can. `theirs` is true when the
 * person writing owns the room — it's their post — so a teacher may point at
 * their own community. Phone numbers and emails are refused from everyone.
 */
export function contactProblem(text, theirs) {
  if (EMAIL.test(text)) return 'Email addresses can’t be shared in comments.';
  if (PHONE.test(text.replace(/\b\d{1,4}px\b|\b0x[0-9a-f]+\b/gi, ''))) {
    return 'Phone numbers can’t be shared in comments.';
  }
  if (!theirs && PRIVATE_CHANNELS.some(p => p.test(text))) {
    return 'Codera doesn’t allow invites to private messaging apps — that’s how people get led somewhere unsafe. Your GitHub, channel or website is fine.';
  }
  const strangers = theirs ? [] : hostsIn(text)
    .filter(h => !PUBLIC_PLACES.some(ok => h === ok || h.endsWith('.' + ok)));
  if (strangers.length) {
    return 'Only links to public places like GitHub, YouTube or Stack Overflow can go in comments. Put anything else in your profile or the description.';
  }
  return '';
}

// ---- where else someone can be found -----------------------------------------------

export const MAX_LINKS = 5;

const DM_LINKS = [
  /^m\.me$/i, /^ig\.me$/i, /^wa\.me$/i, /^api\.whatsapp\.com$/i,
  /^chat\.whatsapp\.com$/i, /^join\.skype\.com$/i, /^snapchat\.com$/i,
];
const DM_PATHS = [/^\/\+/, /^\/joinchat/i, /^\/add\b/i, /^\/users\//i, /^\/m\//i];
const SHORTENERS = ['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'is.gd', 'cutt.ly',
  'rb.gy', 'shorturl.at', 'rebrand.ly', 'ow.ly', 'lnkd.in', 'linktr.ee'];

/** Which place a host belongs to, and whether its names read as @handles. */
export const SOCIALS = [
  { key: 'youtube', hosts: ['youtube.com', 'youtu.be'], name: 'YouTube', at: true },
  { key: 'x', hosts: ['x.com', 'twitter.com'], name: 'X', at: true },
  { key: 'instagram', hosts: ['instagram.com'], name: 'Instagram', at: true },
  { key: 'tiktok', hosts: ['tiktok.com'], name: 'TikTok', at: true },
  { key: 'twitch', hosts: ['twitch.tv'], name: 'Twitch', at: true },
  { key: 'github', hosts: ['github.com'], name: 'GitHub', at: false },
  { key: 'gitlab', hosts: ['gitlab.com'], name: 'GitLab', at: false },
  { key: 'linkedin', hosts: ['linkedin.com'], name: 'LinkedIn', at: false },
  { key: 'discord', hosts: ['discord.gg', 'discord.com', 'discordapp.com'], name: 'Discord', at: false },
  { key: 'reddit', hosts: ['reddit.com'], name: 'Reddit', at: false },
  { key: 'bluesky', hosts: ['bsky.app'], name: 'Bluesky', at: true },
  { key: 'mastodon', hosts: ['mastodon.social', 'fosstodon.org', 'hachyderm.io'], name: 'Mastodon', at: true },
  { key: 'patreon', hosts: ['patreon.com'], name: 'Patreon', at: false },
  { key: 'kofi', hosts: ['ko-fi.com', 'buymeacoffee.com'], name: 'Tip jar', at: false },
  { key: 'substack', hosts: ['substack.com'], name: 'Substack', at: false },
];

/** The link as it was typed, made into a URL, or null when it isn't one. */
export function asUrl(raw) {
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

export function placeFor(host) {
  return SOCIALS.find(s => s.hosts.some(h => host === h || host.endsWith('.' + h))) || null;
}

/** Why this can't go on a profile, or '' when it can. */
export function linkProblem(raw) {
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
  if (SHORTENERS.includes(host)) return 'Shortened links hide where they go. Use the real address.';
  const dmHost = DM_LINKS.some(p => p.test(host));
  const dmPath = DM_PATHS.some(p => p.test(u.pathname));
  if (dmHost || (dmPath && /^(t\.me|telegram\.me|discord\.com|discordapp\.com)$/i.test(host))) {
    return 'That link opens a private message with you. A channel, a server or a page is fine — a direct line to one person isn’t.';
  }
  return '';
}

/** How the chip reads: @name where that's how a place names people. */
export function handleFor(u, place) {
  const host = u.hostname.replace(/^www\./, '').toLowerCase();
  const first = u.pathname.split('/').filter(Boolean)[0] || '';
  if (!place) return host;
  if (!first) return place.name;
  const clean = first.replace(/^@/, '');
  if (/^(c|channel|user|in|company|invite|r|watch|playlist)$/i.test(clean)) {
    const next = u.pathname.split('/').filter(Boolean)[1];
    if (!next) return place.name;
    return clean.toLowerCase() === 'r' ? 'r/' + next : next.replace(/^@/, '');
  }
  return place.at ? '@' + clean : clean;
}

export async function setLinks(list) {
  await setDoc(doc(db, 'profiles', auth.currentUser.uid), {
    links: list.length ? list.slice(0, MAX_LINKS) : null,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/** The chips a row should draw, worked out once. */
export function chipsFor(links) {
  return (Array.isArray(links) ? links : []).slice(0, MAX_LINKS).map(raw => {
    const u = asUrl(raw);
    if (!u) return null;
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    const place = placeFor(host);
    return { href: u.href, key: place ? place.key : 'web', text: place ? handleFor(u, place) : host };
  }).filter(Boolean);
}
