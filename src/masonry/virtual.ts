import type { MasonryPlacement } from "./types";
import { CHECKPOINT_INTERVAL } from "./constants";
import { chooseLine, spanIn } from "./place";

export interface VirtualConfig<Key> {
  columns: number;
  /** Measured heights hold at this column width only. */
  columnWidth: number;
  /** The gap between items of a column. */
  gap: number;
  /** Columns within this distance of the shortest count as tied; `Infinity` places strictly in order. */
  tolerance: number;
  count: number;
  keyOf: (index: number) => Key;
  /** Columns the item spans; more than there are counts as all of them. */
  spanOf: (index: number) => number;
  /** How high an item not measured yet is taken to be, including its margins. */
  estimateOf: (index: number) => number;
  /** Whether a measured item stays in its column when the items before it change. */
  stable: boolean;
  /** A change lets every item go to whichever column suits it again. */
  layoutKey: unknown;
}

/** A vertical stretch of the layout, from its top. */
export interface VirtualRange {
  top: number;
  bottom: number;
}

/** An item and where it was, to find it again after the items before it moved. */
export interface VirtualAnchor<Key> {
  key: Key;
  index: number;
  top: number;
}

function resizedInts(array: Int32Array, length: number): Int32Array {
  const next = new Int32Array(length);
  next.set(array.subarray(0, Math.min(length, array.length)));
  return next;
}

function resizedFloats(array: Float64Array, length: number): Float64Array {
  const next = new Float64Array(length);
  next.set(array.subarray(0, Math.min(length, array.length)));
  return next;
}

function checkpointsFor(count: number): number {
  return Math.floor(count / CHECKPOINT_INTERVAL) + 1;
}

/** Whether placements made under `previous` still hold under `next`, which may differ in its count only. */
function placesAlike<Key>(previous: VirtualConfig<Key>, next: VirtualConfig<Key>): boolean {
  return previous.columns === next.columns
    && previous.columnWidth === next.columnWidth
    && previous.gap === next.gap
    && previous.tolerance === next.tolerance
    && previous.keyOf === next.keyOf
    && previous.spanOf === next.spanOf
    && previous.estimateOf === next.estimateOf
    && previous.stable === next.stable
    && previous.layoutKey === next.layoutKey;
}

/**
 * The items of a long list placed in columns as `placeItems` places them, but lazily: only as far
 * down as asked, and after an item's height changes, again from shortly before that item. Where
 * the columns end is saved every few hundred items, and placing starts again from there, so the
 * work for a scroll or a measurement follows the items in view, however many there are.
 */
export class VirtualPlacement<Key> {
  private config: VirtualConfig<Key>;
  private readonly measured = new Map<Key, number>();
  private readonly kept = new Map<Key, number>();
  private starts: Int32Array = new Int32Array(0);
  private spans: Int32Array = new Int32Array(0);
  private tops: Float64Array = new Float64Array(0);
  private heights: Float64Array = new Float64Array(0);
  /** The items before this one are placed. */
  private placed = 0;
  /** Where each column ends, including the gap after its last item. */
  private running: Float64Array = new Float64Array(0);
  private reaches: Float64Array = new Float64Array(0);
  /** The column after the last item placed, where ties go next. */
  private cursor = 0;
  /** The column length the placed items take, as height and gap times span, to estimate the rest. */
  private area = 0;
  private savedRunning: Float64Array = new Float64Array(0);
  private savedCursor: Int32Array = new Int32Array(0);
  private savedArea: Float64Array = new Float64Array(0);
  /** No item from the checkpoint on starts above its lowest column end. */
  private savedLowest: Float64Array = new Float64Array(0);
  /** No item before the checkpoint ends below its highest column end. */
  private savedHighest: Float64Array = new Float64Array(0);

  constructor(config: VirtualConfig<Key>) {
    this.config = config;
    this.resize(0);
  }

  /** Items placed so far. */
  get placedCount(): number {
    return this.placed;
  }

