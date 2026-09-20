const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const Stripe = require('stripe');
const { STRIPE_SECRET } = require('./stripe');

/**
 * Tips on live streams, paid to the streamer, with Codera's cut.
 *
 * Each streamer has their own Stripe account (Connect, Accounts v2) that Codera
 * charges on behalf of. A streamer links one once
 * (payoutsLink sends them through Stripe's own onboarding) and from then on a
 * tip is a direct charge on their account: the money is theirs, Stripe's card
 * fee comes out of it, and Codera's COMMISSION is taken as an application fee
 * into Codera's own balance. Stripe pays the streamer out to their bank.
 *
 * A streamer who hasn't set up payouts yet can still be tipped. That payment is
 * made to Codera instead, and the streamer's share (the tip less Codera's 3% and
 * Stripe's fee, as for a direct charge) is kept in heldTips/{paymentId} until
 * their account can take it, then sent across, each tip once. payouts/{uid}.ready
 * says which way a tip goes; only this file writes it.
 *
 * The chat message that shows a tip is written here too, and only after Stripe
 * confirms the payment. The database rules refuse any client message that
 * claims a tip.
 *
 * Connect has to be switched on for the Stripe account first: Stripe dashboard
 * → Connect → Get started. Until then payoutsLink fails with a message saying so.
 */

const COMMISSION = 0.03;                        // Codera keeps 3% of every tip
const AMOUNTS = [200, 500, 1000, 2000, 5000];   // in US cents: $2 to $50

const db = () => getFirestore();
const stripe = () => new Stripe(STRIPE_SECRET.value());
const live = () => STRIPE_SECRET.value().startsWith('sk_live');
// Test and live mode are separate worlds; each keeps its own account id.
const accountField = () => (live() ? 'stripeAccount' : 'stripeAccountTest');

function uidOf(req) {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  return req.auth.uid;
}

async function accountOf(uid) {
  const snap = await db().doc(`users/${uid}`).get();
  return snap.get(accountField()) || null;
}

/** Where an account stands, from what Stripe returned. */
function standing(account) {
  const conf = (account && account.configuration) || {};
  const caps = (conf.merchant && conf.merchant.capabilities) || {};
  const incoming = (conf.recipient && conf.recipient.capabilities) || {};
  const status = cap => (cap && cap.status) || 'none';
  const due = ((account && account.requirements && account.requirements.entries) || [])
    .filter(e => e.minimum_deadline && e.minimum_deadline.status !== 'eventually_due');
  return {
    ready: status(caps.card_payments) === 'active',
    payoutsEnabled: status(caps.stripe_balance && caps.stripe_balance.payouts) === 'active',
    // Can be sent money from Codera: needed for tips given before setup.
    transfers: status(incoming.stripe_balance && incoming.stripe_balance.stripe_transfers) === 'active',
    needsInfo: due.length > 0,
  };
}

