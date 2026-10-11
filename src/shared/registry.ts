import * as React from "react";

/**
 * The entries parts register from their refs, as `[entries, register, refresh]`. However many
 * register in one commit, the list is built once, in the order `order` gives it or else in the
 * order they registered, so mounting a long list costs a single sort. `refresh` builds the list
 * again, for when the parts' elements moved.
 */
export function useRegistry<T>(order?: (entries: readonly T[]) => T[]): [readonly T[], (entry: T) => () => void, () => void] {
  const registeredRef = React.useRef(new Set<T>());
  // Whether an update is queued that will read every registration made until it runs.
  const queuedRef = React.useRef(false);
  const [entries, setEntries] = React.useState<readonly T[]>([]);
  const refresh = React.useCallback(() => {
    if (queuedRef.current) {
      return;
    }
    queuedRef.current = true;
    setEntries((current) => {
      queuedRef.current = false;
      const registered = [...registeredRef.current];
      const next = order ? order(registered) : registered;
      return next.length === current.length && next.every((entry, index) => entry === current[index]) ? current : next;
    });
  }, [order]);
  const register = React.useCallback((entry: T) => {
    registeredRef.current.add(entry);
    refresh();
    return () => {
      registeredRef.current.delete(entry);
      refresh();
    };
  }, [refresh]);
  return [entries, register, refresh];
}
