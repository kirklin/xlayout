import type { FitInput, FitResult, MeasuredItem, OverflowGroupState, OverflowState } from "./types";
import { LAYOUT_TOLERANCE } from "./constants";

/**
 * The space the visible parts take, kept up to date as items hide, so fitting a long list costs
 * a step per item. A divider counts while its group shows an item.
 */
class UsedSpace {
  private readonly input: FitInput;
  private parts = 0;
  private space = 0;
  private readonly shownInGroup = new Map<string, number>();
  private readonly dividersOf = new Map<string, { count: number; space: number }>();

  constructor(input: FitInput) {
    this.input = input;
    for (const item of input.items) {
      this.parts++;
      this.space += item.size;
      if (item.group !== undefined) {
        this.shownInGroup.set(item.group, (this.shownInGroup.get(item.group) ?? 0) + 1);
      }
    }
    for (const divider of input.dividers) {
      const dividers = this.dividersOf.get(divider.group) ?? { count: 0, space: 0 };
      dividers.count++;
      dividers.space += divider.size;
      this.dividersOf.set(divider.group, dividers);
      if (this.shownInGroup.has(divider.group)) {
        this.parts++;
        this.space += divider.size;
      }
    }
  }

  total(withIndicator: boolean): number {
    const parts = this.parts + (withIndicator ? 1 : 0);
    return this.space + (withIndicator ? this.input.indicatorSize : 0) + this.input.gap * Math.max(0, parts - 1);
  }

  hide(item: MeasuredItem): void {
    this.parts--;
    this.space -= item.size;
    if (item.group === undefined) {
      return;
    }
    const shown = this.shownInGroup.get(item.group)! - 1;
    this.shownInGroup.set(item.group, shown);
    const dividers = this.dividersOf.get(item.group);
    if (shown === 0 && dividers) {
      this.parts -= dividers.count;
      this.space -= dividers.space;
    }
  }
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
  const used = new UsedSpace(input);
  if (!input.reserveIndicator && used.total(false) <= input.available + LAYOUT_TOLERANCE) {
    return { visible, indicatorVisible: false };
  }
  const pinnedCount = input.items.filter(item => item.pinned).length;
  const floor = Math.max(input.minimumVisible, pinnedCount);
  for (const item of hidingOrder(input.items, input.overflowDirection)) {
    if (used.total(true) <= input.available + LAYOUT_TOLERANCE || visible.size <= floor) {
      break;
    }
    visible.delete(item.value);
    used.hide(item);
  }
  return { visible, indicatorVisible: input.reserveIndicator || visible.size < input.items.length };
}

export function describeOverflow(items: readonly Pick<MeasuredItem, "value" | "group">[], visible: ReadonlySet<string>): OverflowState {
  const hidden: string[] = [];
  const shown: string[] = [];
  const counts = new Map<string, { members: number; shown: number }>();
  for (const item of items) {
    const isVisible = visible.has(item.value);
    (isVisible ? shown : hidden).push(item.value);
    if (item.group !== undefined) {
      const count = counts.get(item.group) ?? { members: 0, shown: 0 };
      count.members++;
      count.shown += isVisible ? 1 : 0;
      counts.set(item.group, count);
    }
  }
  const groups: Record<string, OverflowGroupState> = {};
  for (const [group, count] of counts) {
    groups[group] = count.shown === count.members ? "visible" : count.shown === 0 ? "hidden" : "overflow";
  }
  return { hidden, visible: shown, groups };
}
