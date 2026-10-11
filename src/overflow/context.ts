import type { Orientation } from "../shared/types";
import type { OverflowGroupState, OverflowState } from "./types";
import { createRequiredContext } from "../shared/context";
import { ROOT_NAME } from "./constants";

export interface ItemEntry {
  value: string;
  element: HTMLElement;
  priority: number;
  pinned: boolean;
  group: string | undefined;
}

export interface DividerEntry {
  group: string;
  element: HTMLElement;
}

export interface OverflowContextValue {
  orientation: Orientation;
  state: OverflowState;
  indicatorVisible: boolean;
  hiddenValues: ReadonlySet<string>;
  registerItem: (entry: ItemEntry) => () => void;
  registerDivider: (entry: DividerEntry) => () => void;
  registerIndicator: (element: HTMLElement) => () => void;
  groupState: (group: string) => OverflowGroupState;
}

export const [OverflowContext, useOverflowContext] = createRequiredContext<OverflowContextValue>(ROOT_NAME);
