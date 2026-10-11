import * as React from "react";

type PossibleRef<T> = React.Ref<T> | undefined;
type RefCleanup = (() => void) | void;

function setRef<T>(ref: PossibleRef<T>, value: T | null): RefCleanup {
  if (typeof ref === "function") {
    return ref(value);
  }
  if (ref) {
    ref.current = value;
  }
}

export function composeRefs<T>(...refs: PossibleRef<T>[]): React.RefCallback<T> {
  return (node) => {
    const cleanups = refs.map(ref => setRef(ref, node));
    return () => {
      cleanups.forEach((cleanup, index) => {
        if (typeof cleanup === "function") {
          cleanup();
        } else {
          setRef(refs[index], null);
        }
      });
    };
  };
}

export function useComposedRefs<T>(...refs: PossibleRef<T>[]): React.RefCallback<T> {
  // The refs array is the dependency list: the callback changes only when a ref changes.
  // eslint-disable-next-line react/exhaustive-deps
  return React.useCallback(composeRefs(...refs), refs);
}
