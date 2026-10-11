import type * as React from "react";
import type { Store } from "../shared/store";
import type { Point } from "../shared/types";
import type { GridCell, GridEdge, GridItemLayout } from "./types";
import { createRequiredContext } from "../shared/context";
import { ITEM_NAME, ROOT_NAME } from "./constants";

export interface ItemEntry {
  value: string;
  element: HTMLElement;
  /** Names the item in announcements. */
  label: string;
}

export type InteractionKind = "move" | "resize";

/** How an item shows while the grid previews a change. */
export interface ItemView {
  state: "idle" | "dragging" | "resizing";
  isStatic: boolean;
  /** Dragged outside the grid: on its way to another grid of the group, or out of a removable one. */
  leaving: boolean;
  /** The cell to show instead of the one the style rules give, while a change is previewed. */
  cell: GridCell | null;
  /** How far a dragged item is drawn from its cell. */
  offset: Point | null;
  /** The size a resized item is drawn at. */
  size: { width: number; height: number } | null;
}

/**
 * What the grid shows now. The root keeps it in a store, and each part reads only what it needs,
 * so a drag renders again only the items whose place it changes.
 */
export interface GridFrame {
  /** The breakpoint in use, once the grid was measured. */
  breakpoint: string | null;
  columns: number | null;
  /** The layout shown at that breakpoint, including a change being previewed. */
  layout: readonly GridItemLayout[] | null;
  /** The entry of an item in that layout. */
  cellOf: (value: string) => GridItemLayout | undefined;
  /** Where the dragged, resized or dropped item would land. */
  placeholder: GridCell | null;
  /** The item and kind a keyboard user picked up. */
  pickedUp: { value: string; kind: InteractionKind } | null;
  itemView: (value: string) => ItemView;
  /** The items, in document order, and the cell each is drawn in. */
  entries: readonly ItemEntry[];
  drawn: ReadonlyMap<string, GridCell>;
  /** The item a pointer holds, which is drawn where the pointer has it. */
  held: string | null;
}

export interface GridContextValue {
  frame: Store<GridFrame>;
  registerItem: (entry: ItemEntry) => () => void;
  beginPointer: (kind: InteractionKind, value: string, event: React.PointerEvent<HTMLElement>, edge: GridEdge) => void;
  handleKey: (kind: InteractionKind, value: string, event: React.KeyboardEvent<HTMLElement>, edge: GridEdge) => void;
  handleBlur: (value: string) => void;
  /** Moves or resizes an item by whole cells at once; returns whether the rules allowed it. */
  step: (kind: InteractionKind, value: string, delta: { x: number; y: number }) => boolean;
  /** Takes an item out of the layouts; returns whether the grid placed it. */
  remove: (value: string) => boolean;
}

export const [GridContext, useGridContext] = createRequiredContext<GridContextValue>(ROOT_NAME);

export interface GridItemContextValue {
  value: string;
  label: string;
}

export const [GridItemContext, useGridItemContext] = createRequiredContext<GridItemContextValue>(ITEM_NAME);
