const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const crypto = require('crypto');

/**
 * Proving someone is old enough to be shown a link that leads off Codera.
 *
 * Persona does the checking, from a selfie: no document, no passport, ten
 * seconds. That matters more than convenience — a check that needs a driving
 * licence excludes most of the people we are checking, and a gate everyone
 * fails is not a gate. Where the selfie can't decide, the same Persona template
 * falls back to a government ID, which is the only honest way to handle the
 * nineteen-year-old a face estimate wrongly refuses.
 *
 * Codera never sees the face. It goes from their camera to Persona, Persona
 * deletes it once it has an answer, and what reaches us is one word.
 *
 * Everything rests on that word being real, because the record it writes is
 * what opens the links row. So nothing the browser says is believed: ageStart
 * hands out a link and nothing else, the answer arrives as a signed webhook,
 * and the inquiry is read back from Persona's own API before anything is
 * written — a webhook payload can have attributes stripped from it by a
 * dashboard setting, so the payload says *which* inquiry to go and ask about
 * rather than being taken as the answer itself.
 */

const PERSONA_KEY = defineSecret('PERSONA_KEY');
const PERSONA_WEBHOOK_SECRET = defineSecret('PERSONA_WEBHOOK_SECRET');

const API = 'https://api.withpersona.com/api/v1';
// Pinned deliberately. Persona's own examples disagree with each other about
// which version to send, and an unpinned request follows whatever the key is
// set to in their dashboard — which is somebody else's setting to change.
const VERSION = '2025-12-08';

// From the Persona dashboard: the template that runs a selfie age estimate and
// falls back to a document. Not secret — it names a flow, and Persona puts it
// in the URL the browser opens.
const TEMPLATE = null;

const ADULT_AGE = 18;
const SITE = 'https://learncodera.com';

const db = () => getFirestore();

