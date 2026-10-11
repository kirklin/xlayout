import type { MasonryItemInput, MasonryLayout, MasonryLayoutInput } from "./types";
import { describe, expect, it } from "vitest";
import { computeMasonryLayout, countColumns, placeItems } from "./place";

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

  it("places as the rule reads, written out plainly, for random items", () => {
    // The rule as written in the specification, without regard for speed.
    const reference = ({ columns, gap, tolerance, items: input }: MasonryLayoutInput): MasonryLayout => {
      const running = Array.from<number>({ length: columns }).fill(0);
      let cursor = 0;
      const placements = input.map((item) => {
        const span = Math.min(item.span, columns);
        const reach = (line: number): number => Math.max(...running.slice(line, line + span));
        const lines = Array.from({ length: columns - span + 1 }, (_, index) => index);
        const lowest = Math.min(...lines.map(reach));
        const tied = lines.filter(line => reach(line) <= lowest + tolerance);
        const line = item.column === undefined ? tied.find(candidate => candidate >= cursor) ?? tied[0]! : Math.min(item.column, columns - span);
        cursor = line + span;
        const y = reach(line);
        for (let column = line; column < line + span; column++) {
          running[column] = y + Math.max(0, item.height) + gap;
        }
        return { column: line, span, y };
      });
      return { placements, height: input.length > 0 ? Math.max(...running) - gap : 0 };
    };
    let seed = 7;
    const random = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let round = 0; round < 300; round++) {
      const columns = 1 + Math.floor(random() * 6);
      const input: MasonryLayoutInput = {
        columns,
        gap: Math.floor(random() * 3) * 8,
        tolerance: [0, 16, Infinity][Math.floor(random() * 3)]!,
        items: Array.from({ length: Math.floor(random() * 40) }, () => ({
          span: 1 + Math.floor(random() * 3),
          height: Math.floor(random() * 300) - 20,
          ...(random() < 0.2 ? { column: Math.floor(random() * columns) } : null),
        })),
      };
      expect(computeMasonryLayout(input)).toEqual(reference(input));
    }
  });

  it("places a hundred thousand items quickly", () => {
    const start = performance.now();
    const placed = placeItems({ columns: 5, gap: 12, tolerance: 16, count: 100_000, spanOf: index => (index % 17 === 0 ? 2 : 1), heightOf: index => 120 + (index * 37) % 200, columnOf: () => undefined });
    expect(placed.tops).toHaveLength(100_000);
    expect(performance.now() - start).toBeLessThan(200);
  });
});

describe("countColumns", () => {
  it("fits as many columns as repeat(auto-fill) would, within the maximum", () => {
    expect(countColumns(600, 12, 180, Infinity)).toBe(3);
    expect(countColumns(600, 12, 180, 2)).toBe(2);
    expect(countColumns(100, 12, 180, Infinity)).toBe(1);
  });
});
