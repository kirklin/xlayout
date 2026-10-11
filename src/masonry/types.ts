/**
 * How close the columns must be to count as tied, so items fill them in order: 1em, a
 * distance in pixels, or no limit at all, which places items strictly in order.
 */
export type MasonryTolerance = "normal" | "infinite" | number;

/**
 * `"balanced"` places every item afresh whenever the layout changes. `"stable"` keeps each item
 * in its column while the column count stays, so an item that grows never makes the others
 * jump columns.
 */
export type MasonryAssignment = "balanced" | "stable";

/** Whether to hand the layout to the browser's `display: grid-lanes` where it has one. */
export type MasonryNative = "auto" | "never";

export interface MasonryItemInput {
  /** Columns the item spans; more than there are counts as all of them. */
  span: number;
  /** The item's height including its margins. */
  height: number;
  /** A column to keep the item in, from an earlier layout. */
  column?: number;
}

export interface MasonryLayoutInput {
  columns: number;
  /** The gap between items of a column. */
  gap: number;
  /** Columns within this distance of the shortest count as tied; `Infinity` places strictly in order. */
  tolerance: number;
  /** Items in placement order. */
  items: readonly MasonryItemInput[];
}

export interface MasonryPlacement {
  /** The first column the item covers, counted from the inline start. */
  column: number;
  span: number;
  /** Distance from the top of the layout to the item's margin box. */
  y: number;
}

export interface MasonryLayout {
  placements: MasonryPlacement[];
  /** The height of the tallest column. */
  height: number;
}

export interface MasonryLayoutInfo {
  columns: number;
  columnWidth: number;
  height: number;
  /** Whether the browser lays the items out with `display: grid-lanes`. */
  native: boolean;
}
