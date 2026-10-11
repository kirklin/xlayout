import type { MasonryPlacement } from "./types";
import * as React from "react";
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
  /** Whether the root renders only the items near the scrollport, each in a `VirtualItemContext`. */
  virtual: boolean;
  placementOf: (element: HTMLElement | null) => MasonryPlacement | undefined;
  registerItem: (entry: ItemEntry) => () => void;
  /** In a virtual root: measures the item rendered for `key` while it shows. */
  measureItem: (key: React.Key, element: HTMLElement) => () => void;
}

export const [MasonryContext, useMasonryContext] = createRequiredContext<MasonryContextValue>(ROOT_NAME);

/** What a virtual root tells the item it renders for one index. */
export interface VirtualItemValue {
  index: number;
  key: React.Key;
  /** Where the item goes, once the root knows its columns; `null` before, as on the server. */
  placement: MasonryPlacement | null;
  span: number;
}

export const VirtualItemContext = React.createContext<VirtualItemValue | null>(null);
