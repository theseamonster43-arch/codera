const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

initializeApp();
// Next to the database (nam5), and capped so a runaway client can't scale it up.
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

/**
 * Codera Plus — $10 a month.
 *
 * TEST MODE: no payment is taken. Subscribing records a 30-day test
 * subscription and nothing more.
 *
 * These functions are the only way Plus is ever switched on or off: the
 * database rules refuse any write to users/{uid} from the app, so Plus can't be
 * granted by editing a request. Connecting real payments later means changing
 * plusSubscribe to verify the store's receipt first (App Store Server API /
 * Google Play Developer API) — the app and the rules stay as they are.
 *
 * Set TEST_MODE to false before Plus unlocks anything: while it is true, anyone
 * signed in can call plusSubscribe and get Plus for free.
 */
const TEST_MODE = true;
const PRICE = { amount: 10, currency: 'USD', interval: 'month' };
const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

const userDoc = uid => getFirestore().doc(`users/${uid}`);

function uidOf(req) {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  return req.auth.uid;
}

/** In its paid period right now, whether or not it's set to end. */
const inPeriod = plus => !!plus && plus.active && plus.endsAt.toMillis() > Date.now();

/** Starts Plus, or resumes it if it was cancelled but hasn't run out yet. */
exports.plusSubscribe = onCall(async req => {
  const uid = uidOf(req);
  if (!TEST_MODE) {
    throw new HttpsError('failed-precondition', "Payments aren't connected yet.");
  }

  const ref = userDoc(uid);
  await getFirestore().runTransaction(async tx => {
    const plus = (await tx.get(ref)).get('plus');

    if (inPeriod(plus)) {
      // Already paid up to endsAt: resuming only stops it from ending. Starting
      // a fresh period here would hand out free time on every cancel/resume.
      tx.set(ref, { plus: { ...plus, cancelled: false } }, { merge: true });
      return;
    }

    const now = Date.now();
    tx.set(ref, {
      plus: {
        active: true,
        test: true,
        cancelled: false,
        price: PRICE,
        since: Timestamp.fromMillis(now),
        endsAt: Timestamp.fromMillis(now + PERIOD_MS),
      },
    }, { merge: true });
  });

  return { ok: true };
});

/** Cancels at the end of the period: Plus stays until endsAt, like a store subscription. */
exports.plusCancel = onCall(async req => {
  const uid = uidOf(req);
  const ref = userDoc(uid);

  await getFirestore().runTransaction(async tx => {
    const plus = (await tx.get(ref)).get('plus');
    if (!inPeriod(plus)) throw new HttpsError('failed-precondition', "You don't have Plus.");
    tx.set(ref, { plus: { ...plus, cancelled: true } }, { merge: true });
  });

  return { ok: true };
});
