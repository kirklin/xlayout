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
