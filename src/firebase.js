import { initializeApp, getApp, getApps } from 'firebase/app';
import { initializeAuth, getAuth, getReactNativePersistence } from 'firebase/auth';
import { initializeFirestore, getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Codera's own Firebase project, kept apart from GWCORP.
 *
 * None of these values is a secret. The API key only names which project to
 * talk to; what protects an account is sign-in itself and the security rules
 * behind it. Passwords never pass through this app in any form Firebase stores —
 * they go over TLS and are hashed with scrypt on Google's side.
 */
const config = {
  apiKey: 'AIzaSyDtXpuSuFtIZGC_Frv9jTHfO1xu7Q5LX_0',
  authDomain: 'codera-46b86.firebaseapp.com',
  projectId: 'codera-46b86',
  storageBucket: 'codera-46b86.firebasestorage.app',
  messagingSenderId: '376496609142',
  appId: '1:376496609142:android:30bce0bb06b79568288c57',
};

// Everything below may run more than once in the same JS runtime: Fast Refresh
// re-executes this file whenever it or anything it imports is saved. The
// initialize* calls throw on a second run, and a throw here stops the file
// before `db` is exported — every screen then hands `undefined` to Firestore.
// So each one reuses the instance that already exists.
export const app = getApps().length ? getApp() : initializeApp(config);

function makeAuth() {
  try {
    // React Native has no browser storage for getAuth() to fall back on, so
    // without this the session is thrown away every time the app closes.
    return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch (e) {
    return getAuth(app);
  }
}
export const auth = makeAuth();

function makeDb() {
  try {
    // Long polling rather than the default streaming connection. The Firestore
    // web SDK's WebChannel transport stalls under React Native's networking —
    // listeners attach and simply never receive anything, with no error.
    return initializeFirestore(app, { experimentalForceLongPolling: true });
  } catch (e) {
    return getFirestore(app);
  }
}
export const db = makeDb();

export const storage = getStorage(app);

// Same region the functions are deployed to (functions/index.js).
export const functions = getFunctions(app, 'us-central1');
