import { useEffect, useState } from 'react';
import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { updateProfile } from 'firebase/auth';

import { auth, db, storage } from './firebase';
import { readFile } from './data';

/**
 * How someone has dressed their own page: the banner across the top, the
 * picture on it, and a line about themselves.
 *
 * Kept in profiles/{uid} rather than in users/{uid}, which only the Cloud
 * Functions may write. The same document backs the website, so a banner set on
 * one shows up on the other.
 */

/** Live profile for whoever is signed in. */
export function useProfile(user) {
  // Takes the account as an argument where the caller has one: auth.currentUser
  // is whatever was signed in when the component first ran, which is null on the
  // render right after signing in.
  const uid = (user || auth.currentUser)?.uid;
  const [profile, setProfile] = useState({ loaded: false });

  useEffect(() => {
    if (!uid) { setProfile({ loaded: false }); return undefined; }
    return onSnapshot(
      doc(db, 'profiles', uid),
      snap => setProfile({ loaded: true, ...(snap.exists() ? snap.data() : {}) }),
      // Left as it was: a momentary error is not a reason to blank out a
      // banner that is perfectly fine.
      () => {},
    );
  }, [uid]);

  return profile;
}

/**
 * Sets the banner or the picture. `kind` is 'banner' or 'photo'.
 *
 * The file goes up first and the profile is written only once it has a URL, so
 * a failed upload never leaves a profile pointing at nothing. A picture is also
 * written to the account itself, so it becomes the face on everything posted
 * from then on.
 */
export async function setProfileImage(kind, { uri, mime }, was) {
  const uid = auth.currentUser.uid;
  const ext = (mime && mime.split('/')[1]) || 'jpg';
  const path = `profile/${uid}/${kind}-${Date.now()}.${ext}`;

  const blob = await readFile(uri);
  try {
    await uploadBytesResumable(ref(storage, path), blob, { contentType: mime || 'image/jpeg' });
  } finally {
    if (blob && typeof blob.close === 'function') blob.close();
  }
  const url = await getDownloadURL(ref(storage, path));

  await setDoc(doc(db, 'profiles', uid), {
    [`${kind}Url`]: url,
    [`${kind}Path`]: path,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  if (kind === 'photo') await updateProfile(auth.currentUser, { photoURL: url });

  // Only once the new one is safely recorded.
  if (was) { try { await deleteObject(ref(storage, was)); } catch (e) {} }
  return url;
}

/** Takes the banner back off. */
export async function clearBanner(was) {
  await setDoc(doc(db, 'profiles', auth.currentUser.uid), {
    bannerUrl: null, bannerPath: null, updatedAt: serverTimestamp(),
  }, { merge: true });
  if (was) { try { await deleteObject(ref(storage, was)); } catch (e) {} }
}

/** The line someone writes about themselves. Empty clears it. */
export async function setBio(text) {
  await setDoc(doc(db, 'profiles', auth.currentUser.uid), {
    bio: text.trim().slice(0, 300) || null,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export const BIO_MAX = 300;

// ---- usernames --------------------------------------------------------------
//
// One name, one person. The claim is a document whose id is the name itself and
// which may only ever be created, never written over — so the second person to
// try a name is refused by the database, not by code that could be skipped.

export const NAME_MAX = 20;
export const NAME_OK = /^[a-z0-9_]{3,20}$/;

/** What a name looks like as a document id: lower case, no spaces. */
export const nameKey = raw => String(raw || '').trim().toLowerCase().replace(/\s+/g, '_');

/** Is this name free? Only answerable while signed in — reads need an account. */
export async function nameFree(raw) {
  const snap = await getDoc(doc(db, 'usernames', nameKey(raw)));
  return !snap.exists();
}

/** Takes a username for the signed-in account. Throws if it is already held. */
export async function claimUsername(raw) {
  const key = nameKey(raw);
  if (!NAME_OK.test(key)) throw new Error('shape');
  const uid = auth.currentUser.uid;

  await setDoc(doc(db, 'usernames', key), { uid, at: serverTimestamp() });
  await setDoc(doc(db, 'profiles', uid), {
    username: key, updatedAt: serverTimestamp(),
  }, { merge: true });
  // So everything posted from here on is signed with the name.
  await updateProfile(auth.currentUser, { displayName: key });
  return key;
}
