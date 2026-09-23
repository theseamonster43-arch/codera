const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const Stripe = require('stripe');

/**
 * Codera Plus, paid for with Stripe.
 *
 * The secret key is never in this repository and never in the app: it lives in
 * Google Secret Manager and is handed to these functions at run time. Set it
 * once, from your own machine:
 *
 *   firebase functions:secrets:set STRIPE_SECRET
 *   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
 *
 * Nothing in the browser ever sees it. The page sends people to Stripe's own
 * checkout, so card details never touch Codera at all — which is also what
 * keeps this out of the harder half of PCI compliance.
 *
 * Plus is switched on by Stripe telling us it was paid for (the webhook below),
 * never by the app asking. The database rules refuse every client write to
 * users/{uid}, so a modified app cannot grant itself anything.
 */

const STRIPE_SECRET = defineSecret('STRIPE_SECRET');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');

// Shared with tips.js, which charges through the same Stripe account.
exports.STRIPE_SECRET = STRIPE_SECRET;

const PRICE = { amount: 1000, currency: 'usd', interval: 'month' };  // $10 a month
const PRODUCT_NAME = 'Codera Plus';

/** Where Stripe sends people back to. */
const SITE = 'https://learncodera.com';

const db = () => getFirestore();
const userDoc = uid => db().doc(`users/${uid}`);

const stripe = () => new Stripe(STRIPE_SECRET.value());

function uidOf(req) {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  return req.auth.uid;
}

/**
 * The Stripe customer for this account, made once and remembered.
 *
 * Keyed to the Firebase uid rather than the email, so changing an email address
 * never splits one person into two customers.
 */
async function customerFor(uid, email) {
  // Test and live are separate worlds: a customer made with one key does not
  // exist to the other, so each mode remembers its own. The unsuffixed field is
  // the live one, which is what accounts created before test mode already hold.
  const live = STRIPE_SECRET.value().startsWith('sk_live');
  const field = live ? 'stripeCustomerId' : 'stripeCustomerIdTest';

  const snap = await userDoc(uid).get();
  const existing = snap.get(field);
  if (existing) {
    // It may also have been deleted at Stripe since. Better a fresh customer
    // than an error nobody can act on.
    try {
      const found = await stripe().customers.retrieve(existing);
      if (found && !found.deleted) return existing;
    } catch (e) { /* gone: fall through and make another */ }
  }

  const made = await stripe().customers.create({
    email: email || undefined,
    metadata: { uid },
  });
  await userDoc(uid).set({ [field]: made.id }, { merge: true });
  return made.id;
}

/**
 * Starts a subscription: hands back the address of a Stripe checkout page.
 *
 * Nothing is granted here. Plus is written only when Stripe reports the money
 * as taken, which is the webhook's job.
 */
exports.plusCheckout = onCall({ secrets: [STRIPE_SECRET] }, async req => {
  const uid = uidOf(req);
  const email = req.auth.token.email || null;

  // Only a subscription Stripe knows about stands in the way of starting one.
  // Plus handed out by the old test mode has no subscription behind it, and
  // must not block the person holding it from ever paying for the real thing.
  const snap = await userDoc(uid).get();
  const plus = snap.get('plus');
  const paid = plus && plus.active && plus.subscriptionId
    && plus.endsAt && plus.endsAt.toMillis() > Date.now();
  if (paid) throw new HttpsError('failed-precondition', 'You already have Plus.');

  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    // Charged in the customer's own currency, converted by Stripe at its own
    // rate. The price is set in dollars here and Stripe presents the local
    // amount, so what someone is shown is what leaves their account — no
    // approximation, and no second conversion by their bank.
    adaptive_pricing: { enabled: true },
    // Named outright rather than left to the dashboard's payment-method
    // settings: an account with none switched on for this currency cannot open
    // a checkout at all, and the error it gives says nothing about why.
    payment_method_types: ['card'],
    customer: await customerFor(uid, email),
    client_reference_id: uid,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: PRICE.currency,
        unit_amount: PRICE.amount,
        recurring: { interval: PRICE.interval },
        product_data: {
          name: PRODUCT_NAME,
          description: 'No ads on shorts or videos, every new Plus perk first, '
            + 'and cancel whenever you like.',
          // Stripe will not render an SVG, so this is a PNG of the mark served
          // from the site itself.
          images: [`${SITE}/brand/codera-plus-wide.png`],
        },
      },
    }],
    // Only what is needed to take the money: no phone number, and an address
    // only where the card demands one.
    billing_address_collection: 'auto',
    phone_number_collection: { enabled: false },
    locale: 'auto',
    custom_text: {
      submit: { message: 'Plus starts the moment this goes through.' },
      after_submit: { message: 'Thanks for keeping Codera going.' },
    },
    // Carried through to the subscription, so the webhook knows whose it is
    // even when it arrives days later for a renewal.
    subscription_data: { metadata: { uid } },
    allow_promotion_codes: true,
    // The query goes before the hash, or the router reads "plus?done=1"
    // as a page it has never heard of and shows the feed instead.
    success_url: `${SITE}/?paid=1#/plus`,
    cancel_url: `${SITE}/#/plus`,
  });

  return { url: session.url };
});

