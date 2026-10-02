const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const crypto = require('crypto');

/**
 * Signing a television in, without typing a password on a television.
 *
 * A remote has four arrows and a middle button. Nobody is typing an email
 * address with that, and Google's own sign-in sheet needs a browser the box
 * does not really have. So the television never signs anybody in: it asks for a
 * code, shows it, and waits. Whoever is already signed in on a phone or the
 * website opens learncodera.com/tv, enters the code, and the television is
 * handed a token for that account.
 *
 * This is how a television has always done it, and it has a second advantage
 * over putting Google's own device flow here: approval happens wherever you are
 * already signed in, so it works the same whether that was Google, GitHub or an
 * email address. The TV learns nothing about how you signed in.
 *
 * What stops somebody else claiming your pairing:
 *
 *   - The code is short because it is read off a screen and typed by hand, so
 *     it is only a name for the pairing, never a key to it.
 *   - The television also gets a secret, 32 random bytes it keeps to itself,
 *     and only the holder of that secret can collect the token. Guessing a code
 *     gets an attacker a pairing they cannot claim.
 *   - Only the secret's hash is stored, so the database never holds the thing
 *     that claims the token.
 *   - A pairing lasts ten minutes and is destroyed the moment it is claimed.
 */

/** No I, O, 0 or 1: these are read off a television and typed by hand. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const MINUTES = 10;

const db = () => getFirestore();
const hash = s => crypto.createHash('sha256').update(String(s)).digest('hex');

function newCode() {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/**
 * A television asks to be signed in.
 *
 * Unauthenticated, necessarily: nobody is signed in on the television yet.
 */
exports.tvPairStart = onCall(async () => {
  const secret = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + MINUTES * 60 * 1000;

  // A code already in use is a collision, not an attack; try again for a few.
  for (let tries = 0; tries < 8; tries++) {
    const code = newCode();
    const ref = db().doc('tvPairings/' + code);
    try {
      await ref.create({
        secretHash: hash(secret),
        uid: null,
        at: FieldValue.serverTimestamp(),
        expires,
      });
      return { code, secret, expires };
    } catch (e) {
      if (e.code !== 6 && e.code !== 'already-exists') throw e;
    }
  }
  throw new HttpsError('resource-exhausted', 'Couldn’t start a sign-in. Try again.');
});

/**
 * Somebody already signed in says yes to a code.
 *
 * This is the whole of the trust: the account handed over is the account that
 * pressed the button, never one named by the television.
 */
exports.tvPairApprove = onCall(async req => {
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');

  const code = String((req.data && req.data.code) || '').trim().toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(code)) {
    throw new HttpsError('invalid-argument', 'That isn’t a sign-in code.');
  }

  const ref = db().doc('tvPairings/' + code);
  const snap = await ref.get();
  if (!snap.exists || snap.get('expires') < Date.now()) {
    throw new HttpsError('not-found', 'That code has expired. The TV will show a new one.');
  }
  if (snap.get('uid')) {
    throw new HttpsError('failed-precondition', 'That code has already been used.');
  }

  await ref.update({ uid, approvedAt: FieldValue.serverTimestamp() });
  return { ok: true };
});

/**
 * The television collects its token.
 *
 * Called over and over while somebody finds their phone, so "not yet" is an
 * ordinary answer rather than an error.
 */
exports.tvPairClaim = onCall(async req => {
  const code = String((req.data && req.data.code) || '').trim().toUpperCase();
  const secret = String((req.data && req.data.secret) || '');
  if (!/^[A-Z2-9]{6}$/.test(code) || secret.length !== 64) {
    throw new HttpsError('invalid-argument', 'Which sign-in?');
  }

  const ref = db().doc('tvPairings/' + code);
  const snap = await ref.get();
  if (!snap.exists) return { waiting: false, gone: true };
  if (snap.get('expires') < Date.now()) {
    await ref.delete().catch(() => {});
    return { waiting: false, gone: true };
  }

  // Compared in constant time: the secret is the only thing standing between a
  // guessed code and somebody else's account.
  const want = Buffer.from(snap.get('secretHash') || '', 'utf8');
  const got = Buffer.from(hash(secret), 'utf8');
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) {
    throw new HttpsError('permission-denied', 'That isn’t this television.');
  }

  const uid = snap.get('uid');
  if (!uid) return { waiting: true };

  // Used once: the pairing goes before the token is handed back.
  await ref.delete().catch(() => {});
  const token = await getAuth().createCustomToken(uid);
  return { waiting: false, token };
});
