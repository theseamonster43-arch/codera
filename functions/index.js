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

// Community Standards: every new post screened, and reports acted on.
const moderation = require('./moderation');

exports.screenPost = moderation.screenPost;
exports.onReport = moderation.onReport;
