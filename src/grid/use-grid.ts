"use client";

import type { Point } from "../shared/types";
import type { GridFrame } from "./context";
import type { GridItemLayout } from "./types";
import * as React from "react";
import { useStoreSelector } from "../shared/store";
import { useGridContext, useGridItemContext } from "./context";

export interface GridApi {
  /** The breakpoint in use, once the grid was measured. */
  breakpoint: string | null;
  columns: number | null;
  /** The layout shown at that breakpoint, including a change being previewed. */
  layout: readonly GridItemLayout[] | null;
}

function selectGrid(frame: GridFrame): GridApi {
  return { breakpoint: frame.breakpoint, columns: frame.columns, layout: frame.layout };
}

function sameGrid(a: GridApi, b: GridApi): boolean {
  return a.breakpoint === b.breakpoint && a.columns === b.columns && a.layout === b.layout;
}

export function useGrid(): GridApi {
  const { frame } = useGridContext("useGrid");
  return useStoreSelector(frame, selectGrid, sameGrid);
}

/** A step toward the inline start or end, or up or down. */
export type GridMove = "start" | "end" | "up" | "down";
export type GridResize = "wider" | "narrower" | "taller" | "shorter";

const MOVES: Record<GridMove, Point> = { start: { x: -1, y: 0 }, end: { x: 1, y: 0 }, up: { x: 0, y: -1 }, down: { x: 0, y: 1 } };
const RESIZES: Record<GridResize, Point> = { wider: { x: 1, y: 0 }, narrower: { x: -1, y: 0 }, taller: { x: 0, y: 1 }, shorter: { x: 0, y: -1 } };

export interface GridItemApi {
  value: string;
  /** The item's cell as shown, including a change being previewed. */
  cell: GridItemLayout | null;
  isDragging: boolean;
  isResizing: boolean;
  /** Moves the item a step, for controls that work without dragging; returns whether it moved. */
  move: (direction: GridMove) => boolean;
  /** Resizes the item a step; returns whether its size changed. */
  resize: (change: GridResize) => boolean;
  /**
   * Takes the item out of the layouts and reports the change with the reason `"remove"`; render
   * the item no more to remove it. Returns whether the grid had placed it.
   */
  remove: () => boolean;
}

interface ItemState {
  cell: GridItemLayout | null;
  state: "idle" | "dragging" | "resizing";
}

/** Whether two entries of a layout say the same, field by field. */
function sameEntry(a: GridItemLayout | null, b: GridItemLayout | null): boolean {
  if (a === b) {
    return true;
  }
  if (a === null || b === null) {
    return false;
  }
  const keys = Object.keys(a) as (keyof GridItemLayout)[];
  return keys.length === Object.keys(b).length && keys.every(key => a[key] === b[key]);
}

function sameItemState(a: ItemState, b: ItemState): boolean {
  return a.state === b.state && sameEntry(a.cell, b.cell);
}

/** The state of the nearest `Grid.Item`, and ways to move, resize or remove it without dragging. */
export function useGridItem(): GridItemApi {
  const { frame, step, remove: removeItem } = useGridContext("useGridItem");
  const { value } = useGridItemContext("useGridItem");
  const selectItem = React.useCallback(
    (current: GridFrame): ItemState => ({ cell: current.cellOf(value) ?? null, state: current.itemView(value).state }),
    [value],
  );
  const { cell, state } = useStoreSelector(frame, selectItem, sameItemState);
  const move = React.useCallback((direction: GridMove) => step("move", value, MOVES[direction]), [step, value]);
  const resize = React.useCallback((change: GridResize) => step("resize", value, RESIZES[change]), [step, value]);
  const remove = React.useCallback(() => removeItem(value), [removeItem, value]);
  return React.useMemo(() => ({
    value,
    cell,
    isDragging: state === "dragging",
    isResizing: state === "resizing",
    move,
    resize,
    remove,
  }), [value, cell, state, move, resize, remove]);
}
