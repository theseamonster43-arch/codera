const { setGlobalOptions } = require('firebase-functions/v2');
const { initializeApp } = require('firebase-admin/app');

initializeApp();
// Next to the database (nam5), and capped so a runaway client can't scale it up.
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

/**
 * Codera Plus — $10 a month, taken by Stripe.
 *
 * Everything that decides whether someone has Plus lives in stripe.js. The
 * database rules refuse every write to users/{uid} from the app, so Plus is
 * granted by exactly one thing: Stripe telling us the money arrived.
 *
 * Before the first deploy, from your own machine:
 *
 *   firebase functions:secrets:set STRIPE_SECRET          # sk_live_… (rolled, never shared)
 *   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET  # whsec_… from the dashboard
 *
 * `plusSubscribe` is the same function as `plusCheckout` under the name the app
 * and the site already call, so older builds keep working.
 */
const stripe = require('./stripe');

exports.plusCheckout = stripe.plusCheckout;
exports.plusSubscribe = stripe.plusCheckout;
exports.plusEmbedded = stripe.plusEmbedded;
exports.plusIntent = stripe.plusIntent;
exports.plusCard = stripe.plusCard;
exports.plusCardSave = stripe.plusCardSave;
exports.plusCancel = stripe.plusCancel;
exports.stripeWebhook = stripe.stripeWebhook;

// Tips on live streams, paid to the streamer through Stripe Connect, 3% to Codera.
const tips = require('./tips');

exports.tipIntent = tips.tipIntent;
exports.tipConfirm = tips.tipConfirm;
exports.payoutsLink = tips.payoutsLink;
exports.payoutsStatus = tips.payoutsStatus;
exports.payoutsDashboard = tips.payoutsDashboard;

// Signing a television in, from a phone that is already signed in.
const tv = require('./tv');

exports.tvPairStart = tv.tvPairStart;
exports.tvPairApprove = tv.tvPairApprove;
exports.tvPairClaim = tv.tvPairClaim;

// Community Standards: every new post screened, and reports acted on.
//
// Not exported yet. Firebase refuses to deploy anything at all while a secret
// a function asks for is missing, so leaving these on would hold up every
// other function behind ANTHROPIC_API_KEY. The code is finished and dormant
// either way — web/app.js keeps MODERATION_START in the future until screening
// goes live. Put the key in and uncomment these two lines:
//
//   firebase functions:secrets:set ANTHROPIC_API_KEY --project codera-46b86
//
// const moderation = require('./moderation');
// exports.screenPost = moderation.screenPost;
// exports.onReport = moderation.onReport;

// Age checks. The result comes back through the Stripe webhook below, so
// there is nothing to export for it here. age-yoti.js holds the Yoti version,
// parked until that organisation is verified.
const age = require('./age');
const persona = require('./persona');
const where = require('./where');

// Persona is the way in: a selfie, with a document only where the selfie
// cannot decide. Stripe Identity stays in age.js, still wired to the Stripe
// webhook, as the way back if Persona ever goes dark.
exports.ageStart = persona.ageStart;

// Persona's answer comes back here, signed, and is checked before it is
// believed. ageSimulate is sandbox-only and acts out a whole inquiry, which
// is how a pass and a fail get tested without a camera.
exports.personaNotify = persona.personaNotify;
exports.ageSimulate = persona.ageSimulate;
exports.whereAmI = where.whereAmI;
