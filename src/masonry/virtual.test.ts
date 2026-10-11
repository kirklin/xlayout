import type { Placements } from "./place";
import type { VirtualConfig } from "./virtual";
import { describe, expect, it } from "vitest";
import { CHECKPOINT_INTERVAL } from "./constants";
import { placeItems } from "./place";
import { VirtualPlacement } from "./virtual";

function randomFrom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

function configOf(count: number, overrides: Partial<VirtualConfig<number>> = {}): VirtualConfig<number> {
  return {
    columns: 4,
    columnWidth: 200,
    gap: 8,
    tolerance: 16,
    count,
    keyOf: index => index,
    spanOf: index => (index % 13 === 0 ? 2 : 1),
    estimateOf: index => 100 + (index * 53) % 150,
    stable: false,
    layoutKey: undefined,
    ...overrides,
  };
}

/** Every item placed at once, with the heights measured so far in place of the estimates. */
function referenceOf(config: VirtualConfig<number>, measured: ReadonlyMap<number, number>): Placements {
  return placeItems({
    columns: config.columns,
    gap: config.gap,
    tolerance: config.tolerance,
    count: config.count,
    spanOf: config.spanOf,
    heightOf: index => measured.get(config.keyOf(index)) ?? config.estimateOf(index),
    columnOf: () => undefined,
  });
}

function expectPlacedAsReference(placement: VirtualPlacement<number>, reference: Placements, through: number): void {
  for (let index = 0; index < through; index++) {
    expect(placement.placement(index)).toEqual({ column: reference.columns[index], span: reference.spans[index], y: reference.tops[index] });
  }
}

/** The items whose boxes reach into the range, found by looking at every one. */
function inRangeOf(reference: Placements, top: number, bottom: number): number[] {
  return Array.from(reference.tops.keys()).filter(index => reference.tops[index]! <= bottom && reference.tops[index]! + reference.heights[index]! >= top);
}

