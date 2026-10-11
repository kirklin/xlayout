import type { MasonryPlacement } from "./types";
import { createRequiredContext } from "../shared/context";
import { ROOT_NAME } from "./constants";

export interface ItemEntry {
  element: HTMLElement;
  span: number;
}

export interface MasonryContextValue {
  /** The column count, once the root was measured. */
  columns: number | null;
  /** Whether the browser places the items with `display: grid-lanes`. */
  native: boolean;
  placementOf: (element: HTMLElement | null) => MasonryPlacement | undefined;
  registerItem: (entry: ItemEntry) => () => void;
}

export const [MasonryContext, useMasonryContext] = createRequiredContext<MasonryContextValue>(ROOT_NAME);
