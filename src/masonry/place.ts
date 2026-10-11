import type { MasonryLayout, MasonryLayoutInput } from "./types";

/**
 * Places items in columns the way CSS Grid Level 3 places grid lanes items: an item goes to the
 * line whose columns end highest, lines within the tolerance of that count as tied, and of the
 * tied lines the first at or after the end of the previous item wins, so placement keeps moving
 * forward through ties.
 */
export function computeMasonryLayout(input: MasonryLayoutInput): MasonryLayout {
  const { columns, gap, tolerance, items } = input;
  if (!Number.isInteger(columns) || columns < 1) {
    throw new RangeError(`A masonry layout needs a whole number of columns, at least 1, not ${columns}.`);
  }
  const running = Array.from<number>({ length: columns }).fill(0);
  let cursor = 0;
  const placements = items.map((item) => {
    if (!Number.isInteger(item.span) || item.span < 1) {
      throw new RangeError(`A masonry item spans a whole number of columns, at least 1, not ${item.span}.`);
    }
    const span = Math.min(item.span, columns);
    const reach = (line: number): number => Math.max(...running.slice(line, line + span));
    let line: number;
    if (item.column === undefined) {
      const lines = Array.from({ length: columns - span + 1 }, (_, index) => index);
      const lowest = Math.min(...lines.map(reach));
      const tied = lines.filter(candidate => reach(candidate) <= lowest + tolerance);
      line = tied.find(candidate => candidate >= cursor) ?? tied[0]!;
    } else {
      line = Math.min(item.column, columns - span);
    }
    cursor = line + span;
    const y = reach(line);
    // Outer sizes count as zero at least, so a column never moves back up.
    const end = y + Math.max(0, item.height) + gap;
    for (let column = line; column < line + span; column++) {
      running[column] = end;
    }
    return { column: line, span, y };
  });
  return { placements, height: items.length > 0 ? Math.max(...running) - gap : 0 };
}

/** As many columns at least `minColumnWidth` wide as fit, as `repeat(auto-fill, …)` counts them. */
export function countColumns(width: number, gap: number, minColumnWidth: number, maxColumns: number): number {
  return Math.max(1, Math.min(maxColumns, Math.floor((width + gap) / (minColumnWidth + gap))));
}
