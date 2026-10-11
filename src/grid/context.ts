import type * as React from "react";
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

export interface GridContextValue {
  /** The breakpoint in use, once the grid was measured. */
  breakpoint: string | null;
  columns: number | null;
  /** The layout shown at that breakpoint, including a change being previewed. */
  layout: readonly GridItemLayout[] | null;
  /** Where the dragged, resized or dropped item would land. */
  placeholder: GridCell | null;
  /** The item and kind a keyboard user picked up. */
  pickedUp: { value: string; kind: InteractionKind } | null;
  registerItem: (entry: ItemEntry) => () => void;
  itemView: (value: string) => ItemView;
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
