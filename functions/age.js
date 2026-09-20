const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const Stripe = require('stripe');
const crypto = require('crypto');
const { STRIPE_SECRET } = require('./stripe');

/**
 * Proving someone is old enough to be shown a link that leads off Codera.
 *
 * Stripe Identity does the checking: the person is sent to a page Stripe hosts,
 * photographs a government ID and then their own face, and Stripe matches the
 * two. Codera never receives either image. What comes back is a date of birth
 * read off the document, which is a stronger answer than an estimate from a
 * face — it is the document's own claim, checked against the person holding it.
 *
 * Everything rests on that answer being real, because the record it writes is
 * what opens the links row. So nothing the browser says is believed: ageStart
 * hands out a URL and nothing else, and the result arrives as a Stripe webhook,
 * signature-checked against the signing secret before it can change anything.
 * The database rules let a client write `by: 'self'` and no more; only this
 * file, through the admin SDK, ever writes a checked one.
 *
 * We keep the one fact the gate needs — the moment this person turns 18 — and
 * not the date of birth it was worked out from, nor their name, nor the
 * document. Stripe holds those; we don't ask for them.
 */

const ADULT_AGE = 18;
const SITE = 'https://codera-46b86.web.app';

const db = () => getFirestore();
const stripe = () => new Stripe(STRIPE_SECRET.value());

/** The moment someone born on this date turns 18. */
function adultAtFrom(dob) {
  // Stripe hands the date back in pieces rather than as a string.
  const at = new Date(Date.UTC(dob.year + ADULT_AGE, dob.month - 1, dob.day));
  return at.getTime();
}

/**
 * Starts a check and returns the page to send the person to.
 *
 * Stripe is told an opaque token, not a uid: ageChecks/{token} is what turns
 * their answer back into a person, and it never leaves our side.
 */
exports.ageStart = onCall({ secrets: [STRIPE_SECRET] }, async req => {
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');

  const token = crypto.randomUUID();
  await db().collection('ageChecks').doc(token).set({
    uid, at: FieldValue.serverTimestamp(), done: false,
  });

  let session;
  try {
    session = await stripe().identity.verificationSessions.create({
      type: 'document',
      options: {
        document: {
          require_matching_selfie: true,   // the face has to be the document's face
          require_live_capture: true,      // taken now, not picked out of a folder
        },
      },
      metadata: { check: token },
      return_url: SITE + '/#/you',
    });
  } catch (e) {
    console.error('[ageStart]', e.code || '', e.message);
    throw new HttpsError('internal', 'Couldn’t start the check. Try again shortly.');
  }

  await db().collection('ageChecks').doc(token).update({ session: session.id });
  return { url: session.url };
});

/**
 * Stripe saying a check passed. Called from the webhook, which has already
 * proved the message came from Stripe.
 *
 * Returns a line for the log, and throws only on something worth retrying —
 * Stripe resends until it gets a 200, so a permanent problem must not throw or
 * it will be redelivered for days.
 */
exports.identityVerified = async function identityVerified(object) {
  const token = object.metadata && object.metadata.check;
  if (!token) return 'not one of ours';

  const ref = db().collection('ageChecks').doc(String(token));
  const snap = await ref.get();
  if (!snap.exists) return 'unknown check ' + token;
  const uid = snap.get('uid');
  if (!uid) return 'check has nobody on it';
  if (snap.get('done')) return 'already recorded';

  // The date of birth is only ever handed over when asked for by name.
  const full = await stripe().identity.verificationSessions.retrieve(object.id, {
    expand: ['verified_outputs'],
  });
  const dob = full.verified_outputs && full.verified_outputs.dob;
  if (!dob || !dob.year || !dob.month || !dob.day) {
    // Verified, but the date wasn't released to us — nothing we can honestly
    // write, so the row stays shut rather than opening on an assumption.
    return 'verified without a date of birth';
  }

  const adultAt = adultAtFrom(dob);
  if (Date.now() < adultAt) {
    await ref.update({ done: true, passed: false, at: FieldValue.serverTimestamp() });
    return 'checked, and under ' + ADULT_AGE;
  }

  await db().collection('ages').doc(uid).set({
    adultAt,
    by: 'id',
    checkedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  await ref.update({ done: true, passed: true, at: FieldValue.serverTimestamp() });
  return 'passed: ' + uid;
};
