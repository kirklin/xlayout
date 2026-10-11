import type { FitInput, MeasuredItem } from "./types";
import { describe, expect, it } from "vitest";
import { describeOverflow, fitItems } from "./fit";

function item(value: string, size: number, overrides: Partial<MeasuredItem> = {}): MeasuredItem {
  return { value, size, priority: 0, pinned: false, group: undefined, ...overrides };
}

function input(overrides: Partial<FitInput>): FitInput {
  return {
    available: 300,
    gap: 10,
    items: [item("a", 100), item("b", 100), item("c", 100)],
    dividers: [],
    indicatorSize: 40,
    minimumVisible: 0,
    overflowDirection: "end",
    reserveIndicator: false,
    ...overrides,
  };
}

function visibleValues(result: { visible: Set<string> }): string[] {
  return [...result.visible].sort();
}

describe("fitItems", () => {
  it("shows everything without an indicator when it all fits", () => {
    const result = fitItems(input({ available: 320 }));
    expect(visibleValues(result)).toEqual(["a", "b", "c"]);
    expect(result.indicatorVisible).toBe(false);
  });

  it("hides from the end and leaves room for the indicator", () => {
    const result = fitItems(input({}));
    expect(visibleValues(result)).toEqual(["a", "b"]);
    expect(result.indicatorVisible).toBe(true);
  });

  it("hides from the start when asked to", () => {
    const result = fitItems(input({ overflowDirection: "start" }));
    expect(visibleValues(result)).toEqual(["b", "c"]);
  });

  it("hides lower priorities first", () => {
    const result = fitItems(input({ items: [item("a", 100), item("b", 100, { priority: -1 }), item("c", 100, { priority: 1 })] }));
    expect(visibleValues(result)).toEqual(["a", "c"]);
  });

  it("never hides pinned items", () => {
    const result = fitItems(input({ available: 100, items: [item("a", 100, { pinned: true }), item("b", 100), item("c", 100)] }));
    expect(visibleValues(result)).toEqual(["a"]);
    expect(result.indicatorVisible).toBe(true);
  });

  it("keeps a minimum number of items", () => {
    const result = fitItems(input({ available: 50, minimumVisible: 1 }));
    expect(visibleValues(result)).toEqual(["a"]);
  });

  it("reserves room for the indicator when asked to", () => {
    const result = fitItems(input({ available: 320, reserveIndicator: true }));
    expect(visibleValues(result)).toEqual(["a", "b"]);
    expect(result.indicatorVisible).toBe(true);
  });

  it("counts dividers only while their group shows an item", () => {
    const items = [item("a", 100, { group: "one" }), item("b", 100, { group: "two" }), item("c", 60, { group: "two" })];
    const result = fitItems(input({ available: 280, gap: 0, items, dividers: [{ group: "one", size: 20 }, { group: "two", size: 20 }] }));
    expect(visibleValues(result)).toEqual(["a", "b"]);
    const hiddenGroup = fitItems(input({ available: 170, gap: 0, items, dividers: [{ group: "one", size: 20 }, { group: "two", size: 20 }] }));
    expect(visibleValues(hiddenGroup)).toEqual(["a"]);
  });

  it("does not give freed space back to items that rank lower", () => {
    const result = fitItems(input({ available: 100, gap: 0, indicatorSize: 20, items: [item("small", 30), item("big", 150, { priority: 1 })] }));
    expect(visibleValues(result)).toEqual([]);
    expect(result.indicatorVisible).toBe(true);
  });
});

/** The fit as the rules read: everything shown is added up again after every item that hides. */
function referenceFit(fit: FitInput): string[] {
  const visible = new Set(fit.items.map(entry => entry.value));
  const used = (withIndicator: boolean): number => {
    const shown = fit.items.filter(entry => visible.has(entry.value));
    const dividers = fit.dividers.filter(divider => shown.some(entry => entry.group === divider.group));
    const parts = shown.length + dividers.length + (withIndicator ? 1 : 0);
    const space = [...shown, ...dividers].reduce((total, part) => total + part.size, 0) + (withIndicator ? fit.indicatorSize : 0);
    return space + fit.gap * Math.max(0, parts - 1);
  };
  if (!fit.reserveIndicator && used(false) <= fit.available + 0.5) {
    return [...visible].sort();
  }
  const floor = Math.max(fit.minimumVisible, fit.items.filter(entry => entry.pinned).length);
  const order = fit.items
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => !entry.pinned)
    .sort((a, b) => a.entry.priority - b.entry.priority || (fit.overflowDirection === "end" ? b.index - a.index : a.index - b.index));
  for (const { entry } of order) {
    if (used(true) <= fit.available + 0.5 || visible.size <= floor) {
      break;
    }
    visible.delete(entry.value);
  }
  return [...visible].sort();
}

describe("fitItems with many items", () => {
  it("fits as the rules read, written out plainly, for random lines", () => {
    let seed = 3;
    const random = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let round = 0; round < 300; round++) {
      const groups = ["one", "two", "three"];
      const items = Array.from({ length: Math.floor(random() * 20) }, (_, index) => item(`item-${index}`, 10 + Math.floor(random() * 90), {
        priority: Math.floor(random() * 3) - 1,
        pinned: random() < 0.1,
        group: random() < 0.6 ? groups[Math.floor(random() * 3)] : undefined,
      }));
      const fit = input({
        available: Math.floor(random() * 800),
        gap: Math.floor(random() * 3) * 4,
        items,
        dividers: groups.filter(() => random() < 0.5).map(group => ({ group, size: 6 })),
        minimumVisible: Math.floor(random() * 3),
        overflowDirection: random() < 0.5 ? "end" : "start",
        reserveIndicator: random() < 0.2,
      });
      expect(visibleValues(fitItems(fit))).toEqual(referenceFit(fit));
    }
  });

  it("fits ten thousand items quickly", () => {
    const items = Array.from({ length: 10_000 }, (_, index) => item(`item-${index}`, 40, { group: `group-${index % 50}` }));
    const dividers = Array.from({ length: 50 }, (_, index) => ({ group: `group-${index}`, size: 1 }));
    const start = performance.now();
    const result = fitItems(input({ available: 1000, items, dividers }));
    expect(performance.now() - start).toBeLessThan(300);
    expect(result.visible.size).toBeGreaterThan(10);
    expect(describeOverflow(items, result.visible).hidden.length).toBe(10_000 - result.visible.size);
  });
});

describe("describeOverflow", () => {
  it("lists hidden and visible items in document order and summarizes groups", () => {
    const items = [item("a", 1, { group: "one" }), item("b", 1, { group: "two" }), item("c", 1, { group: "two" }), item("d", 1, { group: "three" })];
    expect(describeOverflow(items, new Set(["a", "b"]))).toEqual({
      hidden: ["c", "d"],
      visible: ["a", "b"],
      groups: { one: "visible", two: "overflow", three: "hidden" },
    });
  });
});
