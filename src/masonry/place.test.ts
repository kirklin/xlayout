import type { MasonryItemInput } from "./types";
import { describe, expect, it } from "vitest";
import { computeMasonryLayout, countColumns } from "./place";

function items(...heights: number[]): MasonryItemInput[] {
  return heights.map(height => ({ span: 1, height }));
}

function columnsOf(layout: { placements: { column: number }[] }): number[] {
  return layout.placements.map(placement => placement.column);
}

describe("computeMasonryLayout", () => {
  it("puts each item in the column that ends highest, filling tied columns in order", () => {
    const layout = computeMasonryLayout({ columns: 3, gap: 0, tolerance: 16, items: items(100, 50, 80, 30, 60) });
    expect(layout.placements).toEqual([
      { column: 0, span: 1, y: 0 },
      { column: 1, span: 1, y: 0 },
      { column: 2, span: 1, y: 0 },
      { column: 1, span: 1, y: 50 },
      { column: 2, span: 1, y: 80 },
    ]);
    expect(layout.height).toBe(140);
  });

  it("counts columns within the tolerance as tied and starts over after the last one", () => {
    // After four items the columns end at 20, 50, 50 and 10: the fourth is shortest and the
    // first is within 16 of it, so with no tied line after the cursor the first one wins.
    const heights = items(20, 50, 50, 10, 40);
    expect(columnsOf(computeMasonryLayout({ columns: 4, gap: 0, tolerance: 16, items: heights }))).toEqual([0, 1, 2, 3, 0]);
    expect(columnsOf(computeMasonryLayout({ columns: 4, gap: 0, tolerance: 0, items: heights }))).toEqual([0, 1, 2, 3, 3]);
  });

  it("places strictly in order with no limit on the tolerance", () => {
    const layout = computeMasonryLayout({ columns: 3, gap: 0, tolerance: Infinity, items: items(300, 10, 10, 10, 10) });
    expect(columnsOf(layout)).toEqual([0, 1, 2, 0, 1]);
    expect(layout.placements[3]!.y).toBe(300);
  });

  it("puts spanning items where all their columns end highest", () => {
    const layout = computeMasonryLayout({
      columns: 3,
      gap: 10,
      tolerance: 0,
      items: [{ span: 1, height: 100 }, { span: 1, height: 20 }, { span: 1, height: 40 }, { span: 2, height: 50 }, { span: 5, height: 10 }],
    });
    expect(layout.placements.slice(3)).toEqual([
      { column: 1, span: 2, y: 50 },
      { column: 0, span: 3, y: 110 },
    ]);
    expect(layout.height).toBe(120);
  });

  it("keeps items in the columns they are given", () => {
    const layout = computeMasonryLayout({
      columns: 3,
      gap: 0,
      tolerance: 0,
      items: [{ span: 1, height: 100, column: 2 }, { span: 2, height: 10, column: 2 }, { span: 1, height: 10 }],
    });
    expect(columnsOf(layout)).toEqual([2, 1, 0]);
    expect(layout.placements[1]!.y).toBe(100);
  });

  it("leaves out the last gap and counts negative heights as zero", () => {
    // The second item counts as zero high, so the third lands right below it at 8 and ends at 18.
    expect(computeMasonryLayout({ columns: 2, gap: 8, tolerance: 0, items: items(10, -40, 10) }).height).toBe(18);
    expect(computeMasonryLayout({ columns: 2, gap: 8, tolerance: 0, items: [] }).height).toBe(0);
  });

  it("rejects columns and spans that are not whole numbers of at least 1", () => {
    expect(() => computeMasonryLayout({ columns: 0, gap: 0, tolerance: 0, items: [] })).toThrow("at least 1, not 0");
    expect(() => computeMasonryLayout({ columns: 2, gap: 0, tolerance: 0, items: [{ span: 1.5, height: 1 }] })).toThrow("not 1.5");
  });
});

describe("countColumns", () => {
  it("fits as many columns as repeat(auto-fill) would, within the maximum", () => {
    expect(countColumns(600, 12, 180, Infinity)).toBe(3);
    expect(countColumns(600, 12, 180, 2)).toBe(2);
    expect(countColumns(100, 12, 180, Infinity)).toBe(1);
  });
});
