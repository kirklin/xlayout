import type { GridCell, GridCompaction, GridDerivation, GridEdge, GridItemLayout, GridLayout, GridRules } from "./types";
import { clamp } from "../shared/math";

export function collides(a: GridCell, b: GridCell): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** The first row below every item. */
export function bottomOf(layout: GridLayout): number {
  return layout.reduce((bottom, item) => Math.max(bottom, item.y + item.h), 0);
}

function lanes(start: number, length: number): number[] {
  return Array.from({ length }, (_, index) => start + index);
}

function inOrder(layout: GridLayout, values: ReadonlyMap<string, GridItemLayout>): GridItemLayout[] {
  return layout.map(item => values.get(item.value)!);
}

export function validateLayout(layout: GridLayout, breakpoint: string): void {
  const seen = new Set<string>();
  for (const item of layout) {
    if (seen.has(item.value)) {
      throw new Error(`The ${breakpoint} grid layout places "${item.value}" more than once.`);
    }
    seen.add(item.value);
    const whole = [item.x, item.y, item.w, item.h].every(Number.isInteger);
    if (!whole || item.x < 0 || item.y < 0 || item.w < 1 || item.h < 1) {
      throw new RangeError(`The ${breakpoint} grid layout places "${item.value}" at ${item.x}, ${item.y} sized ${item.w} by ${item.h}; positions are whole numbers from 0 and sizes from 1.`);
    }
  }
}

/** Keeps an item within the grid's columns and its own size limits; the grid's width wins over `minW`. */
export function fitItem(item: GridItemLayout, columns: number): GridItemLayout {
  const w = clamp(item.w, Math.max(1, item.minW ?? 1), Math.min(item.maxW ?? Infinity, columns));
  const h = Math.max(1, clamp(item.h, item.minH ?? 1, item.maxH ?? Infinity));
  return { ...item, w, h, x: clamp(item.x, 0, columns - w), y: Math.max(0, item.y) };
}

/**
 * Removes overlaps by moving items down. Fixed items stay put; the others, in order of their
 * rows and then their columns, go below whatever they would overlap.
 */
function settle(layout: GridLayout, isFixed: (item: GridItemLayout) => boolean): GridItemLayout[] {
  const placed = layout.filter(isFixed);
  const moved = new Map(placed.map(item => [item.value, item]));
  const movable = layout.filter(item => !isFixed(item)).sort((a, b) => a.y - b.y || a.x - b.x);
  for (const item of movable) {
    let current = item;
    let blocker = placed.find(other => collides(current, other));
    while (blocker) {
      current = { ...current, y: blocker.y + blocker.h };
      blocker = placed.find(other => collides(current, other));
    }
    placed.push(current);
    moved.set(current.value, current);
  }
  return inOrder(layout, moved);
}

/**
 * Closes gaps: items move up, or toward the inline start, as far as the items before them in
 * that direction and the static items allow. Expects a layout without overlaps.
 */
export function compactLayout(layout: GridLayout, compact: GridCompaction): GridItemLayout[] {
  if (compact === "none") {
    return [...layout];
  }
  const vertical = compact === "vertical";
  const statics = layout.filter(item => item.static);
  const reach = new Map<number, number>();
  const result = new Map(statics.map(item => [item.value, item]));
  const moving = layout
    .filter(item => !item.static)
    .sort((a, b) => (vertical ? a.y - b.y || a.x - b.x : a.x - b.x || a.y - b.y));
  for (const item of moving) {
    const crossed = vertical ? lanes(item.x, item.w) : lanes(item.y, item.h);
    const start = Math.max(0, ...crossed.map(lane => reach.get(lane) ?? 0));
    let current: GridItemLayout = vertical ? { ...item, y: start } : { ...item, x: start };
    let blocker = statics.find(other => collides(current, other));
    while (blocker) {
      current = vertical ? { ...current, y: blocker.y + blocker.h } : { ...current, x: blocker.x + blocker.w };
      blocker = statics.find(other => collides(current, other));
    }
    for (const lane of crossed) {
      reach.set(lane, vertical ? current.y + current.h : current.x + current.w);
    }
    result.set(item.value, current);
  }
  return inOrder(layout, result);
}

/** A layout as it is shown: inside the grid, without overlaps unless they are allowed, compacted. */
export function normalizeLayout(layout: GridLayout, rules: GridRules): GridItemLayout[] {
  const fitted = layout.map(item => fitItem(item, rules.columns));
  if (rules.collision === "overlap") {
    return fitted;
  }
  return compactLayout(settle(fitted, item => item.static === true), rules.compact);
}

/** Resolves overlaps with the item that moved by pushing the others down, then compacts. */
function pushAround(layout: GridLayout, value: string, rules: GridRules): GridItemLayout[] {
  return compactLayout(settle(layout, item => item.static === true || item.value === value), rules.compact);
}

function center(start: number, length: number): number {
  return start + length / 2;
}

/**
 * Whether the moved item went past the middle of `other` along an axis it moved on. The same
 * test applies in both directions, so moving back past the middle swaps back.
 */
function passedMiddle(from: GridCell, to: GridCell, other: GridCell): boolean {
  const passed = (fromStart: number, toStart: number, length: number, otherStart: number, otherLength: number): boolean => {
    if (toStart === fromStart) {
      return false;
    }
    const moved = center(toStart, length);
    const middle = center(otherStart, otherLength);
    return toStart > fromStart ? moved >= middle : moved <= middle;
  };
  return passed(from.x, to.x, to.w, other.x, other.w) || passed(from.y, to.y, to.h, other.y, other.h);
}