/** Whether an account can take payments now, written where the apps can read it. */
async function recordStatus(uid, account) {
  const s = standing(account);
  await db().doc(`payouts/${uid}`).set({
    ready: s.ready,
    payoutsEnabled: s.payoutsEnabled,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return s;
}

const fetchAccount = id => stripe().v2.core.accounts.retrieve(id, {
  include: ['configuration.merchant', 'configuration.recipient', 'requirements'],
});

// Lets an account receive the tips Codera held for it.
const RECIPIENT = { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } };

const heldOf = async uid => (await db().doc(`users/${uid}`).get()).get('tipsHeld') || 0;

/**
 * Keeps a tip made before the streamer could be paid. The share they are owed
 * is worked out the way a direct charge would split it: Codera's 3% and
 * Stripe's fee come off. Once per payment, however often it is confirmed.
 */
async function hold(to, pi) {
  const charge = pi.latest_charge;
  const bt = charge && typeof charge === 'object' ? charge.balance_transaction : null;
  let stripeFee = Math.round(pi.amount * 0.029) + 30;   // until Stripe says exactly
  if (bt && typeof bt === 'object') {
    // Stripe's fee is in Codera's own currency; the tip's share is in the tip's.
    stripeFee = bt.currency === pi.currency ? bt.fee : Math.round(bt.fee / (bt.exchange_rate || 1));
  }
  const net = Math.max(0, pi.amount - Math.round(pi.amount * COMMISSION) - stripeFee);
  const ref = db().doc(`heldTips/${pi.id}`);
  await db().runTransaction(async t => {
    if ((await t.get(ref)).exists) return;
    t.create(ref, {
      to, amount: pi.amount, net, currency: pi.currency,
      charge: typeof charge === 'object' ? charge.id : charge,
      paid: false, at: FieldValue.serverTimestamp(),
    });
    t.set(db().doc(`users/${to}`), { tipsHeld: FieldValue.increment(net) }, { merge: true });
  });
}

/**
 * Sends a streamer the tips held for them. Each goes out of the payment it
 * came from (so Codera's balance and currency don't come into it), with a key
 * that stops Stripe sending the same one twice. Hands back how much went.
 */
async function releaseHeld(uid, account) {
  const held = await db().collection('heldTips').where('to', '==', uid).where('paid', '==', false).get();
  let sent = 0;
  for (const d of held.docs) {
    const h = d.data();
    if (!h.net) { await d.ref.update({ paid: true }); continue; }
    try {
      const t = await stripe().transfers.create({
        amount: h.net,
        currency: h.currency || 'usd',
        destination: account,
        source_transaction: h.charge,
        description: 'Tips on Codera from before payouts were set up',
        metadata: { uid, payment: d.id },
      }, { idempotencyKey: 'held-tip-' + d.id });
      await d.ref.update({ paid: true, transfer: t.id, paidAt: FieldValue.serverTimestamp() });
      sent += h.net;
    } catch (e) {
      console.error('Sending held tip', d.id, (e && e.code) || '', (e && e.message) || e);
      break;   // tried again next time
    }
  }
  if (sent) await db().doc(`users/${uid}`).set({ tipsHeld: FieldValue.increment(-sent) }, { merge: true });
  return sent;
}

function connectError(e) {
  const text = String((e && e.message) || e);
  console.error('Stripe Connect:', (e && e.type) || '', (e && e.code) || '', text);
  if (/country/i.test(text) && /support|invalid|not available/i.test(text)) {
    return new HttpsError('invalid-argument', 'Stripe can’t pay out to that country yet.');
  }
  if (/signed up for Connect|Connect.*not.*enabled|platform profile|complete your platform|responsibilities|losses/i.test(text)) {
    return new HttpsError('failed-precondition',
      'Payouts aren’t switched on for Codera yet. (Stripe dashboard → Connect → Get started.)');
  }
  return new HttpsError('internal', 'Stripe didn’t answer. Try again in a moment.');
}

/**
 * Starts or continues a streamer's payout setup. Hands back Stripe's onboarding page.
 *
 * The streamer's account is the merchant of record for their tips (direct
 * charges), so Stripe's fees and any refunds or disputes are theirs, not
 * Codera's: Stripe collects fees and carries losses, which is what gives the
 * streamer the full Stripe dashboard.
 */
exports.payoutsLink = onCall({ secrets: [STRIPE_SECRET] }, async req => {
  const uid = uidOf(req);
  const back = req.data && typeof req.data.back === 'string' && req.data.back.startsWith('https://')
    ? req.data.back : 'https://codera-46b86.web.app/#/you';
  try {
    let id = await accountOf(uid);
    if (id) {
      let account = null;
      try { account = await fetchAccount(id); } catch (e) { id = null; }   // gone at Stripe
      if (account && !(account.applied_configurations || []).includes('recipient')) {
        await stripe().v2.core.accounts.update(id, { configuration: { recipient: RECIPIENT } })
          .catch(e => console.error('Adding recipient configuration:', e.message));
      }
      // Starting again (the wrong country, say) is allowed until tips are switched on.
      if (account && req.data && req.data.restart && !standing(account).ready) {
        await stripe().v2.core.accounts.close(id, { applied_configurations: account.applied_configurations })
          .catch(e => console.error('Closing unfinished account:', e.message));
        id = null;
      }
    }
    if (!id) {
      const country = req.data && typeof req.data.country === 'string' && /^[a-z]{2}$/i.test(req.data.country)
        ? req.data.country.toLowerCase() : null;
      if (!country) throw new HttpsError('invalid-argument', 'Pick your country first.');
      const profile = await db().doc(`profiles/${uid}`).get();
      const made = await stripe().v2.core.accounts.create({
        contact_email: req.auth.token.email || undefined,
        display_name: profile.get('username') || req.auth.token.name || undefined,
        dashboard: 'full',
        identity: { country },
        configuration: {
          merchant: { capabilities: { card_payments: { requested: true } } },
          recipient: RECIPIENT,
        },
        defaults: {
          responsibilities: { fees_collector: 'stripe', losses_collector: 'stripe' },
          profile: {
            product_description: 'Tips from viewers of live streams on Codera',
            business_url: 'https://codera-46b86.web.app',
          },
        },
        metadata: { uid },
      });
      id = made.id;
      await db().doc(`users/${uid}`).set({ [accountField()]: id }, { merge: true });
    }
    const link = await stripe().v2.core.accountLinks.create({
      account: id,
      use_case: {
        type: 'account_onboarding',
        account_onboarding: {
          configurations: ['merchant', 'recipient'],
          refresh_url: back,
          return_url: back,
        },
      },
    });
    return { url: link.url };
  } catch (e) {
    throw e instanceof HttpsError ? e : connectError(e);
  }
});

/** Where a streamer's payout setup stands, refreshed from Stripe. */
exports.payoutsStatus = onCall({ secrets: [STRIPE_SECRET] }, async req => {
  const uid = uidOf(req);
  const id = await accountOf(uid);
  const held = await heldOf(uid);
  if (!id) {
    await recordStatus(uid, null);
    return { hasAccount: false, ready: false, payoutsEnabled: false, held };
  }
  try {
    const s = await recordStatus(uid, await fetchAccount(id));
    const sent = held > 0 && s.transfers ? await releaseHeld(uid, id) : 0;
    return { hasAccount: true, ...s, held: held - sent };
  } catch (e) {
    throw connectError(e);
  }
});

/**
 * Where a streamer sees their balance and payouts. Their account has the full
 * Stripe dashboard, which they sign in to themselves.
 */
exports.payoutsDashboard = onCall({ secrets: [STRIPE_SECRET] }, async req => {
  const uid = uidOf(req);
  const id = await accountOf(uid);
  if (!id) throw new HttpsError('failed-precondition', 'Set up payouts first.');
  return { url: 'https://dashboard.stripe.com/' };
});

exports.tipIntent = onCall({ secrets: [STRIPE_SECRET] }, async req => {
  const uid = uidOf(req);
  const { streamId, amount, message } = req.data || {};
  if (typeof streamId !== 'string' || !streamId) {
    throw new HttpsError('invalid-argument', 'Which stream is this for?');
  }
  if (!AMOUNTS.includes(amount)) {
    throw new HttpsError('invalid-argument', 'Pick one of the tip amounts.');
  }

  const stream = await db().doc(`streams/${streamId}`).get();
  if (!stream.exists || !stream.get('live')) {
    throw new HttpsError('failed-precondition', 'That stream has ended.');
  }
  const to = stream.get('uid');
  if (to === uid) throw new HttpsError('failed-precondition', 'You can’t tip your own stream.');

  // Straight to the streamer when they can take it; otherwise to Codera, held for them.
  const account = await accountOf(to);
  const payouts = await db().doc(`payouts/${to}`).get();
  const direct = !!(account && payouts.get('ready'));
  if (direct && (await heldOf(to)) > 0) {
    await releaseHeld(to, account).catch(e => console.error('Sending held tips:', e.message));
  }

  const profile = await db().doc(`profiles/${uid}`).get();
  const name = profile.get('username') || req.auth.token.name || 'someone';
  const photo = profile.get('photoUrl') || req.auth.token.picture || '';

  const params = {
    amount,
    currency: 'usd',
    payment_method_types: ['card'],
    description: `Tip on Codera from ${name}`,
    metadata: {
      kind: 'tip', uid, streamId, to, name, photo, held: direct ? '' : '1',
      message: String(message || '').trim().slice(0, 200),
    },
  };
  if (direct) params.application_fee_amount = Math.round(amount * COMMISSION);
  const intent = await stripe().paymentIntents.create(params, direct ? { stripeAccount: account } : undefined);

  return {
    clientSecret: intent.client_secret, intentId: intent.id,
    account: direct ? account : null, livemode: intent.livemode,
  };
});

exports.tipConfirm = onCall({ secrets: [STRIPE_SECRET] }, async req => {
  const uid = uidOf(req);
  const { intentId, account } = req.data || {};
  // A tip paid to the streamer names their account; one Codera is holding names none.
  const direct = typeof account === 'string' && account.startsWith('acct_');
  if (typeof intentId !== 'string' || !intentId.startsWith('pi_') || (account != null && !direct)) {
    throw new HttpsError('invalid-argument', 'Which payment?');
  }

  const pi = direct
    ? await stripe().paymentIntents.retrieve(intentId, {}, { stripeAccount: account })
    : await stripe().paymentIntents.retrieve(intentId, { expand: ['latest_charge.balance_transaction'] });
  const m = pi.metadata || {};
  if (m.kind !== 'tip' || m.uid !== uid) {
    throw new HttpsError('permission-denied', 'That payment isn’t yours.');
  }
  // The account named must be the one the tip was actually for.
  if (direct ? (await accountOf(m.to)) !== account : m.held !== '1') {
    throw new HttpsError('permission-denied', 'That payment isn’t for this stream.');
  }
  if (pi.status !== 'succeeded') {
    throw new HttpsError('failed-precondition', 'That payment hasn’t gone through.');
  }
  if (!direct) await hold(m.to, pi);

  // The payment's id names the message, so confirming twice posts it once.
  try {
    await db().doc(`streams/${m.streamId}/chat/${pi.id}`).create({
      uid,
      authorName: m.name || 'someone',
      authorPhoto: m.photo || null,
      text: m.message || '',
      tip: pi.amount,
      currency: pi.currency,
      at: FieldValue.serverTimestamp(),
    });
    await db().doc(`streams/${m.streamId}`).update({ tips: FieldValue.increment(pi.amount) });
  } catch (e) {
    if (e.code !== 6) throw e;   // 6 = already exists: posted on an earlier call
  }
  return { ok: true };
});
