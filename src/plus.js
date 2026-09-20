import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import { auth, db, functions } from './firebase';

/**
 * Codera Plus, from the app's side.
 *
 * The app only ever reads Plus status. Turning it on or off goes through the
 * plusSubscribe / plusCancel Cloud Functions; the database refuses writes from
 * here, so a modified app still can't give itself Plus.
 */

export const PLUS_PRICE = '$10';
export const PLUS_INTERVAL = 'month';

/**
 * No payment is taken yet — mirrors TEST_MODE in functions/index.js. Shown on
 * the Plus screen so nobody thinks they have been charged.
 */
export const PLUS_TEST_MODE = false;

/** Live Plus status for whoever is signed in. */
export function usePlus() {
  const uid = auth.currentUser?.uid;
  const [state, setState] = useState({ loading: true, plus: null });

  useEffect(() => {
    if (!uid) return undefined;
    return onSnapshot(
      doc(db, 'users', uid),
      snap => setState({ loading: false, plus: snap.get('plus') || null }),
      // No record, or unreadable: treat as not subscribed rather than hanging.
      () => setState({ loading: false, plus: null }),
    );
  }, [uid]);

  const p = state.plus;
  const endsAt = p?.endsAt?.toMillis ? p.endsAt.toMillis() : 0;
  // Decided on the phone from endsAt as well as `active`, so Plus lapses on
  // time even though nothing on the server flips it off when the period ends.
  const active = !!p?.active && endsAt > Date.now();

  return {
    loading: state.loading,
    active,
    cancelled: active && !!p.cancelled,
    test: !!p?.test,
    endsAt,
  };
}

/** "Oct 11" — the day Plus renews or runs out. */
export function plusDate(ms) {
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Starts a subscription. Payment happens on Stripe's own pages in a browser,
 * so this hands back the address to send someone to rather than a yes or no.
 */
export const subscribePlus = () => httpsCallable(functions, 'plusCheckout')();
export const cancelPlus = () => httpsCallable(functions, 'plusCancel')();

// ---- paying inside the app ----------------------------------------------------

/**
 * Whether this build takes the card itself, rather than sending people to the
 * website to pay.
 *
 * Android only. An APK handed out from Codera's own site, or through Samsung's
 * store, is not bound by Google Play's billing rules, so it may take payment
 * with Stripe directly. iOS has no such route: an app on the App Store selling
 * a subscription must use Apple's own purchases, so iOS keeps the web handoff.
 *
 * A build that goes onto Google Play must set this to false before it ships.
 */
export const IN_APP_PAYMENTS = Platform.OS === 'android';

/**
 * Stripe's publishable keys. Public by design: they can start a payment and do
 * nothing else. The secret key never leaves Google Secret Manager.
 */
export const STRIPE_PK = {
  live: 'pk_live_51UEWrl6MmwHJvfDUwlK1NpA8DibVh1As0WA33jyt2SN5RVHvdtiqiYbUPZZEMkuWNy4nbj2k4wHSNxx1Lbh4pAfg00t1oM0YIw',
  test: 'pk_test_51UEWrl6MmwHJvfDUDKvxB0xnxR6xI0CKxFrLeRDCruLRHupCkLFBTLSBT0AhQm6XgHXrx1j84hZVdtJ1v2xR4yF400YEE2TpNO',
};

/**
 * A theme colour as the plain six-digit hex Stripe's native fields insist on.
 *
 * The theme's borders are translucent rgba(), which the sheet refuses. Hex with
 * an alpha channel is read in a different byte order on Android than on iOS, so
 * instead the colour is laid over the background it will sit on and flattened
 * into the solid colour that actually appears.
 */
export function solid(color, under) {
  const m = /^rgba?\(([^)]+)\)$/.exec(String(color).trim());
  if (!m) return color;
  const [r, g, b, a = 1] = m[1].split(',').map(Number);
  const base = String(under).replace('#', '');
  const ur = parseInt(base.slice(0, 2), 16);
  const ug = parseInt(base.slice(2, 4), 16);
  const ub = parseInt(base.slice(4, 6), 16);
  const mix = (top, bottom) => Math.round(top * a + bottom * (1 - a));
  return '#' + [mix(r, ur), mix(g, ug), mix(b, ub)]
    .map(v => v.toString(16).padStart(2, '0')).join('');
}