describe("virtual placement", () => {
  it("places items as placeItems does, only as far down as asked", () => {
    const config = configOf(5000);
    const placement = new VirtualPlacement(config);
    const reference = referenceOf(config, new Map());
    expect(placement.inRange({ top: 0, bottom: 1000 }, null)).toEqual(inRangeOf(reference, 0, 1000));
    expect(placement.placedCount).toBeLessThan(100);
    expectPlacedAsReference(placement, reference, 5000);
    expect(placement.height()).toBe(reference.height);
  });

  it("finds the items in any range, skipping the stretches above it", () => {
    const random = randomFrom(3);
    const config = configOf(3000, { tolerance: 0 });
    const placement = new VirtualPlacement(config);
    const reference = referenceOf(config, new Map());
    for (let round = 0; round < 200; round++) {
      const top = random() * reference.height;
      const bottom = top + random() * 2000;
      expect(placement.inRange({ top, bottom }, null)).toEqual(inRangeOf(reference, top, bottom));
    }
  });

  it("places again from shortly before an item whose height changed", () => {
    const random = randomFrom(11);
    const config = configOf(4000);
    const placement = new VirtualPlacement(config);
    const measured = new Map<number, number>();
    placement.inRange({ top: 0, bottom: 60_000 }, null);
    const placedBefore = placement.placedCount;
    expect(placement.measure(1000, 1000, 333)).toBe(true);
    measured.set(1000, 333);
    expect(placement.measure(1000, 1000, 333)).toBe(false);
    expect(placement.placedCount).toBe(Math.floor(1000 / CHECKPOINT_INTERVAL) * CHECKPOINT_INTERVAL);
    expect(placedBefore).toBeGreaterThan(1000);
    for (let round = 0; round < 300; round++) {
      const index = Math.floor(random() * 4000);
      const height = Math.floor(random() * 400);
      placement.measure(index, index, height);
      measured.set(index, height);
      if (round % 50 === 0) {
        placement.inRange({ top: random() * 50_000, bottom: random() * 100_000 }, null);
      }
    }
    expectPlacedAsReference(placement, referenceOf(config, measured), 4000);
  });

  it("estimates the height until every item is placed, and knows it after", () => {
    const config = configOf(1000, { columns: 2, gap: 0, spanOf: () => 1, estimateOf: () => 100 });
    const placement = new VirtualPlacement(config);
    placement.inRange({ top: 0, bottom: 500 }, null);
    expect(placement.placedCount).toBeLessThan(1000);
    expect(placement.height()).toBe(50_000);
    placement.measure(0, 0, 300);
    placement.inRange({ top: 0, bottom: 500 }, null);
    // The items placed cover more than 100 each now, and the estimate follows them.
    expect(placement.height()).toBeGreaterThan(50_000);
    placement.inRange({ top: 0, bottom: Infinity }, null);
    expect(placement.placedCount).toBe(1000);
    expect(placement.height()).toBe(50_100);
  });

  it("keeps the placements a longer list shares with the shorter one", () => {
    const config = configOf(800);
    const placement = new VirtualPlacement(config);
    placement.inRange({ top: 0, bottom: Infinity }, null);
    expect(placement.configure({ ...config, count: 2000 })).toBe(false);
    expect(placement.placedCount).toBe(800);
    expectPlacedAsReference(placement, referenceOf({ ...config, count: 2000 }, new Map()), 2000);
    placement.configure({ ...config, count: 300 });
    expect(placement.placedCount).toBe(Math.floor(300 / CHECKPOINT_INTERVAL) * CHECKPOINT_INTERVAL);
    expect(() => placement.placement(300)).toThrow("No masonry item has the index 300; there are 300.");
    // Other keys, spans or estimates may move any item, so placing starts over.
    placement.configure({ ...config, count: 300, keyOf: index => -index });
    expect(placement.placedCount).toBe(0);
  });

  it("lets the measured heights go when the column width changes", () => {
    const config = configOf(100);
    const placement = new VirtualPlacement(config);
    placement.measure(1, 1, 400);
    expect(placement.configure({ ...config, columns: 3 })).toBe(false);
    expect(placement.heightOf(1)).toBe(400);
    expect(placement.configure({ ...config, columns: 3, columnWidth: 260, estimateOf: () => 260 })).toBe(true);
    expect(placement.heightOf(1)).toBeUndefined();
    // The first item spans two columns; with the second as high as the others, the fifth goes below it.
    expect(placement.placement(4)).toEqual({ column: 2, span: 1, y: 260 + 8 });
  });

  it("keeps measured items in their columns with stable assignment until the layout key changes", () => {
    const config = configOf(6, { columns: 3, gap: 0, tolerance: 0, spanOf: () => 1, estimateOf: () => 100, stable: true, layoutKey: "first" });
    const placement = new VirtualPlacement(config);
    [100, 50, 80, 30, 60, 10].forEach((height, index) => placement.measure(index, index, height));
    placement.inRange({ top: 0, bottom: Infinity }, null);
    expect([3, 4].map(index => placement.placement(index).column)).toEqual([1, 2]);
    for (let index = 0; index < 6; index++) {
      placement.keep(index);
    }
    placement.measure(1, 1, 200);
    expect([3, 4].map(index => placement.placement(index))).toEqual([{ column: 1, span: 1, y: 200 }, { column: 2, span: 1, y: 80 }]);
    placement.configure({ ...config, layoutKey: "second" });
    expect([3, 4].map(index => placement.placement(index).column)).toEqual([2, 0]);
  });

  it("finds items by key and holds the extra item among those in range", () => {
    const keys = Array.from({ length: 600 }, (_, index) => `item-${index}`);
    const placement = new VirtualPlacement<string>({ ...configOf(600), keyOf: index => keys[index]! });
    expect(placement.indexOf("item-42", 42)).toBe(42);
    expect(placement.indexOf("item-42", 7)).toBe(42);
    expect(placement.indexOf("gone", 7)).toBe(-1);
    const inView = placement.inRange({ top: 0, bottom: 400 }, 500);
    expect(inView.at(-1)).toBe(500);
    expect(inView.slice(0, -1).every(index => index < 20)).toBe(true);
    const anchor = placement.anchorIn({ top: 150, bottom: 400 });
    expect(anchor).toEqual({ key: keys[anchor!.index], index: anchor!.index, top: placement.placement(anchor!.index).y });
    expect(placement.inRange({ top: 150, bottom: 400 }, null)[0]).toBe(anchor!.index);
  });

  it("rejects estimates that are not finite numbers of at least 0", () => {
    expect(() => new VirtualPlacement(configOf(10, { estimateOf: () => Number.NaN })).height()).toThrow("not NaN");
    expect(() => new VirtualPlacement(configOf(10, { estimateOf: () => -1 })).height()).toThrow("not -1");
  });

  it("follows the items in view of a million quickly", () => {
    const config = configOf(1_000_000);
    const placement = new VirtualPlacement(config);
    // The first view places only the items around it, out of the million.
    placement.inRange({ top: 0, bottom: 2000 }, null);
    placement.height();
    expect(placement.placedCount).toBeLessThan(100);
    // Scrolling to the end places every item once.
    let start = performance.now();
    const last = placement.inRange({ top: Infinity, bottom: Infinity }, null);
    expect(last).toEqual([]);
    const end = placement.height();
    placement.inRange({ top: end - 2000, bottom: end }, null);
    expect(placement.placedCount).toBe(1_000_000);
    expect(performance.now() - start).toBeLessThan(2000);
    // Measuring items in view far down and showing them again only places the items after them.
    start = performance.now();
    for (let frame = 0; frame < 60; frame++) {
      const inView = placement.inRange({ top: end / 2, bottom: end / 2 + 2000 }, null);
      for (const index of inView) {
        placement.measure(index, index, 90 + frame);
      }
      placement.inRange({ top: end / 2, bottom: end / 2 + 2000 }, null);
    }
    expect(performance.now() - start).toBeLessThan(200);
  });
});
