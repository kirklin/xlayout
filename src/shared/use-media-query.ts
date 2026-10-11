import * as React from "react";

/**
 * Whether `query` matches. Renders `serverMatches` on the server and during hydration,
 * then follows the real media query.
 */
export function useMediaQuery(query: string | undefined, serverMatches: boolean): boolean {
  const subscribe = React.useCallback((onChange: () => void) => {
    if (!query) {
      return () => {};
    }
    const list = window.matchMedia(query);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);
  const getSnapshot = React.useCallback(() => (query ? window.matchMedia(query).matches : serverMatches), [query, serverMatches]);
  const getServerSnapshot = React.useCallback(() => serverMatches, [serverMatches]);
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
