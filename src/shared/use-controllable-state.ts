import * as React from "react";
import { useStableCallback } from "./use-stable-callback";

interface ControllableStateOptions<T> {
  prop: T | undefined;
  defaultProp: T | (() => T);
  onChange?: ((value: T) => void) | undefined;
  caller: string;
}

export type SetControllableState<T> = (next: React.SetStateAction<T>) => void;

/**
 * State that is either owned by the component (`defaultProp`) or by the consumer (`prop`).
 * `onChange` is called synchronously from the setter. In uncontrolled mode several updates
 * within one event build on each other; in controlled mode every update starts from the
 * value the consumer rendered last.
 */
export function useControllableState<T>(options: ControllableStateOptions<T>): [T, SetControllableState<T>] {
  const { prop, defaultProp, onChange, caller } = options;
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultProp);
  const isControlled = prop !== undefined;
  const [initiallyControlled] = React.useState(isControlled);
  if (initiallyControlled !== isControlled) {
    const from = initiallyControlled ? "controlled" : "uncontrolled";
    const to = isControlled ? "controlled" : "uncontrolled";
    throw new Error(`${caller} changed from ${from} to ${to}. Keep a component either controlled or uncontrolled for its whole lifetime.`);
  }

  const value = isControlled ? prop : uncontrolledValue;
  const latestValueRef = React.useRef(value);
  React.useLayoutEffect(() => {
    latestValueRef.current = value;
  });

  const handleChange = useStableCallback(onChange);
  const setValue = React.useCallback<SetControllableState<T>>((next) => {
    const current = latestValueRef.current;
    const resolved = typeof next === "function" ? (next as (previous: T) => T)(current) : next;
    if (Object.is(resolved, current)) {
      return;
    }
    if (!isControlled) {
      latestValueRef.current = resolved;
      setUncontrolledValue(resolved);
    }
    handleChange(resolved);
  }, [isControlled, handleChange]);

  return [value, setValue];
}
