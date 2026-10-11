import type { OverflowGroupState } from "./types";
import { useOverflowContext } from "./context";

export interface OverflowApi {
  /** Values of hidden items in document order. */
  hidden: string[];
  hiddenCount: number;
  isOverflowing: boolean;
  groupState: (group: string) => OverflowGroupState;
}

/** Overflow state for menus and labels rendered inside `Overflow.Root`. */
export function useOverflow(): OverflowApi {
  const { state, groupState } = useOverflowContext("useOverflow");
  return {
    hidden: state.hidden,
    hiddenCount: state.hidden.length,
    isOverflowing: state.hidden.length > 0,
    groupState,
  };
}

export function useOverflowItem(value: string): { hidden: boolean } {
  const { hiddenValues } = useOverflowContext("useOverflowItem");
  return { hidden: hiddenValues.has(value) };
}
