/** Where an item sits, in grid units: columns from the inline start, rows from the top. */
export interface GridCell {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GridItemLayout extends GridCell {
  /** The `value` of the `Grid.Item` this entry places. */
  value: string;
  minW?: number;
  maxW?: number;
  minH?: number;
  maxH?: number;
  /** Never moves or resizes; other items flow around it. */
  static?: boolean;
}

export type GridLayout = readonly GridItemLayout[];

/** Layouts by breakpoint name. Breakpoints without one take theirs from the nearest that has one. */
export type GridLayouts = Readonly<Record<string, GridLayout>>;

/** Which way items move to close gaps: up, toward the inline start, or not at all. */
export type GridCompaction = "vertical" | "horizontal" | "none";

/**
 * What happens when a moved or resized item lands on others: `"push"` moves them down, or swaps
 * with a single item once the moved one passes its middle; `"block"` refuses the move; `"overlap"`
 * lets items overlap.
 */
export type GridCollision = "push" | "block" | "overlap";

/** How a breakpoint without a layout adapts the nearest one: scaled to its columns, or clamped into them. */
export type GridDerivation = "scale" | "clamp";

export interface GridRules {
  columns: number;
  compact: GridCompaction;
  collision: GridCollision;
}

/**
 * The side or corner of an item a resize handle moves; the opposite one stays. The inline sides
 * follow the reading direction.
 */
export type GridEdge = "top" | "bottom" | "start" | "end" | "top-start" | "top-end" | "bottom-start" | "bottom-end";

/**
 * Why the layouts changed: an item moved or was resized, an item dragged out was taken by another
 * grid of the same group, or arrived from one, or was dragged out of a removable grid.
 */
export type GridChangeReason = "move" | "resize" | "add" | "remove";

export interface GridLayoutChange {
  breakpoint: string;
  /** The item that moved, was resized, arrived or left. */
  value: string;
  reason: GridChangeReason;
}
