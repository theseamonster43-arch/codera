import {
  collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy, limit,
  serverTimestamp, runTransaction, increment, updateDoc,
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
export async function createPost({ title, body, code, lang, image }) {
  const who = author();
  // The picture goes up first: a post is never written pointing at a file
  // that failed to upload.
  const picture = image ? await uploadImage({ ...image, uid: who.uid }) : null;

  return addDoc(collection(db, POSTS), {
    ...who,
    type: 'post',
    title: title.trim(),
    body: (body || '').trim(),
    code: (code || '').replace(/\s+$/, ''),
    lang: lang || null,
    imageUrl: picture ? picture.imageUrl : null,
    imagePath: picture ? picture.imagePath : null,
    likeCount: 0,
    dislikeCount: 0,
    commentCount: 0,
    createdAt: serverTimestamp(),
  });
}

/** Puts one picture in Storage, under the poster's own folder. */
async function uploadImage({ uri, mime, uid }) {
  const ext = (mime && mime.split('/')[1]) || 'jpg';
  const imagePath = 'images/' + uid + '/' + Date.now() + '.' + ext;
  const blob = await readFile(uri);
  try {
    await uploadBytesResumable(ref(storage, imagePath), blob, {
      contentType: mime || 'image/jpeg',
    });
  } finally {
    if (blob && typeof blob.close === 'function') blob.close();
  }
  return { imagePath, imageUrl: await getDownloadURL(ref(storage, imagePath)) };
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
    dislikeCount: 0,
    commentCount: 0,
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
  if (post.imagePath) {
    try { await deleteObject(ref(storage, post.imagePath)); } catch (e) {}
  }
  await deleteDoc(doc(db, POSTS, post.id));
}

// ---- Likes and dislikes -----------------------------------------------------
//
// One vote per person per post, kept as a document under the post, with the
// totals on the post itself so a feed doesn't have to count them. Both are
// written together, so a total can never drift from the votes behind it.

const voteRef = (postId, uid) => doc(db, POSTS, postId, 'votes', uid);

/** Your vote on a post, live: 1 for like, -1 for dislike, 0 for none. */
export function subscribeMyVote(postId, onChange) {
  const u = auth.currentUser;
  if (!u) { onChange(0); return () => {}; }
  return onSnapshot(voteRef(postId, u.uid),
    snap => onChange(snap.exists() ? snap.get('v') || 0 : 0),
    () => onChange(0));
}

/**
 * Casts, changes or takes back a vote. Pressing like twice removes the like,
 * and liking something you disliked moves the vote across in one go.
 */
export async function vote(postId, want) {
  const u = auth.currentUser;
  if (!u) throw new Error('Sign in to vote.');

  await runTransaction(db, async tx => {
    const mine = await tx.get(voteRef(postId, u.uid));
    const had = mine.exists() ? mine.get('v') || 0 : 0;
    const now = had === want ? 0 : want;      // pressing the same one again undoes it
    if (now === had) return;

    const delta = { likeCount: 0, dislikeCount: 0 };
    if (had === 1) delta.likeCount -= 1;
    if (had === -1) delta.dislikeCount -= 1;
    if (now === 1) delta.likeCount += 1;
    if (now === -1) delta.dislikeCount += 1;

    if (now === 0) tx.delete(voteRef(postId, u.uid));
    else tx.set(voteRef(postId, u.uid), { v: now, uid: u.uid, at: serverTimestamp() });

    tx.update(doc(db, POSTS, postId), {
      likeCount: increment(delta.likeCount),
      dislikeCount: increment(delta.dislikeCount),
    });
  });
}

// ---- Comments ---------------------------------------------------------------

/** Every comment on a post, oldest first, live. */
export function subscribeComments(postId, onChange, onError) {
  const q = query(
    collection(db, POSTS, postId, 'comments'),
    orderBy('createdAt', 'asc'), limit(200));
  return onSnapshot(q, snap => {
    onChange(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, onError);
}

export async function addComment(postId, text) {
  const who = author();
  const body = text.trim();
  if (!body) return;
  await addDoc(collection(db, POSTS, postId, 'comments'), {
    ...who,
    text: body.slice(0, 1000),
    createdAt: serverTimestamp(),
  });
  // Kept on the post so a card can show the count without reading the comments.
  await updateDoc(doc(db, POSTS, postId), { commentCount: increment(1) });
}

export async function deleteComment(postId, commentId) {
  await deleteDoc(doc(db, POSTS, postId, 'comments', commentId));
  await updateDoc(doc(db, POSTS, postId), { commentCount: increment(-1) });
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
