const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Yoti's face check. Finished, tested as far as it can be, and not in use.
 *
 * Yoti will not issue a token until they have verified the organisation behind
 * the account, and that is a business onboarding with a company address. Until
 * someone completes it this cannot run, so age.js does the job through Stripe
 * Identity instead — an account we already have, already verified.
 *
 * Kept because the hard part is proven: Yoti accept the signed assertion this
 * builds, and the notification verifier is tested. Switching back later is a
 * matter of exporting these again.
 *
 * Proving someone is old enough to be shown a link that leads off Codera.
 *
 * The check itself is Yoti's: the person is sent to a page Yoti hosts, their
 * camera estimates their age, and a passive liveness test is there to catch a
 * photograph of somebody else's face held up to the lens. Codera never sees
 * the picture — it goes from their browser to Yoti and is deleted there.
 *
 * What comes back to us is a webhook, and everything rests on it being real,
 * because the document it writes is what opens the links row. So:
 *
 *   - The browser is never believed. ageStart hands out a URL and nothing
 *     else; the result arrives here, signed by Yoti, or it doesn't count.
 *   - Every notification is checked against Yoti's public key before it can
 *     change anything. An unsigned POST to this endpoint does nothing at all.
 *   - The database rules let clients write `by: 'self'` and no more. Only this
 *     file, through the admin SDK, ever writes `by: 'face'`.
 *
 * Yoti is told an opaque token, never a Codera uid — ageChecks/{token} is what
 * turns their answer back into a person, and it lives only on our side.
 */

// The private key from the Hub. There is no static API key to hold: calls are
// authorised with a short-lived OAuth token that this key signs for, which is
// why the .pem is the whole credential and never leaves Secret Manager.
const YOTI_KEY = defineSecret('YOTI_KEY');
const YOTI_KEY_SANDBOX = defineSecret('YOTI_KEY_SANDBOX');

// Each service in the Hub has its own id and its own key, sandbox included.
// Not secret: it names the service, and Yoti puts it in the URL the browser
// opens. The sandbox one is filled in from the Hub.
// Which is which was settled by asking Yoti for a token with each key in
// turn: the sandbox key got past signature checking and the other did not, so
// this id is the sandbox service's. The live service's id is still to come
// from the Hub.
const LIVE_SDK_ID = null;
const SANDBOX_SDK_ID = 'f82adee2-af2a-4e72-8192-046d14304065';

// Flip to false once the sandbox has done its job. The sandbox has its own
// base URL, its own signing key, and a way to say "pretend the person passed",
// which is the only way to test this without standing in front of a camera.
const SANDBOX = true;

const SDK_ID = SANDBOX ? SANDBOX_SDK_ID : LIVE_SDK_ID;
const KEY = SANDBOX ? YOTI_KEY_SANDBOX : YOTI_KEY;

const BASE = SANDBOX
  ? 'https://age.yoti.com/sandbox/api/v1'
  : 'https://age.yoti.com/api/v1';

const AUTH_URL = 'https://auth.api.yoti.com/v1/oauth/token';
const SCOPE = 'avs:sessions:create';

const SITE = 'https://learncodera.com';
const NOTIFY = 'https://us-central1-codera-46b86.cloudfunctions.net/ageNotify';

/**
 * Yoti's own advice, and it matters: facial age estimation has a spread, so a
 * gate at exactly 18 lets through the top of the under-18 range. Asking for 21
 * keeps them out. The cost is that some genuine 18, 19 and 20 year olds will be
 * turned away and need another way through — which is what the document check
 * is for, when we add it.
 */
const THRESHOLD = 21;
const SESSION_TTL = 900;             // seconds the person has to finish
const NOTIFY_WINDOW = 30 * 60 * 1000; // how stale a notification may be

const db = () => getFirestore();

