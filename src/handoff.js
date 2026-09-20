import { Linking } from 'react-native';
import { GithubAuthProvider, GoogleAuthProvider, signInWithCredential } from 'firebase/auth';

import { auth } from './firebase';

/**
 * Signing in through the browser, for providers the app can't show itself.
 *
 * GitHub has no sign-in SDK for React Native, so the app opens Codera's own
 * hand-off page (web/auth.html) in the browser. That page signs in with GitHub
 * there and sends the result back through codera://auth, carrying the random
 * `state` this app made — an answer without it is not an answer to our
 * question and is ignored. The app then signs in to Firebase with it.
 */
const PAGE = 'https://codera-46b86.web.app/auth.html';
const WAIT_MS = 10 * 60 * 1000;

// Unguessable, so no other app can forge an answer to this sign-in.
function randomState() {
  const bytes = new Uint8Array(24);
  global.crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function params(url) {
  const q = url.split('?')[1] || '';
  return Object.fromEntries(q.split('&').filter(Boolean).map(pair => {
    const [k, v = ''] = pair.split('=');
    return [decodeURIComponent(k), decodeURIComponent(v.replace(/\+/g, ' '))];
  }));
}

/** Resolves once signed in, or rejects if it didn't work or took too long. */
export function signInThroughBrowser(provider) {
  const state = randomState();
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sub.remove();
      fn(value);
    };
    const timer = setTimeout(() => finish(reject, new Error('Sign-in took too long. Try again.')), WAIT_MS);

    const sub = Linking.addEventListener('url', async ({ url }) => {
      if (!url || !url.startsWith('codera://auth')) return;
      const p = params(url);
      if (p.state !== state) return;
      try {
        const credential = p.provider === 'github'
          ? GithubAuthProvider.credential(p.accessToken)
          : GoogleAuthProvider.credential(p.idToken || null, p.accessToken || null);
        await signInWithCredential(auth, credential);
        finish(resolve);
      } catch (e) {
        finish(reject, e);
      }
    });

    Linking.openURL(`${PAGE}?provider=${provider}&state=${state}`).catch(e => finish(reject, e));
  });
}