/**
 * The same subscription, as a form that lives inside Codera's own page.
 *
 * Hands back the secret that lets the page mount Stripe's embedded checkout,
 * so nobody is sent off to stripe.com — while the card itself is still typed
 * into Stripe's frame, never into anything of ours.
 */
exports.plusEmbedded = onCall({ secrets: [STRIPE_SECRET] }, async req => {
  const uid = uidOf(req);
  const email = req.auth.token.email || null;

  const snap = await userDoc(uid).get();
  const plus = snap.get('plus');
  const paid = plus && plus.active && plus.subscriptionId
    && plus.endsAt && plus.endsAt.toMillis() > Date.now();
  if (paid) throw new HttpsError('failed-precondition', 'You already have Plus.');

  const base = {
    // Stripe renamed this from 'embedded' in the 2026 API versions.
    ui_mode: 'embedded_page',
    mode: 'subscription',
    // As above: presented and charged in the customer's own currency.
    adaptive_pricing: { enabled: true },
    payment_method_types: ['card'],
    customer: await customerFor(uid, email),
    client_reference_id: uid,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: PRICE.currency,
        unit_amount: PRICE.amount,
        recurring: { interval: PRICE.interval },
        product_data: {
          name: PRODUCT_NAME,
          description: 'No ads on shorts or videos, every new Plus perk first, '
            + 'and cancel whenever you like.',
        },
      },
    }],
    subscription_data: { metadata: { uid } },
    // Nobody is sent anywhere afterwards: the page is already the right place,
    // and it turns itself over to "you have Plus" when the webhook lands.
    redirect_on_completion: 'never',
    billing_address_collection: 'auto',
    custom_text: { submit: { message: 'Plus starts the moment this goes through.' } },
  };

  /**
   * Codera is a dark app, so the form inside it should be dark too.
   *
   * Whether Checkout accepts an appearance at all depends on the API version
   * the account is on, and there is no way to ask beforehand — so it is tried,
   * and dropped if this account's Stripe does not know the field. Everything
   * else about the session is identical either way.
   */
  let session;
  try {
    session = await stripe().checkout.sessions.create({
      ...base,
      appearance: { theme: 'night' },
    });
  } catch (e) {
    if (!/appearance/i.test(e.message || '')) throw e;
    console.info('This Stripe API has no appearance on Checkout; using branding.');
    session = await stripe().checkout.sessions.create(base);
  }

  // livemode tells the page which publishable key it must use: a test session
  // mounted with a live key fails with an error that explains nothing.
  return { clientSecret: session.client_secret, livemode: session.livemode };
});

/**
 * The price everything is sold at, made once and remembered.
 *
 * A subscription item needs a real Price, unlike a Checkout line item, so the
 * first payment creates the product and the price and keeps their ids. Test and
 * live keys have separate ones: an id from one mode means nothing in the other.
 */