/**
 * The layout after moving an item to `target`, always worked out from `snapshot`, the layout
 * when the item was picked up, so the result depends only on where the item is now. Returns
 * `null` when the rules do not allow the move. Without `swap`, items in the way are only pushed,
 * as for an item that arrives from outside and has no place to trade.
 */
export function resolveMove(
  snapshot: GridLayout,
  value: string,
  target: { x: number; y: number },
  rules: GridRules,
  swap = true,
): GridItemLayout[] | null {
  const origin = snapshot.find(item => item.value === value);
  if (!origin) {
    throw new Error(`The grid layout has no item "${value}".`);
  }
  if (origin.static) {
    return null;
  }
  const moved = { ...origin, x: clamp(target.x, 0, rules.columns - origin.w), y: Math.max(0, target.y) };
  const others = snapshot.filter(item => item.value !== value);
  const colliders = others.filter(item => collides(moved, item));
  const place = (layout: GridItemLayout[]): GridItemLayout[] => inOrder(snapshot, new Map(layout.map(item => [item.value, item])));
  if (rules.collision === "overlap") {
    return place([moved, ...others]);
  }
  if (colliders.length === 0) {
    return pushAround(place([moved, ...others]), value, rules);
  }
  if (rules.collision === "block" || colliders.some(item => item.static)) {
    return null;
  }
  const [single] = colliders;
  if (swap && colliders.length === 1 && single) {
    // Two items trade places when each fits where the other was.
    const swapped = { ...moved, x: single.x, y: single.y };
    const displaced = { ...single, x: origin.x, y: origin.y };
    const fits = swapped.x + swapped.w <= rules.columns && displaced.x + displaced.w <= rules.columns;
    if (fits) {
      if (!passedMiddle(origin, moved, single)) {
        return null;
      }
      const rest = others.filter(item => item !== single);
      return pushAround(place([swapped, displaced, ...rest]), value, rules);
    }
  }
  return pushAround(place([moved, ...others]), value, rules);
}

/** Which sides an edge moves along each axis: `-1` the start or the top, `1` the end or the bottom, `0` neither. */
export function edgeSides(edge: GridEdge): { x: -1 | 0 | 1; y: -1 | 0 | 1 } {
  return {
    x: edge.endsWith("start") ? -1 : edge.endsWith("end") ? 1 : 0,
    y: edge.startsWith("top") ? -1 : edge.startsWith("bottom") ? 1 : 0,
  };
}

/**
 * The layout after resizing an item from `edge` toward `size`, worked out from the layout when
 * the resize began. The opposite edge stays, and the grid's bounds and the item's limits hold.
 */
export function resolveResize(
  snapshot: GridLayout,
  value: string,
  size: { w: number; h: number },
  rules: GridRules,
  edge: GridEdge = "bottom-end",
): GridItemLayout[] | null {
  const origin = snapshot.find(item => item.value === value);
  if (!origin) {
    throw new Error(`The grid layout has no item "${value}".`);
  }
  if (origin.static) {
    return null;
  }
  const sides = edgeSides(edge);
  const end = origin.x + origin.w;
  const bottom = origin.y + origin.h;
  const minW = Math.max(1, origin.minW ?? 1);
  const minH = Math.max(1, origin.minH ?? 1);
  const w = sides.x === 0
    ? origin.w
    : clamp(size.w, minW, Math.min(origin.maxW ?? Infinity, sides.x < 0 ? end : rules.columns - origin.x));
  const h = sides.y === 0
    ? origin.h
    : Math.max(1, clamp(size.h, minH, Math.min(origin.maxH ?? Infinity, sides.y < 0 ? bottom : Infinity)));
  const resized = { ...origin, w, h, x: sides.x < 0 ? end - w : origin.x, y: sides.y < 0 ? bottom - h : origin.y };
  const others = snapshot.filter(item => item.value !== value);
  const colliders = others.filter(item => collides(resized, item));
  const layout = inOrder(snapshot, new Map([resized, ...others].map(item => [item.value, item])));
  if (rules.collision === "overlap") {
    return layout;
  }
  if (colliders.length > 0 && (rules.collision === "block" || colliders.some(item => item.static))) {
    return null;
  }
  return pushAround(layout, value, rules);
}

/** Adapts a layout made for `fromColumns` to a grid of `toColumns`. */
export function deriveLayout(layout: GridLayout, fromColumns: number, toColumns: number, derivation: GridDerivation): GridItemLayout[] {
  return layout.map((item) => {
    if (derivation === "clamp") {
      return fitItem(item, toColumns);
    }
    const ratio = toColumns / fromColumns;
    return fitItem({ ...item, x: Math.round(item.x * ratio), w: Math.max(1, Math.round(item.w * ratio)) }, toColumns);
  });
}

/** Adds items the layout does not place yet, one cell each, below everything. */
export function placeMissing(layout: GridLayout, values: readonly string[], columns: number): GridItemLayout[] {
  const placed = new Set(layout.map(item => item.value));
  const missing = values.filter(value => !placed.has(value));
  const bottom = bottomOf(layout);
  return [
    ...layout,
    ...missing.map((value, index) => ({ value, x: index % columns, y: bottom + Math.floor(index / columns), w: 1, h: 1 })),
  ];
}
