import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import {
  collection, doc, getCountFromServer, getDoc, getDocs, limit, onSnapshot, query,
  serverTimestamp, setDoc, deleteDoc, where,
} from 'firebase/firestore';

import { auth, db } from './firebase';
import { learn, topicsOf, topicsOfText, WEIGHT } from './taste';

/**
 * Following, live streams and recommendations — the same collections and rules
 * as the website (web/app.js) and the desktop app, so a follow made here is the
 * same follow everywhere, and the feed is ranked the same way.
 *
 * Going live and watching a stream happen in the website's own live pages,
 * shown in a web view (see LiveViewScreen): a phone's web view can record a
 * stream for saving, which the app's own video stack cannot.
 */

export const SITE = 'https://codera-46b86.web.app';

// ---- shared listeners, one each for the whole app ---------------------------------

export function shared(start, empty) {
  let value = empty;
  let stop = null;
  let uid = null;
  const subs = new Set();
  const emit = v => { value = v; subs.forEach(f => f(v)); };
  return function useShared() {
    const [v, setV] = useState(value);
    useEffect(() => {
      subs.add(setV);
      const me = auth.currentUser?.uid || null;
      if (!stop || uid !== me) {
        if (stop) stop();
        uid = me;
        value = empty;
        stop = me ? start(me, emit) : null;
      }
      setV(value);
      return () => {
        subs.delete(setV);
        if (!subs.size && stop) { stop(); stop = null; uid = null; value = empty; }
      };
    }, []);
    return v;
  };
}

/** The uids this account follows, as a Set. */
export const useFollowing = shared((me, emit) => onSnapshot(
  query(collection(db, 'follows'), where('from', '==', me)),
  snap => emit(new Set(snap.docs.map(d => d.get('to')))),
  () => {},
), new Set());

/** Streams marked live right now. */
export const useStreams = shared((me, emit) => onSnapshot(
  query(collection(db, 'streams'), where('live', '==', true), limit(50)),
  snap => emit(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
  () => {},
), []);

let tasteNow = {};
// Until the saved scores have been read, actions wait here: writing before then
// would replace everything learned so far with just the latest action.
let tasteReady = false;
let tastePending = [];

/** This account's subject scores, behind the recommended feed. */
export const useTaste = shared((me, emit) => {
  tasteReady = false;
  tastePending = [];
  return onSnapshot(
    doc(db, 'taste', me),
    snap => {
      tasteNow = snap.exists() ? snap.data() : {};
      emit(tasteNow);
      if (!tasteReady) {
        tasteReady = true;
        const waiting = tastePending;
        tastePending = [];
        waiting.forEach(([t, w]) => nudge(t, w));
      }
    },
    () => {},
  );
}, {});

// ---- taste ----------------------------------------------------------------------------

let tasteTimer = null;
const nudged = new Set();

/** Moves the subject scores after a view, a like, a search… `once` stops repeats. */
export function nudge(topics, weight, once) {
  const uid = auth.currentUser?.uid;
  if (!uid || !topics || !topics.length || !weight) return;
  if (once) {
    if (nudged.has(once)) return;
    nudged.add(once);
  }
  if (!tasteReady) { tastePending.push([topics, weight]); return; }
  tasteNow = learn(tasteNow, topics, weight);
  clearTimeout(tasteTimer);
  const snapshot = { ...tasteNow };
  tasteTimer = setTimeout(() => setDoc(doc(db, 'taste', uid), snapshot).catch(() => {}), 1500);
}

export const nudgePost = (p, weight, once) => p && nudge(topicsOf(p), weight, once);
export const nudgeText = (text, weight, once) => nudge(topicsOfText(text), weight, once);
export { WEIGHT };

// ---- streams ----------------------------------------------------------------------------

const millis = ts => (ts && ts.toMillis ? ts.toMillis() : 0);

/**
 * Whether a stream is really on air: marked live, and its streamer's app has
 * checked in within the last minute or so. A crashed streamer never says the
 * stream is over; this is how it stops being listed.
 */
export function onAir(s) {
  if (!s || !s.live) return false;
  const beat = millis(s.beat);
  return !beat || Date.now() - beat < 75000;
}

/**
 * The address of a live page in the website's app mode: no header or sidebar,
 * and on iPhone no Tip button (Apple requires its own payments for tips).
 */
export const liveUrl = path => `${SITE}/?app=${Platform.OS}#/${path}`;

/**
 * The script that hands this app's signed-in session to the web view before
 * its page loads, so nobody signs in a second time. It is this account's own
 * session going to Codera's own site, over HTTPS.
 */
export function sessionScript() {
  const u = auth.currentUser;
  const session = u && typeof u.toJSON === 'function' ? u.toJSON() : null;
  return `window.__CODERA_SESSION__ = ${JSON.stringify(session)}; true;`;
}

// ---- following and people's pages -------------------------------------------------------

export async function toggleFollow(uid, following) {
  const me = auth.currentUser?.uid;
  if (!me || !uid || uid === me) return;
  const ref = doc(db, 'follows', `${me}_${uid}`);
  if (following) await deleteDoc(ref);
  else await setDoc(ref, { from: me, to: uid, at: serverTimestamp() });
}

/** Someone's profile, posts and follower counts. */
export async function loadUser(uid) {
  const [p, list, followers, followingN] = await Promise.all([
    getDoc(doc(db, 'profiles', uid)).catch(() => null),
    getDocs(query(collection(db, 'posts'), where('uid', '==', uid), limit(120))).catch(() => null),
    getCountFromServer(query(collection(db, 'follows'), where('to', '==', uid))).then(c => c.data().count).catch(() => 0),
    getCountFromServer(query(collection(db, 'follows'), where('from', '==', uid))).then(c => c.data().count).catch(() => 0),
  ]);
  const posts = (list ? list.docs.map(d => ({ id: d.id, ...d.data() })) : [])
    .sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
  return { profile: p && p.exists() ? p.data() : {}, posts, followers, following: followingN };
}

/** A name, or an id, to an account id. */
export async function resolveUser(arg) {
  const key = String(arg || '').trim().toLowerCase();
  if (!key) return null;
  try {
    const s = await getDoc(doc(db, 'usernames', key));
    if (s.exists()) return s.get('uid');
  } catch (e) { /* perhaps an id */ }
  return String(arg).trim();
}

/** Names and pictures for a handful of accounts, read once each. */
const faceCache = new Map();
export function useFaces(uids) {
  const [faces, setFaces] = useState(() => Object.fromEntries(uids.filter(u => faceCache.has(u)).map(u => [u, faceCache.get(u)])));
  const key = uids.join(',');
  useEffect(() => {
    let alive = true;
    const missing = uids.filter(u => !faceCache.has(u));
    Promise.all(missing.map(async uid => {
      try {
        const s = await getDoc(doc(db, 'profiles', uid));
        faceCache.set(uid, s.exists() ? { username: s.get('username'), photoUrl: s.get('photoUrl') } : {});
      } catch (e) { faceCache.set(uid, {}); }
    })).then(() => {
      if (alive) setFaces(Object.fromEntries(uids.map(u => [u, faceCache.get(u) || {}])));
    });
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return faces;
}