async function priceId() {
  const live = STRIPE_SECRET.value().startsWith('sk_live');
  const field = live ? 'priceLive' : 'priceTest';
  const ref = db().doc('config/stripe');

  const cached = (await ref.get()).get(field);
  if (cached) return cached;

  const product = await stripe().products.create({
    name: PRODUCT_NAME,
    description: 'No ads on shorts or videos, every new Plus perk first, '
      + 'and cancel whenever you like.',
  });
  const price = await stripe().prices.create({
    product: product.id,
    currency: PRICE.currency,
    unit_amount: PRICE.amount,
    recurring: { interval: PRICE.interval },
  });
  await ref.set({ [field]: price.id }, { merge: true });
  return price.id;
}

/**
 * The secret that lets a page confirm an invoice's payment.
 *
 * Stripe moved this from the invoice's payment intent to a confirmation secret
 * in the 2025 API versions, and which one an account has depends on its API
 * version — so the new place is tried first and the old one after. Both are
 * reads of the same invoice, so asking twice costs nothing and creates nothing.
 */
async function invoiceSecret(invoiceId) {
  try {
    const inv = await stripe().invoices.retrieve(invoiceId, { expand: ['confirmation_secret'] });
    if (inv.confirmation_secret && inv.confirmation_secret.client_secret) {
      return inv.confirmation_secret.client_secret;
    }
  } catch (e) { /* older API: no such field to expand */ }

  const inv = await stripe().invoices.retrieve(invoiceId, { expand: ['payment_intent'] });
  return inv.payment_intent && inv.payment_intent.client_secret;
}

/**
 * Subscribing again after a cancellation, before the paid month is over.
 *
 * A new subscription, on a free trial that ends exactly when the old one does,
 * so today costs nothing and the first $10 falls on the day the old month runs
 * out. The card is collected now through the trial's setup step. The old
 * subscription is left to lapse on its own, as it was already going to.
 *
 * If the card is never added, the trial cancels itself at its end rather than
 * turning into a subscription with nothing to charge.
 */
async function renewal(uid, customer, plus) {
  const startsAt = Math.floor(plus.endsAt.toMillis() / 1000);

  // An unfinished attempt is picked up again, so pressing the button twice
  // does not leave two renewals queued behind the same month.
  const trialing = await stripe().subscriptions.list({
    customer, status: 'trialing', limit: 10, expand: ['data.pending_setup_intent'],
  });
  let next = trialing.data.find(x =>
    x.metadata && x.metadata.renewal === 'true' && x.pending_setup_intent);

  if (!next) {
    next = await stripe().subscriptions.create({
      customer,
      items: [{ price: await priceId() }],
      trial_end: startsAt,
      trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
        payment_method_types: ['card'],
      },
      metadata: { uid, renewal: 'true' },
      expand: ['pending_setup_intent'],
    });
  }

  let intent = next.pending_setup_intent;
  if (typeof intent === 'string') intent = await stripe().setupIntents.retrieve(intent);
  if (!intent || !intent.client_secret) {
    throw new HttpsError('internal', 'No card step to confirm.');
  }

  return {
    setupSecret: intent.client_secret,
    startsAt: startsAt * 1000,
    subscriptionId: next.id,
    livemode: !!next.livemode,
  };
}

/**
 * Starts a subscription that is waiting to be paid, and hands back what the
 * page needs to take the card itself.
 *
 * Unlike checkout, the form here is Codera's own: dark, in Codera's typeface,
 * with Codera's button. Stripe still owns the fields the number is typed into.
 */
exports.plusIntent = onCall({ secrets: [STRIPE_SECRET] }, async req => {
  const uid = uidOf(req);
  const email = req.auth.token.email || null;

  const snap = await userDoc(uid).get();
  const plus = snap.get('plus');
  const running = plus && plus.active && plus.subscriptionId
    && plus.endsAt && plus.endsAt.toMillis() > Date.now();
  if (running && !plus.cancelled) {
    throw new HttpsError('failed-precondition', 'You already have Plus.');
  }

  const customer = await customerFor(uid, email);

  // Cancelled, but still inside a month that is paid for: coming back is a
  // purchase like any other, except the first charge waits for that month to
  // run out rather than taking money twice for the same days.
  if (running && plus.cancelled) return renewal(uid, customer, plus);

  // An attempt that was started and abandoned is picked up again rather than
  // left behind: pressing Subscribe twice must not litter the account with
  // half-made subscriptions.
  const waiting = await stripe().subscriptions.list({
    customer, status: 'incomplete', limit: 1, expand: ['data.latest_invoice'],
  });

  let subscription = waiting.data[0];
  if (!subscription) {
    subscription = await stripe().subscriptions.create({
      customer,
      items: [{ price: await priceId() }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
        payment_method_types: ['card'],
      },
      metadata: { uid },
    });
  }

  const invoice = subscription.latest_invoice;
  const invoiceId = typeof invoice === 'string' ? invoice : invoice && invoice.id;
  if (!invoiceId) throw new HttpsError('internal', 'No invoice to pay.');

  const clientSecret = await invoiceSecret(invoiceId);
  if (!clientSecret) throw new HttpsError('internal', 'No payment to confirm.');

  return {
    clientSecret,
    subscriptionId: subscription.id,
    livemode: !!subscription.livemode,
  };
});

