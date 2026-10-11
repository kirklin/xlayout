import type { MasonryLayout, MasonryLayoutInput } from "./types";

export interface PlacementSource {
  columns: number;
  /** The gap between items of a column. */
  gap: number;
  /** Columns within this distance of the shortest count as tied; `Infinity` places strictly in order. */
  tolerance: number;
  count: number;
  /** Columns the item spans; more than there are counts as all of them. */
  spanOf: (index: number) => number;
  /** The item's height including its margins. */
  heightOf: (index: number) => number;
  /** A column to keep the item in, from an earlier layout. */
  columnOf: (index: number) => number | undefined;
}

/** Where every item goes, in arrays indexed like the items, and the height of the tallest column. */
export interface Placements {
  columns: Int32Array;
  spans: Int32Array;
  tops: Float64Array;
  heights: Float64Array;
  height: number;
}

/** The span an item takes in `columns` columns, checked. */
export function spanIn(requested: number, columns: number): number {
  if (!Number.isInteger(requested) || requested < 1) {
    throw new RangeError(`A masonry item spans a whole number of columns, at least 1, not ${requested}.`);
  }
  return Math.min(requested, columns);
}

/**
 * The line an item of `span` columns goes to, given where the columns end in `running`: the line
 * whose columns end highest, lines within the tolerance of that count as tied, and of the tied
 * lines the first at or after `cursor`, the end of the previous item. The top of every line is
 * left in `reaches`.
 */
export function chooseLine(running: Float64Array, reaches: Float64Array, span: number, kept: number | undefined, tolerance: number, cursor: number): number {
  const lines = running.length - span + 1;
  let lowest = Infinity;
  for (let line = 0; line < lines; line++) {
    let reach = running[line]!;
    for (let column = line + 1; column < line + span; column++) {
      reach = Math.max(reach, running[column]!);
    }
    reaches[line] = reach;
    lowest = Math.min(lowest, reach);
  }
  if (kept !== undefined) {
    return Math.min(kept, lines - 1);
  }
  let first = -1;
  for (let line = 0; line < lines; line++) {
    if (reaches[line]! <= lowest + tolerance) {
      if (line >= cursor) {
        return line;
      }
      if (first === -1) {
        first = line;
      }
    }
  }
  return first;
}

/**
 * Places items in columns the way CSS Grid Level 3 places grid lanes items: an item goes to the
 * line whose columns end highest, lines within the tolerance of that count as tied, and of the
 * tied lines the first at or after the end of the previous item wins, so placement keeps moving
 * forward through ties. It allocates nothing per item, so it places many thousands at a time.
 */
export function placeItems(source: PlacementSource): Placements {
  const { columns, gap, tolerance, count } = source;
  if (!Number.isInteger(columns) || columns < 1) {
    throw new RangeError(`A masonry layout needs a whole number of columns, at least 1, not ${columns}.`);
  }
  const running = new Float64Array(columns);
  const reaches = new Float64Array(columns);
  const placed: Placements = {
    columns: new Int32Array(count),
    spans: new Int32Array(count),
    tops: new Float64Array(count),
    heights: new Float64Array(count),
    height: 0,
  };
  let cursor = 0;
  for (let index = 0; index < count; index++) {
    const span = spanIn(source.spanOf(index), columns);
    const chosen = chooseLine(running, reaches, span, source.columnOf(index), tolerance, cursor);
    cursor = chosen + span;
    const top = reaches[chosen]!;
    // Outer sizes count as zero at least, so a column never moves back up.
    const height = Math.max(0, source.heightOf(index));
    const end = top + height + gap;
    for (let column = chosen; column < chosen + span; column++) {
      running[column] = end;
    }
    placed.columns[index] = chosen;
    placed.spans[index] = span;
    placed.tops[index] = top;
    placed.heights[index] = height;
  }
  let tallest = 0;
  for (let column = 0; column < columns; column++) {
    tallest = Math.max(tallest, running[column]!);
  }
  placed.height = count > 0 ? tallest - gap : 0;
  return placed;
}

/**
 * Places items in columns the way CSS Grid Level 3 places grid lanes items; see `placeItems`,
 * which this reads its input for.
 */
export function computeMasonryLayout(input: MasonryLayoutInput): MasonryLayout {
  const { items } = input;
  const placed = placeItems({
    columns: input.columns,
    gap: input.gap,
    tolerance: input.tolerance,
    count: items.length,
    spanOf: index => items[index]!.span,
    heightOf: index => items[index]!.height,
    columnOf: index => items[index]!.column,
  });
  return {
    placements: items.map((_, index) => ({ column: placed.columns[index]!, span: placed.spans[index]!, y: placed.tops[index]! })),
    height: placed.height,
  };
}

/** As many columns at least `minColumnWidth` wide as fit, as `repeat(auto-fill, …)` counts them. */
export function countColumns(width: number, gap: number, minColumnWidth: number, maxColumns: number): number {
  return Math.max(1, Math.min(maxColumns, Math.floor((width + gap) / (minColumnWidth + gap))));
}
