import { useEffect, useMemo, useState } from 'react';
import { subscribePosts } from './data';
import { useBlocked } from './safety';

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
  const blocked = useBlocked();

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

  // Filtered here rather than in the query: Firestore can't ask for "not in
  // this list" beyond ten entries, and a block should take effect the moment
  // it is made, not on the next fetch.
  return useMemo(
    () => (blocked.size ? { ...snap, posts: snap.posts.filter(p => !blocked.has(p.uid)) } : snap),
    [snap, blocked],
  );
}