/**
 * Changing the card a subscription is charged to.
 *
 * Two steps. This one opens a card-saving step at Stripe for this customer and
 * hands back its secret; the page collects the card. Then plusCardSave checks
 * the card really was saved, by this account, and points the subscription at
 * it. Nothing is charged by either.
 */
exports.plusCard = onCall({ secrets: [STRIPE_SECRET] }, async req => {
  const uid = uidOf(req);
  const email = req.auth.token.email || null;

  const snap = await userDoc(uid).get();
  const subscriptionId = snap.get('plus.subscriptionId');
  if (!subscriptionId || !snap.get('plus.active')) {
    throw new HttpsError('failed-precondition', "You don't have Plus.");
  }

  const intent = await stripe().setupIntents.create({
    customer: await customerFor(uid, email),
    usage: 'off_session',
    payment_method_types: ['card'],
    metadata: { uid, subscriptionId },
  });

  return {
    setupSecret: intent.client_secret,
    setupIntentId: intent.id,
    livemode: !!intent.livemode,
  };
});

/**
 * The second step: make the newly saved card the one that gets charged.
 *
 * Everything is read back from Stripe rather than taken from the request —
 * whose card it is and which subscription it is for — so a client cannot point
 * someone else's subscription at a card, or its own at someone else's.
 */
exports.plusCardSave = onCall({ secrets: [STRIPE_SECRET] }, async req => {
  const uid = uidOf(req);
  const id = req.data && req.data.setupIntentId;
  if (!id || typeof id !== 'string') throw new HttpsError('invalid-argument', 'No card to save.');

  const intent = await stripe().setupIntents.retrieve(id);
  if (!intent.metadata || intent.metadata.uid !== uid) {
    throw new HttpsError('permission-denied', 'That card is not yours to save.');
  }
  if (intent.status !== 'succeeded' || !intent.payment_method) {
    throw new HttpsError('failed-precondition', "That card wasn't saved. Try again.");
  }

  const card = typeof intent.payment_method === 'string'
    ? intent.payment_method : intent.payment_method.id;

  await stripe().subscriptions.update(intent.metadata.subscriptionId, { default_payment_method: card });
  // And for anything billed to the customer outside the subscription.
  await stripe().customers.update(intent.customer, {
    invoice_settings: { default_payment_method: card },
  });

  return { ok: true };
});

/** Stops it renewing. Plus stays until the end of the period already paid for. */
exports.plusCancel = onCall({ secrets: [STRIPE_SECRET] }, async req => {
  const uid = uidOf(req);
  const snap = await userDoc(uid).get();
  const id = snap.get('plus.subscriptionId');

  if (!id) {
    // Plus from the old test mode: nothing was ever charged for it, so there is
    // nothing at Stripe to cancel. Taking the record away is the whole job.
    if (snap.get('plus.active')) {
      await userDoc(uid).set({ plus: { active: false, cancelled: false } }, { merge: true });
      return { ok: true, test: true };
    }
    throw new HttpsError('failed-precondition', "You don't have a subscription.");
  }

  await stripe().subscriptions.update(id, { cancel_at_period_end: true });
  // Written here as well as by the webhook, so the page changes at once rather
  // than whenever Stripe gets round to telling us.
  await userDoc(uid).set({ plus: { cancelled: true } }, { merge: true });
  return { ok: true };
});

