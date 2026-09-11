import { useEffect, useState } from 'react';
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
export const PLUS_TEST_MODE = true;

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

export const subscribePlus = () => httpsCallable(functions, 'plusSubscribe')();
export const cancelPlus = () => httpsCallable(functions, 'plusCancel')();
