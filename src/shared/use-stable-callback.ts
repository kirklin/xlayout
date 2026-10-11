import * as React from "react";

/**
 * Returns a function with a stable identity that always calls the latest `callback`,
 * so handlers can be passed to effects and listeners without re-subscribing.
 */
export function useStableCallback<Args extends unknown[], Result>(
  callback: ((...args: Args) => Result) | undefined,
): (...args: Args) => Result | undefined {
  const callbackRef = React.useRef(callback);
  React.useInsertionEffect(() => {
    callbackRef.current = callback;
  });
  return React.useCallback((...args: Args) => callbackRef.current?.(...args), []);
}
