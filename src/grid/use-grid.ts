import type { Point } from "../shared/types";
import type { GridItemLayout } from "./types";
import * as React from "react";
import { useGridContext, useGridItemContext } from "./context";

export interface GridApi {
  /** The breakpoint in use, once the grid was measured. */
  breakpoint: string | null;
  columns: number | null;
  /** The layout shown at that breakpoint, including a change being previewed. */
  layout: readonly GridItemLayout[] | null;
}

export function useGrid(): GridApi {
  const { breakpoint, columns, layout } = useGridContext("useGrid");
  return React.useMemo(() => ({ breakpoint, columns, layout }), [breakpoint, columns, layout]);
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
}

/** The state of the nearest `Grid.Item`, and ways to move or resize it without dragging. */
export function useGridItem(): GridItemApi {
  const { layout, itemView, step } = useGridContext("useGridItem");
  const { value } = useGridItemContext("useGridItem");
  const { state } = itemView(value);
  const move = React.useCallback((direction: GridMove) => step("move", value, MOVES[direction]), [step, value]);
  const resize = React.useCallback((change: GridResize) => step("resize", value, RESIZES[change]), [step, value]);
  const cell = layout?.find(item => item.value === value) ?? null;
  return React.useMemo(() => ({
    value,
    cell,
    isDragging: state === "dragging",
    isResizing: state === "resizing",
    move,
    resize,
  }), [value, cell, state, move, resize]);
}