/** Yoti's signing key, read once and kept. */
let publicKey = null;
function yotiKey() {
  if (!publicKey) {
    const file = SANDBOX ? 'yoti-avs-sandbox-public.pem' : 'yoti-avs-public.pem';
    publicKey = fs.readFileSync(path.join(__dirname, file), 'utf8');
  }
  return publicKey;
}

const b64url = buf => Buffer.from(buf).toString('base64')
  .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/**
 * The assertion that says "I am this service", signed by the service's own
 * key. PS384 is the only algorithm Yoti accepts, and the salt has to match the
 * digest length, which is what JWS requires of PS*.
 */
function assertion(pem) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'PS384', typ: 'JWT' }));
  const body = b64url(JSON.stringify({
    iss: 'sdk:' + SDK_ID,
    sub: 'sdk:' + SDK_ID,
    aud: AUTH_URL,
    jti: crypto.randomUUID(),
    iat: now,
    exp: now + 30 * 60,
  }));
  const sig = crypto.sign('sha384', Buffer.from(head + '.' + body), {
    key: pem,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
  });
  return head + '.' + body + '.' + b64url(sig);
}

/**
 * A token, kept until it is nearly out of time.
 *
 * Yoti are explicit that you must not mint one per request — there is a cap of
 * 200 live at once per service, and a function that asked for a fresh token
 * every call would burn through it.
 */
let held = { token: null, until: 0 };

async function accessToken(pem) {
  if (held.token && Date.now() < held.until) return held.token;

  const res = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: SCOPE,
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: assertion(pem),
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error('yoti auth → ' + res.status + ' ' + text.slice(0, 200));

  const json = JSON.parse(text);
  if (!json.access_token) throw new Error('yoti auth gave no token');
  // A minute's grace, so a token can't expire between here and the call.
  const life = Number(json.expires_in) || 30 * 60;
  held = { token: json.access_token, until: Date.now() + (life - 60) * 1000 };
  return held.token;
}