async function persona(method, at, body, key) {
  const res = await fetch(API + at, {
    method,
    headers: {
      Authorization: 'Bearer ' + key,
      'Persona-Version': VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { /* not json */ }
  if (!res.ok) {
    const why = (json && json.errors && json.errors[0] && json.errors[0].title) || text.slice(0, 200);
    throw new Error('persona ' + method + ' ' + at + ' → ' + res.status + ' ' + why);
  }
  return json;
}

/**
 * Starts a check and returns the link to send the person to.
 *
 * Persona is told an opaque token, never a Codera uid: ageChecks/{token} is
 * what turns their answer back into a person, and it never leaves our side.
 * A one-time link rather than a plain inquiry URL, because a link carrying a
 * session token can be used more than once by anyone who gets hold of it.
 */
exports.ageStart = onCall({ secrets: [PERSONA_KEY] }, async req => {
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  if (!TEMPLATE) throw new HttpsError('failed-precondition', 'Age checks aren’t switched on yet.');

  const token = crypto.randomUUID();
  await db().collection('ageChecks').doc(token).set({
    uid, at: FieldValue.serverTimestamp(), done: false, by: 'persona',
  });

  let made;
  try {
    made = await persona('POST', '/inquiries', {
      data: {
        attributes: {
          'inquiry-template-id': TEMPLATE,
          // Deprecated in favour of the meta field below, but it is this one
          // that comes back on the webhook, so both are set.
          'reference-id': token,
          'redirect-uri': SITE + '/#/you',
        },
      },
      meta: {
        'auto-create-account-reference-id': token,
        'auto-create-one-time-link': true,
      },
    }, PERSONA_KEY.value());
  } catch (e) {
    console.error('[ageStart]', e.message);
    throw new HttpsError('internal', 'Couldn’t start the check. Try again shortly.');
  }

  const inquiry = made.data && made.data.id;
  await db().collection('ageChecks').doc(token).update({ inquiry: inquiry || null });

  return {
    url: (made.meta && made.meta['one-time-link'])
      || 'https://inquiry.withpersona.com/verify?inquiry-id=' + inquiry,
    inquiry,
  };
});

/** True when this really came from Persona. */
function signed(header, raw, secret) {
  if (!header || !raw) return false;
  // During a secret rotation the header carries two space-separated sets of
  // pairs, and either may be the live one.
  const sets = String(header).split(' ');
  const first = sets[0].split(',')[0];
  const t = first.includes('=') ? first.split('=')[1] : '';
  if (!t) return false;

  const mine = crypto.createHmac('sha256', secret).update(t + '.' + raw).digest('hex');
  return sets.some(set => {
    const found = set.match(/v1=([^,]+)/);
    if (!found) return false;
    try {
      // Throws on a length mismatch rather than returning false, so it is the
      // comparison that has to be guarded, not the result.
      return crypto.timingSafeEqual(Buffer.from(mine), Buffer.from(found[1]));
    } catch (e) { return false; }
  });
}

/**
 * Persona telling us how a check went.
 *
 * Answers 200 to everything, always, and quickly: Persona gives five seconds
 * and then redelivers, up to seven more times over a day and a half. Whether
 * a message changed anything is a separate question from whether it arrived.
 */
exports.personaNotify = onRequest(
  { secrets: [PERSONA_KEY, PERSONA_WEBHOOK_SECRET] },
  async (req, res) => {
    const done = why => { console.log('[personaNotify]', why); res.status(200).send('ok'); };

    if (req.method !== 'POST') return done('not a post');
    const raw = req.rawBody ? req.rawBody.toString('utf8') : '';
    if (!signed(req.headers['persona-signature'], raw, PERSONA_WEBHOOK_SECRET.value())) {
      return done('signature did not verify — ignored');
    }

    let event;
    try { event = JSON.parse(raw); } catch (e) { return done('not json'); }

    const attr = (event.data && event.data.attributes) || {};
    const name = attr.name || '';
    if (!/^inquiry\.(completed|approved)$/.test(name)) return done('event ' + name);

    const sent = (attr.payload && attr.payload.data) || {};
    const token = sent.attributes && sent.attributes['reference-id'];
    const inquiry = sent.id;
    if (!token) return done('no reference on ' + name);

    const ref = db().collection('ageChecks').doc(String(token));
    const snap = await ref.get();
    if (!snap.exists) return done('unknown check ' + token);
    const uid = snap.get('uid');
    if (!uid) return done('check has nobody on it');
    if (snap.get('done')) return done('already recorded');

    // Asked of Persona directly rather than believed from the message: a
    // dashboard setting can strip attributes out of a webhook, and a stripped
    // payload must not read as a pass.
    let truth;
    try {
      truth = await persona('GET', '/inquiries/' + inquiry, null, PERSONA_KEY.value());
    } catch (e) {
      // Worth another delivery — throwing would be, but Persona reads a
      // non-200 as failure, so ask for the retry by answering nothing else.
      console.error('[personaNotify] could not read back', e.message);
      res.status(500).send('retry');
      return;
    }

    const status = truth.data && truth.data.attributes && truth.data.attributes.status;
    if (status !== 'approved' && status !== 'completed') {
      return done('inquiry is ' + status);
    }

    // Persona answers the question it was asked — over the threshold or not —
    // rather than handing back an age. So the record says they are an adult
    // now, and `by` says who decided: never the person themselves.
    await db().collection('ages').doc(uid).set({
      adultAt: Date.now(),
      by: 'face',
      checkedAt: FieldValue.serverTimestamp(),
      evidence: inquiry || null,
    }, { merge: true });

    await ref.update({ done: true, passed: true, at: FieldValue.serverTimestamp() });
    return done('passed: ' + uid + ' (' + ADULT_AGE + '+)');
  });

/**
 * Sandbox only, and the reason a face is not needed to test any of this:
 * Persona will act out a whole inquiry on request, firing the same events a
 * real one would.
 */
exports.ageSimulate = onCall({ secrets: [PERSONA_KEY] }, async req => {
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  if (!String(PERSONA_KEY.value()).startsWith('persona_sandbox')) {
    throw new HttpsError('failed-precondition', 'Only in the sandbox.');
  }

  const { inquiry, pass = true } = req.data || {};
  if (!inquiry) throw new HttpsError('invalid-argument', 'Which inquiry?');

  const mine = await db().collection('ageChecks').where('inquiry', '==', inquiry).limit(1).get();
  if (mine.empty || mine.docs[0].get('uid') !== uid) {
    throw new HttpsError('permission-denied', 'That isn’t your check.');
  }

  await persona('POST', '/inquiries/' + inquiry + '/perform-simulate-actions', {
    meta: {
      'simulate-actions': [
        { type: 'start_inquiry' },
        { type: 'complete_inquiry' },
        { type: pass ? 'approve_inquiry' : 'decline_inquiry' },
      ],
    },
  }, PERSONA_KEY.value());

  return { ok: true };
});
