import { useEffect, useState } from 'react';
import { subscribePosts } from './data';

/**
 * One live subscription shared by every screen.
 *
 * Home, Shorts and You all read posts. Each subscribing on its own would open
 * three identical Firestore listeners and bill three times for the same reads,
 * so the first screen to ask starts the listener and the last to leave stops it.
 */
let state = { posts: [], loading: true, error: null };
const listeners = new Set();
let unsubscribe = null;

function emit(next) {
  state = { ...state, ...next };
  listeners.forEach(l => l(state));
}

function start() {
  unsubscribe = subscribePosts(
    posts => emit({ posts, loading: false, error: null }),
    error => emit({ loading: false, error }),
  );
}

export default function usePosts() {
  const [snap, setSnap] = useState(state);

  useEffect(() => {
    listeners.add(setSnap);
    if (!unsubscribe) start();
    setSnap(state);
    return () => {
      listeners.delete(setSnap);
      if (listeners.size === 0 && unsubscribe) {
        unsubscribe();
        unsubscribe = null;
        state = { posts: [], loading: true, error: null };
      }
    };
  }, []);

  return snap;
}
