import { POSITION_TOLERANCE } from "./constants";

/**
 * Spreads the positions that scrolling cannot reach over the first and the last stretch of the
 * scroll range, so every section becomes active somewhere. This follows "Calculating the Active
 * Scroll Marker" in CSS Overflow 5: the stretch is an eighth of the scrollport, at most half
 * the scroll range.
 */
export function redistributePositions(positions: readonly number[], scrollportSize: number, scrollRange: number): number[] {
  let result = [...positions];
  if (scrollRange <= 0) {
    return result;
  }
  const distribute = Math.min(scrollportSize / 8, scrollRange / 2);
  const before = result.filter(position => position < distribute);
  if (before.length > 0) {
    const minimum = Math.min(...before);
    result = result.map(position => (
      position < distribute ? ((position - minimum) / (distribute - minimum)) * distribute : position
    ));
  }
  const lastStretch = scrollRange - distribute;
  const after = result.filter(position => position > lastStretch);
  if (after.length > 0) {
    const maximum = Math.max(...after);
    result = result.map(position => (
      position > lastStretch ? ((position - lastStretch) / (maximum - lastStretch)) * distribute + lastStretch : position
    ));
  }
  return result;
}

/**
 * The index of the active section: the first one at the largest position that scrolling has
 * reached, or whose start is in the upper half of the scrollport while the section before it
 * started more than half a scrollport above. `-1` when no section qualifies.
 */
export function selectSection(positions: readonly number[], scrollPosition: number, scrollportSize: number): number {
  const distinct = [...new Set(positions)].sort((a, b) => a - b);
  let selected: number | undefined;
  distinct.forEach((position, index) => {
    const previous = distinct[index - 1];
    const reached = position <= scrollPosition + POSITION_TOLERANCE;
    const leads = previous !== undefined
      && previous < scrollPosition - scrollportSize / 2
      && position < scrollPosition + scrollportSize / 2;
    if (reached || leads) {
      selected = position;
    }
  });
  return selected === undefined ? -1 : positions.indexOf(selected);
}
