import type { FitInput, FitResult, MeasuredItem, OverflowGroupState, OverflowState } from "./types";
import { LAYOUT_TOLERANCE } from "./constants";

function usedSpace(input: FitInput, visible: ReadonlySet<string>, withIndicator: boolean): number {
  let total = 0;
  let count = 0;
  for (const item of input.items) {
    if (visible.has(item.value)) {
      total += item.size;
      count++;
    }
  }
  for (const divider of input.dividers) {
    if (input.items.some(item => item.group === divider.group && visible.has(item.value))) {
      total += divider.size;
      count++;
    }
  }
  if (withIndicator) {
    total += input.indicatorSize;
    count++;
  }
  return total + input.gap * Math.max(0, count - 1);
}

/**
 * The order in which items give up their place: pinned items never, then lower priorities
 * first, then the end (or the start) of the list first.
 */
function hidingOrder(items: MeasuredItem[], direction: FitInput["overflowDirection"]): MeasuredItem[] {
  const indexed = items.map((item, index) => ({ item, index }));
  return indexed
    .filter(({ item }) => !item.pinned)
    .sort((a, b) => {
      if (a.item.priority !== b.item.priority) {
        return a.item.priority - b.item.priority;
      }
      return direction === "end" ? b.index - a.index : a.index - b.index;
    })
    .map(({ item }) => item);
}

/**
 * Decides which items stay visible. Items are hidden strictly by rank, so the visible set
 * is always the best ranked items; space freed by hiding an item is never given back to a
 * lower ranked one. Once anything is hidden, the indicator needs room too.
 */
export function fitItems(input: FitInput): FitResult {
  const visible = new Set(input.items.map(item => item.value));
  const fitsWithoutIndicator = usedSpace(input, visible, false) <= input.available + LAYOUT_TOLERANCE;
  if (!input.reserveIndicator && fitsWithoutIndicator) {
    return { visible, indicatorVisible: false };
  }
  const pinnedCount = input.items.filter(item => item.pinned).length;
  const floor = Math.max(input.minimumVisible, pinnedCount);
  for (const item of hidingOrder(input.items, input.overflowDirection)) {
    if (usedSpace(input, visible, true) <= input.available + LAYOUT_TOLERANCE || visible.size <= floor) {
      break;
    }
    visible.delete(item.value);
  }
  return { visible, indicatorVisible: input.reserveIndicator || visible.size < input.items.length };
}

export function describeOverflow(items: readonly Pick<MeasuredItem, "value" | "group">[], visible: ReadonlySet<string>): OverflowState {
  const groups: Record<string, OverflowGroupState> = {};
  const groupNames = new Set(items.map(item => item.group).filter((group): group is string => group !== undefined));
  for (const group of groupNames) {
    const members = items.filter(item => item.group === group);
    const shown = members.filter(item => visible.has(item.value)).length;
    groups[group] = shown === members.length ? "visible" : shown === 0 ? "hidden" : "overflow";
  }
  return {
    hidden: items.filter(item => !visible.has(item.value)).map(item => item.value),
    visible: items.filter(item => visible.has(item.value)).map(item => item.value),
    groups,
  };
}