async function yoti(method, at, body, key) {
  const res = await fetch(BASE + at, {
    method,
    headers: {
      Authorization: 'Bearer ' + await accessToken(key),
      'Content-Type': 'application/json',
      'Yoti-Sdk-Id': SDK_ID,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { /* not json */ }
  if (!res.ok) {
    // Yoti's own message where there is one: "missing field", "incorrect API
    // key" and so on are worth seeing in the log rather than a bare 400.
    const why = (json && (json.message || json.context || json.error_code)) || text.slice(0, 200);
    throw new Error('yoti ' + method + ' ' + at + ' → ' + res.status + ' ' + why);
  }
  return json;
}

/**
 * Starts a check and returns the page to send the person to.
 *
 * The token in reference_id is what Yoti will hand back; nothing about the
 * person goes to them, not their uid, not their name, not their email.
 */
exports.ageStart = onCall({ secrets: [YOTI_KEY, YOTI_KEY_SANDBOX] }, async req => {
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  // Better to say so here than to send someone to a page that won't load.
  if (!SDK_ID) throw new HttpsError('failed-precondition', 'Age checks aren’t switched on yet.');

  const token = crypto.randomUUID();
  await db().collection('ageChecks').doc(token).set({
    uid, at: FieldValue.serverTimestamp(), done: false,
  });

  const session = await yoti('POST', '/sessions', {
    type: 'OVER',
    ttl: SESSION_TTL,
    age_estimation: {
      allowed: true,
      threshold: THRESHOLD,
      level: 'PASSIVE',          // the liveness test; Yoti allows no other value
      retry_limit: 3,
    },
    reference_id: token,
    notification_url: NOTIFY,
    callback: { auto: true, url: SITE + '/?checked=1' },
    cancel_url: SITE + '/',
    retry_enabled: true,
    resume_enabled: true,
    synchronous_checks: true,
  }, KEY.value());

  await db().collection('ageChecks').doc(token).update({ session: session.id });

  return {
    url: 'https://age.yoti.com?sessionId=' + session.id + '&sdkId=' + SDK_ID,
    // Only useful against the sandbox, where there is no camera to stand in
    // front of and the answer has to be mocked.
    session: SANDBOX ? session.id : null,
  };
});

/**
 * Sandbox only: says what Yoti should pretend happened, so the whole path —
 * notification, signature, the record it writes — can be tested without a face.
 */
exports.ageMock = onCall({ secrets: [YOTI_KEY, YOTI_KEY_SANDBOX] }, async req => {
  if (!SANDBOX) throw new HttpsError('failed-precondition', 'Only in the sandbox.');
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');

  const { session, pass = true } = req.data || {};
  if (!session) throw new HttpsError('invalid-argument', 'Which session?');

  // Yours to mock, not anyone else's.
  const mine = await db().collection('ageChecks').where('session', '==', session).limit(1).get();
  if (mine.empty || mine.docs[0].get('uid') !== uid) {
    throw new HttpsError('permission-denied', 'That isn’t your check.');
  }

  await yoti('PUT', '/sessions/' + session + '/response-config', {
    status: pass ? 'COMPLETE' : 'FAIL',
    // Over the threshold passes, under it fails — Yoti reads this against the
    // threshold the session was created with.
    age: pass ? THRESHOLD + 1 : THRESHOLD - 5,
    method: 'AGE_ESTIMATION',
  }, KEY.value());

  return { ok: true };
});

/** True when this really came from Yoti. */
function signed(body) {
  const { sequence_number: seq, signature, ...rest } = body;
  if (!signature) return false;
  // Yoti signs the notification with those two fields removed and every space
  // stripped. The object must be the one parsed from the body as it arrived:
  // rebuilding it field by field would reorder the keys and fail.
  const payload = JSON.stringify(rest).replace(/\s/g, '');
  const check = crypto.createVerify('RSA-SHA256');
  check.update(payload);
  try {
    return check.verify(
      { key: yotiKey(), padding: crypto.constants.RSA_PKCS1_PSS_PADDING },
      Buffer.from(signature, 'base64'),
    );
  } catch (e) {
    return false;
  }
}

/**
 * Yoti telling us how a check went.
 *
 * Answers 200 to everything, always: a notification Yoti doesn't hear back
 * about is one it will send again, and again. Whether it changed anything is a
 * separate question from whether it was received.
 */
exports.ageNotify = onRequest({ secrets: [YOTI_KEY, YOTI_KEY_SANDBOX] }, async (req, res) => {
  const done = (why) => { console.log('[ageNotify]', why); res.status(200).send('ok'); };

  if (req.method !== 'POST') return done('not a post');
  const body = req.body;
  if (!body || typeof body !== 'object') return done('no body');

  if (!signed(body)) return done('signature did not verify — ignored');

  // A replayed notification from weeks ago shouldn't open anything.
  const when = Number(body.timestamp) * 1000;
  if (Number.isFinite(when) && Math.abs(Date.now() - when) > NOTIFY_WINDOW) {
    return done('too old: ' + body.timestamp);
  }

  // Notifications arrive for every attempt, so a FAIL may be followed by a
  // pass. Only a COMPLETE means anything here; everything else is left alone.
  if (body.state !== 'COMPLETE') return done('state ' + body.state);

  const token = body.reference_id;
  if (!token) return done('no reference_id');

  const ref = db().collection('ageChecks').doc(String(token));
  const snap = await ref.get();
  if (!snap.exists) return done('unknown check ' + token);

  const uid = snap.get('uid');
  if (!uid) return done('check has no person');

  // They are over the threshold, so they are already an adult: the moment they
  // turned 18 is behind them. `by: 'face'` is the part no client can write.
  await db().collection('ages').doc(uid).set({
    adultAt: Date.now(),
    by: 'face',
    checkedAt: FieldValue.serverTimestamp(),
    evidence: body.evidence_id || null,
  }, { merge: true });

  await ref.update({ done: true, at: FieldValue.serverTimestamp() });
  return done('passed: ' + uid);
});
