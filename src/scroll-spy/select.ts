import { POSITION_TOLERANCE } from "./constants";

/**
 * Spreads the positions that scrolling cannot reach over the first and the last stretch of the
 * scroll range, so every section becomes active somewhere. This follows "Calculating the Active
 * Scroll Marker" in CSS Overflow 5: the stretch is an eighth of the scrollport, at most half
 * the scroll range.
 */
export function redistributePositions(positions: readonly number[], scrollportSize: number, scrollRange: number): number[] {
  const result = [...positions];
  if (scrollRange <= 0) {
    return result;
  }
  const distribute = Math.min(scrollportSize / 8, scrollRange / 2);
  let minimum = Infinity;
  for (const position of result) {
    if (position < distribute) {
      minimum = Math.min(minimum, position);
    }
  }
  if (minimum !== Infinity) {
    for (let index = 0; index < result.length; index++) {
      const position = result[index]!;
      if (position < distribute) {
        result[index] = ((position - minimum) / (distribute - minimum)) * distribute;
      }
    }
  }
  const lastStretch = scrollRange - distribute;
  let maximum = -Infinity;
  for (const position of result) {
    if (position > lastStretch) {
      maximum = Math.max(maximum, position);
    }
  }
  if (maximum !== -Infinity) {
    for (let index = 0; index < result.length; index++) {
      const position = result[index]!;
      if (position > lastStretch) {
        result[index] = ((position - lastStretch) / (maximum - lastStretch)) * distribute + lastStretch;
      }
    }
  }
  return result;
}

/** How many of the ascending `values` are below `limit`, or at most `limit` when `inclusive`. */
export function countUpTo(values: Float64Array, limit: number, inclusive: boolean): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (inclusive ? values[middle]! <= limit : values[middle]! < limit) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

/** The sections' positions in ascending order, to choose the active one at any scroll position by searching. */
export interface PreparedPositions {
  /** Each position once. */
  distinct: Float64Array;
  /** For each of them, the first section at it. */
  first: Int32Array;
}

export function preparePositions(positions: readonly number[]): PreparedPositions {
  const firstAt = new Map<number, number>();
  positions.forEach((position, index) => {
    if (!firstAt.has(position)) {
      firstAt.set(position, index);
    }
  });
  const distinct = Float64Array.from(firstAt.keys()).sort();
  return { distinct, first: Int32Array.from(distinct, position => firstAt.get(position)!) };
}

/**
 * The index of the active section: the first one at the largest position that scrolling has
 * reached, or whose start is in the upper half of the scrollport while the section before it
 * started more than half a scrollport above. `-1` when no section qualifies.
 */
export function selectPrepared(prepared: PreparedPositions, scrollPosition: number, scrollportSize: number): number {
  const { distinct, first } = prepared;
  const reached = countUpTo(distinct, scrollPosition + POSITION_TOLERANCE, true) - 1;
  // The last position that leads: the one before it is above half a scrollport up, and it is below half a scrollport down.
  const leading = Math.min(
    countUpTo(distinct, scrollPosition - scrollportSize / 2, false),
    countUpTo(distinct, scrollPosition + scrollportSize / 2, false) - 1,
  );
  const selected = Math.max(reached, leading >= 1 ? leading : -1);
  return selected === -1 ? -1 : first[selected]!;
}

export function selectSection(positions: readonly number[], scrollPosition: number, scrollportSize: number): number {
  return selectPrepared(preparePositions(positions), scrollPosition, scrollportSize);
}
