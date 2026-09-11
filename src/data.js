import {
  collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy, limit,
  serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';

import { auth, db, storage } from './firebase';

/**
 * Everything Codera reads and writes, in one place.
 *
 * One `posts` collection for all three kinds, told apart by `type`. A single
 * collection means one query feeds every screen and one set of security rules
 * covers everything that can be posted.
 */
const POSTS = 'posts';

/** Who is posting, taken from the signed-in account at the moment of posting. */
function author() {
  const u = auth.currentUser;
  if (!u) throw new Error('Sign in to post.');
  return {
    uid: u.uid,
    authorName: u.displayName || (u.email ? u.email.split('@')[0] : 'Someone'),
    authorPhoto: u.photoURL || null,
  };
}

/** A text post with an optional code snippet. */
export async function createPost({ title, body, code, lang }) {
  return addDoc(collection(db, POSTS), {
    ...author(),
    type: 'post',
    title: title.trim(),
    body: (body || '').trim(),
    code: (code || '').replace(/\s+$/, ''),
    lang: lang || null,
    likeCount: 0,
    createdAt: serverTimestamp(),
  });
}

/**
 * Reads a local file into a Blob for upload.
 *
 * XMLHttpRequest rather than fetch(): React Native's fetch cannot read the
 * content:// URIs Android's picker hands back, and silently produces an empty
 * blob — which uploads "successfully" as a zero-byte video.
 */
function readFile(uri) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => resolve(xhr.response);
    xhr.onerror = () => reject(new Error("Couldn't read that video."));
    xhr.responseType = 'blob';
    xhr.open('GET', uri, true);
    xhr.send(null);
  });
}

/**
 * Uploads a short or a video, then records it as a post.
 *
 * The file goes up first and the post is written only once it has a URL, so a
 * failed or abandoned upload never leaves a post pointing at nothing.
 */
export async function uploadVideo({ uri, kind, title, duration, mime, onProgress }) {
  const who = author();
  const ext = (mime && mime.split('/')[1]) || 'mp4';
  // Under the uploader's own folder, which is what lets the Storage rules say
  // "you may only write to your own videos" in a single line.
  const path = `videos/${who.uid}/${Date.now()}.${ext}`;

  const blob = await readFile(uri);
  try {
    await new Promise((resolve, reject) => {
      const task = uploadBytesResumable(ref(storage, path), blob, {
        contentType: mime || 'video/mp4',
      });
      task.on('state_changed',
        snap => onProgress && snap.totalBytes && onProgress(snap.bytesTransferred / snap.totalBytes),
        reject,
        resolve);
    });
  } finally {
    // The blob holds the whole file in memory; release it as soon as the bytes
    // are sent rather than waiting for garbage collection.
    if (blob && typeof blob.close === 'function') blob.close();
  }

  const videoUrl = await getDownloadURL(ref(storage, path));

  return addDoc(collection(db, POSTS), {
    ...who,
    type: kind,              // 'short' | 'video'
    title: title.trim(),
    videoUrl,
    videoPath: path,
    duration: duration || null,
    likeCount: 0,
    createdAt: serverTimestamp(),
  });
}

/**
 * Every post, newest first, live.
 *
 * A single ordered query split by type on the phone, rather than one filtered
 * query per screen: filtering on type while ordering by date needs a composite
 * index built in the console first, and until it exists that query just fails.
 * At Codera's size one stream is cheaper as well as simpler.
 */
export function subscribePosts(onChange, onError) {
  const q = query(collection(db, POSTS), orderBy('createdAt', 'desc'), limit(150));
  return onSnapshot(q, snap => {
    onChange(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, onError);
}

/** Removes a post, and its video file if it has one. */
export async function deletePost(post) {
  if (post.videoPath) {
    // The file may already be gone; that must not stop the post being removed.
    try { await deleteObject(ref(storage, post.videoPath)); } catch (e) {}
  }
  await deleteDoc(doc(db, POSTS, post.id));
}

/** "just now", "5m", "3h", "2d", or a date. */
export function ago(ts) {
  const ms = ts?.toMillis ? ts.toMillis() : null;
  if (!ms) return 'just now';
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  if (s < 604800) return Math.floor(s / 86400) + 'd';
  return new Date(ms).toLocaleDateString();
}
