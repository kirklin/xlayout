import * as React from "react";

/** State kept outside React, which components read through selections of their own. */
export interface Store<T> {
  get: () => T;
  set: (next: T) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set: (next) => {
      if (Object.is(next, state)) {
        return;
      }
      state = next;
      for (const listener of [...listeners]) {
        listener();
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

interface Selection<T, R> {
  state: T;
  select: (state: T) => R;
  result: R;
}

/**
 * What `select` picks from the store. The component renders again only when that changes by
 * `isEqual`, so a store that many components read updates only the ones a change concerns.
 */
export function useStoreSelector<T, R>(store: Store<T>, select: (state: T) => R, isEqual: (a: R, b: R) => boolean = Object.is): R {
  const selectionRef = React.useRef<Selection<T, R> | null>(null);
  const getSelection = (): R => {
    const state = store.get();
    const previous = selectionRef.current;
    if (previous && previous.state === state && previous.select === select) {
      return previous.result;
    }
    const picked = select(state);
    // An equal pick keeps the earlier result, which tells React that nothing changed.
    const result = previous && isEqual(previous.result, picked) ? previous.result : picked;
    selectionRef.current = { state, select, result };
    return result;
  };
  return React.useSyncExternalStore(store.subscribe, getSelection, getSelection);
}