  /**
   * Takes a new configuration. Placements that still hold stay. Returns whether the measured
   * heights were let go because the column width changed, so the items showing need measuring again.
   */
  configure(next: VirtualConfig<Key>): boolean {
    const previous = this.config;
    this.config = next;
    const widthChanged = previous.columnWidth !== next.columnWidth;
    if (widthChanged) {
      this.measured.clear();
    }
    if (previous.columns !== next.columns || previous.stable !== next.stable || previous.layoutKey !== next.layoutKey) {
      this.kept.clear();
    }
    if (previous.columns !== next.columns) {
      this.placed = 0;
      this.cursor = 0;
      this.area = 0;
      this.running = new Float64Array(0);
    }
    this.resize(placesAlike(previous, next) ? Math.min(this.placed, next.count) : 0);
    return widthChanged;
  }

  /** The height measured for `key` at the current column width. */
  heightOf(key: Key): number | undefined {
    return this.measured.get(key);
  }

  /**
   * Records the height measured for the item with `key`, at `index` if it is still there, and
   * returns whether it changed. The items from shortly before it on are placed again when asked.
   */
  measure(key: Key, index: number, height: number): boolean {
    if (this.measured.get(key) === height) {
      return false;
    }
    this.measured.set(key, height);
    const at = this.indexOf(key, index);
    if (at !== -1) {
      this.truncate(at);
    }
    return true;
  }

  /** With stable assignment, keeps the measured item at `index` in the column it is in now. */
  keep(index: number): void {
    if (!this.config.stable || index >= this.placed) {
      return;
    }
    const key = this.config.keyOf(index);
    if (this.measured.has(key) && !this.kept.has(key)) {
      this.kept.set(key, this.starts[index]!);
    }
  }

  /** Where the item with `key` is now, looking at `hint` first; -1 when no item has it. */
  indexOf(key: Key, hint: number): number {
    const { count, keyOf } = this.config;
    if (hint >= 0 && hint < count && keyOf(hint) === key) {
      return hint;
    }
    for (let index = 0; index < count; index++) {
      if (keyOf(index) === key) {
        return index;
      }
    }
    return -1;
  }

  placement(index: number): MasonryPlacement {
    if (!(index >= 0 && index < this.config.count)) {
      throw new RangeError(`No masonry item has the index ${index}; there are ${this.config.count}.`);
    }
    while (this.placed <= index) {
      this.placeNext();
    }
    return { column: this.starts[index]!, span: this.spans[index]!, y: this.tops[index]! };
  }