/** Undoes a cancellation while the period is still running. */
exports.plusResume = onCall({ secrets: [STRIPE_SECRET] }, async req => {
  const uid = uidOf(req);
  const snap = await userDoc(uid).get();
  const id = snap.get('plus.subscriptionId');
  if (!id) throw new HttpsError('failed-precondition', "You don't have a subscription.");

  await stripe().subscriptions.update(id, { cancel_at_period_end: false });
  await userDoc(uid).set({ plus: { cancelled: false } }, { merge: true });
  return { ok: true };
});

/**
 * When the period being paid for runs out.
 *
 * Stripe moved this from the subscription onto its items in the 2025 API
 * versions, so both places are checked: which one a webhook arrives with
 * depends on the API version the endpoint was created under.
 */
function periodEnd(sub) {
  if (sub.current_period_end) return sub.current_period_end;
  const items = (sub.items && sub.items.data) || [];
  return items.reduce((latest, it) => Math.max(latest, it.current_period_end || 0), 0);
}

/** Writes what a Stripe subscription says into the account it belongs to. */
async function applySubscription(sub) {
  const uid = sub.metadata && sub.metadata.uid;
  if (!uid) return;

  const live = ['active', 'trialing', 'past_due'].includes(sub.status);

  // Someone who subscribed again has two subscriptions for a while: the old
  // one lapsing and the new one waiting to start. When the old one finally
  // ends, that must not switch off the Plus the new one is providing.
  if (!live) {
    const now = (await userDoc(uid).get()).get('plus');
    if (now && now.active && now.subscriptionId && now.subscriptionId !== sub.id) return;
  }
  // Nor should a renewal whose card was never added take over the record.
  if (sub.status === 'trialing' && sub.metadata && sub.metadata.renewal === 'true'
      && !sub.default_payment_method) return;
  const endsMs = periodEnd(sub) * 1000;

  await userDoc(uid).set({
    plus: {
      active: live,
      test: false,
      cancelled: !!sub.cancel_at_period_end,
      status: sub.status,
      subscriptionId: sub.id,
      price: { amount: PRICE.amount / 100, currency: 'USD', interval: PRICE.interval },
      since: Timestamp.fromMillis((sub.start_date || Date.now() / 1000) * 1000),
      endsAt: Timestamp.fromMillis(endsMs || Date.now()),
    },
  }, { merge: true });
}

/**
 * Stripe telling us what happened. This is the only thing that turns Plus on.
 *
 * Every message is checked against the signing secret first: without that
 * anybody could post "this person paid" at this address.
 *
 * Add the address in the Stripe dashboard (Developers → Webhooks):
 *   https://us-central1-codera-46b86.cloudfunctions.net/stripeWebhook
 * listening for checkout.session.completed, customer.subscription.updated,
 * customer.subscription.deleted and identity.verification_session.verified.
 */
exports.stripeWebhook = onRequest(
  { secrets: [STRIPE_SECRET, STRIPE_WEBHOOK_SECRET], cors: false },
  async (req, res) => {
    let event;
    try {
      event = stripe().webhooks.constructEvent(
        req.rawBody, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET.value());
    } catch (e) {
      // Unsigned or tampered with: say no and record nothing.
      res.status(400).send('bad signature');
      return;
    }

    try {
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        if (session.subscription) {
          const sub = await stripe().subscriptions.retrieve(session.subscription);
          // A session started before subscription_data existed still knows who
          // it was for, so fall back to that.
          if (!sub.metadata || !sub.metadata.uid) {
            sub.metadata = { uid: session.client_reference_id };
          }
          await applySubscription(sub);
        }
      } else if (event.type === 'customer.subscription.updated'
              || event.type === 'customer.subscription.deleted') {
        await applySubscription(event.data.object);
      } else if (event.type === 'identity.verification_session.verified') {
        // Required here rather than at the top: age.js reads STRIPE_SECRET from
        // this file, and two files requiring each other as they load leaves one
        // of them holding a half-built copy of the other.
        const said = await require('./age').identityVerified(event.data.object);
        console.log('[identity]', said);
      }
    } catch (e) {
      // Tell Stripe it did not land, so it tries again rather than dropping it.
      console.error('webhook', event.type, e);
      res.status(500).send('retry');
      return;
    }

    res.json({ received: true });
  });