  /** The items whose boxes reach into `range`, in order, with `extra` among them when it is an item. */
  inRange(range: VirtualRange, extra: number | null): number[] {
    const { columns, count, gap } = this.config;
    // Every later item starts at or below the lowest column end, so placing can stop below the
    // range; near the end it places the few items left, so the height is exact at the end.
    while (this.placed < count && count - this.placed > CHECKPOINT_INTERVAL) {
      let lowest = Infinity;
      for (let column = 0; column < columns; column++) {
        lowest = Math.min(lowest, this.running[column]!);
      }
      if (lowest > range.bottom) {
        break;
      }
      this.placeNext();
    }
    if (count - this.placed <= CHECKPOINT_INTERVAL) {
      while (this.placed < count) {
        this.placeNext();
      }
    }
    // The stretches of items that all end above the range are skipped.
    let start = 0;
    let low = 0;
    let high = this.placed === 0 ? -1 : Math.floor((this.placed - 1) / CHECKPOINT_INTERVAL);
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (this.savedHighest[middle]! - gap < range.top) {
        start = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    const result: number[] = [];
    for (let index = start * CHECKPOINT_INTERVAL; index < this.placed; index++) {
      if (index % CHECKPOINT_INTERVAL === 0 && this.savedLowest[index / CHECKPOINT_INTERVAL]! > range.bottom) {
        break;
      }
      const top = this.tops[index]!;
      if (top <= range.bottom && top + this.heights[index]! >= range.top) {
        result.push(index);
      }
    }
    if (extra !== null && extra >= 0 && extra < count && !result.includes(extra)) {
      this.placement(extra);
      const position = result.findIndex(index => index > extra);
      result.splice(position === -1 ? result.length : position, 0, extra);
    }
    return result;
  }

  /** The first item, in order, whose box reaches into `range`, and where it is now. */
  anchorIn(range: VirtualRange): VirtualAnchor<Key> | null {
    const index = this.inRange(range, null)[0];
    return index === undefined ? null : { key: this.config.keyOf(index), index, top: this.tops[index]! };
  }

  /**
   * The height of the tallest column: exact once every item is placed, and before that taken as
   * if the items not placed yet covered the columns evenly, each as much as the placed ones do.
   */
  height(): number {
    const { columns, count, gap } = this.config;
    if (count === 0) {
      return 0;
    }
    if (this.placed === 0) {
      this.placeNext();
    }
    let highest = 0;
    let total = 0;
    for (let column = 0; column < columns; column++) {
      highest = Math.max(highest, this.running[column]!);
      total += this.running[column]!;
    }
    if (this.placed === count) {
      return highest - gap;
    }
    const rest = (count - this.placed) * (this.area / this.placed);
    return Math.max(highest, (total + rest) / columns) - gap;
  }

  private placeNext(): void {
    const { columns, gap, tolerance, keyOf, spanOf, estimateOf, stable } = this.config;
    const index = this.placed;
    if (index % CHECKPOINT_INTERVAL === 0) {
      this.save(index / CHECKPOINT_INTERVAL);
    }
    const span = spanIn(spanOf(index), columns);
    const key = keyOf(index);
    const line = chooseLine(this.running, this.reaches, span, stable ? this.kept.get(key) : undefined, tolerance, this.cursor);
    const top = this.reaches[line]!;
    let height = this.measured.get(key);
    if (height === undefined) {
      height = estimateOf(index);
      if (!(height >= 0 && height < Infinity)) {
        throw new RangeError(`A masonry height estimate is a finite number of at least 0, not ${height}.`);
      }
    }
    // Outer sizes count as zero at least, so a column never moves back up.
    height = Math.max(0, height);
    const end = top + height + gap;
    for (let column = line; column < line + span; column++) {
      this.running[column] = end;
    }
    this.cursor = line + span;
    this.area += (height + gap) * span;
    this.starts[index] = line;
    this.spans[index] = span;
    this.tops[index] = top;
    this.heights[index] = height;
    this.placed = index + 1;
  }

  private save(checkpoint: number): void {
    const { columns } = this.config;
    let lowest = Infinity;
    let highest = 0;
    for (let column = 0; column < columns; column++) {
      const end = this.running[column]!;
      this.savedRunning[checkpoint * columns + column] = end;
      lowest = Math.min(lowest, end);
      highest = Math.max(highest, end);
    }
    this.savedCursor[checkpoint] = this.cursor;
    this.savedArea[checkpoint] = this.area;
    this.savedLowest[checkpoint] = lowest;
    this.savedHighest[checkpoint] = highest;
  }

  /** Lets the placements from `index` on go, back to the checkpoint at or before it. */
  private truncate(index: number): void {
    if (index >= this.placed) {
      return;
    }
    const { columns } = this.config;
    const checkpoint = Math.floor(index / CHECKPOINT_INTERVAL);
    for (let column = 0; column < columns; column++) {
      this.running[column] = this.savedRunning[checkpoint * columns + column]!;
    }
    this.cursor = this.savedCursor[checkpoint]!;
    this.area = this.savedArea[checkpoint]!;
    this.placed = checkpoint * CHECKPOINT_INTERVAL;
  }

  /** Fits the arrays to the configuration, keeping the first `keep` placements. */
  private resize(keep: number): void {
    const { columns, count } = this.config;
    if (!Number.isInteger(columns) || columns < 1) {
      throw new RangeError(`A masonry layout needs a whole number of columns, at least 1, not ${columns}.`);
    }
    if (this.starts.length !== count) {
      this.starts = resizedInts(this.starts, count);
      this.spans = resizedInts(this.spans, count);
      this.tops = resizedFloats(this.tops, count);
      this.heights = resizedFloats(this.heights, count);
    }
    const checkpoints = checkpointsFor(count);
    if (this.running.length !== columns) {
      this.running = new Float64Array(columns);
      this.reaches = new Float64Array(columns);
      this.savedRunning = new Float64Array(checkpoints * columns);
    } else if (this.savedRunning.length !== checkpoints * columns) {
      this.savedRunning = resizedFloats(this.savedRunning, checkpoints * columns);
    }
    if (this.savedCursor.length !== checkpoints) {
      this.savedCursor = resizedInts(this.savedCursor, checkpoints);
      this.savedArea = resizedFloats(this.savedArea, checkpoints);
      this.savedLowest = resizedFloats(this.savedLowest, checkpoints);
      this.savedHighest = resizedFloats(this.savedHighest, checkpoints);
    }
    this.truncate(keep);
  }
}
