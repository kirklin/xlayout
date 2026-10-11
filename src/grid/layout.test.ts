import type { GridItemLayout, GridLayout, GridRules } from "./types";
import { describe, expect, it } from "vitest";
import { collides, compactLayout, deriveLayout, fitItem, normalizeLayout, placeMissing, resolveMove, resolveResize, validateLayout } from "./layout";

const PUSH: GridRules = { columns: 12, compact: "vertical", collision: "push" };

function item(value: string, x: number, y: number, w: number, h: number, extra: Partial<GridItemLayout> = {}): GridItemLayout {
  return { value, x, y, w, h, ...extra };
}

function places(layout: GridLayout | null): string[] {
  return layout === null ? ["blocked"] : layout.map(entry => `${entry.value} ${entry.x},${entry.y} ${entry.w}x${entry.h}`);
}

describe("grid layout", () => {
  it("tells overlapping cells from touching ones", () => {
    expect(collides(item("a", 0, 0, 2, 2), item("b", 2, 0, 2, 2))).toBe(false);
    expect(collides(item("a", 0, 0, 2, 2), item("b", 1, 1, 2, 2))).toBe(true);
  });

  it("compacts upward around static items", () => {
    const layout = [item("a", 0, 0, 2, 1), item("b", 0, 3, 2, 2), item("c", 2, 5, 1, 1), item("s", 0, 1, 1, 1, { static: true })];
    expect(places(compactLayout(layout, "vertical"))).toEqual(["a 0,0 2x1", "b 0,2 2x2", "c 2,0 1x1", "s 0,1 1x1"]);
  });

  it("compacts toward the inline start", () => {
    const layout = [item("a", 3, 0, 2, 1), item("b", 6, 0, 1, 1), item("c", 1, 1, 1, 1)];
    expect(places(compactLayout(layout, "horizontal"))).toEqual(["a 0,0 2x1", "b 2,0 1x1", "c 0,1 1x1"]);
    expect(places(compactLayout(layout, "none"))).toEqual(places(layout));
  });

  it("fits items into the grid and their limits, the grid's width first", () => {
    expect(fitItem(item("a", 10, 0, 5, 1), 12)).toMatchObject({ x: 7, w: 5 });
    expect(fitItem(item("a", 0, -2, 1, 9, { minW: 4, maxH: 3 }), 3)).toMatchObject({ x: 0, y: 0, w: 3, h: 3 });
  });

  it("moves overlapping items down before compacting, unless overlaps are allowed", () => {
    const layout = [item("a", 0, 0, 4, 2), item("b", 2, 1, 4, 2)];
    expect(places(normalizeLayout(layout, PUSH))).toEqual(["a 0,0 4x2", "b 2,2 4x2"]);
    expect(places(normalizeLayout(layout, { ...PUSH, collision: "overlap" }))).toEqual(places(layout));
  });

  it("moves an item into free space and lets it rise", () => {
    const snapshot = [item("a", 0, 0, 2, 2), item("b", 4, 0, 2, 2)];
    expect(places(resolveMove(snapshot, "a", { x: 8, y: 3 }, PUSH))).toEqual(["a 8,0 2x2", "b 4,0 2x2"]);
    expect(places(resolveMove(snapshot, "a", { x: 20, y: -4 }, PUSH))).toEqual(["a 10,0 2x2", "b 4,0 2x2"]);
  });

  it("swaps with a single item once the moved one passes its middle, in either direction", () => {
    const row = [item("a", 0, 0, 2, 2), item("b", 2, 0, 2, 2)];
    expect(places(resolveMove(row, "a", { x: 1, y: 0 }, PUSH))).toEqual(["blocked"]);
    expect(places(resolveMove(row, "a", { x: 2, y: 0 }, PUSH))).toEqual(["a 2,0 2x2", "b 0,0 2x2"]);
    expect(places(resolveMove(row, "b", { x: 1, y: 0 }, PUSH))).toEqual(["blocked"]);
    expect(places(resolveMove(row, "b", { x: 0, y: 0 }, PUSH))).toEqual(["a 2,0 2x2", "b 0,0 2x2"]);
    const column = [item("a", 0, 0, 2, 2), item("b", 0, 2, 2, 2)];
    expect(places(resolveMove(column, "a", { x: 0, y: 1 }, PUSH))).toEqual(["blocked"]);
    expect(places(resolveMove(column, "a", { x: 0, y: 2 }, PUSH))).toEqual(["a 0,2 2x2", "b 0,0 2x2"]);
  });

  it("pushes several items in the way down", () => {
    const snapshot = [item("a", 0, 0, 4, 1), item("b", 0, 1, 2, 1), item("c", 2, 1, 2, 1), item("d", 4, 0, 4, 2)];
    expect(places(resolveMove(snapshot, "d", { x: 0, y: 1 }, PUSH))).toEqual(["a 0,0 4x1", "b 0,3 2x1", "c 2,3 2x1", "d 0,1 4x2"]);
  });

  it("refuses moves onto other items when blocking, and onto static items always", () => {
    const snapshot = [item("a", 0, 0, 2, 2), item("b", 2, 0, 2, 2), item("s", 6, 0, 2, 2, { static: true })];
    const block = { ...PUSH, collision: "block" } as const;
    expect(places(resolveMove(snapshot, "a", { x: 3, y: 0 }, block))).toEqual(["blocked"]);
    expect(places(resolveMove(snapshot, "a", { x: 4, y: 0 }, block))).toEqual(["a 4,0 2x2", "b 2,0 2x2", "s 6,0 2x2"]);
    expect(places(resolveMove(snapshot, "a", { x: 5, y: 0 }, PUSH))).toEqual(["blocked"]);
    expect(places(resolveMove(snapshot, "s", { x: 9, y: 0 }, PUSH))).toEqual(["blocked"]);
  });

  it("lets items overlap when asked to", () => {
    const snapshot = [item("a", 0, 0, 2, 2), item("b", 2, 0, 2, 2)];
    const overlap = { ...PUSH, collision: "overlap" } as const;
    expect(places(resolveMove(snapshot, "a", { x: 1, y: 3 }, overlap))).toEqual(["a 1,3 2x2", "b 2,0 2x2"]);
  });

  it("resizes from the far corner within limits, pushing what is in the way", () => {
    const snapshot = [item("a", 0, 0, 2, 2, { maxW: 6 }), item("b", 2, 0, 2, 2)];
    expect(places(resolveResize(snapshot, "a", { w: 4, h: 2 }, PUSH))).toEqual(["a 0,0 4x2", "b 2,2 2x2"]);
    expect(places(resolveResize(snapshot, "a", { w: 9, h: 0 }, PUSH))).toEqual(["a 0,0 6x1", "b 2,1 2x2"]);
    expect(places(resolveResize(snapshot, "b", { w: 20, h: 1 }, PUSH))).toEqual(["a 0,0 2x2", "b 2,0 10x1"]);
    expect(places(resolveResize(snapshot, "a", { w: 3, h: 2 }, { ...PUSH, collision: "block" }))).toEqual(["blocked"]);
  });

  it("resizes from any edge or corner, keeping the opposite one and the grid's bounds", () => {
    const snapshot = [item("a", 4, 2, 2, 2, { minW: 1, maxW: 5 }), item("b", 0, 0, 2, 1)];
    const none = { ...PUSH, compact: "none" } as const;
    // From the start the item grows toward the inline start, its end staying at column 6.
    expect(places(resolveResize(snapshot, "a", { w: 4, h: 9 }, none, "start"))).toEqual(["a 2,2 4x2", "b 0,0 2x1"]);
    expect(places(resolveResize(snapshot, "a", { w: 9, h: 2 }, none, "start"))).toEqual(["a 1,2 5x2", "b 0,0 2x1"]);
    // From the top it grows up to the first row at most, its bottom staying at row 4.
    expect(places(resolveResize(snapshot, "a", { w: 9, h: 3 }, none, "top"))).toEqual(["a 4,1 2x3", "b 0,0 2x1"]);
    expect(places(resolveResize(snapshot, "a", { w: 2, h: 9 }, none, "top"))).toEqual(["a 4,0 2x4", "b 0,0 2x1"]);
    expect(places(resolveResize(snapshot, "a", { w: 3, h: 3 }, none, "top-start"))).toEqual(["a 3,1 3x3", "b 0,0 2x1"]);
    expect(places(resolveResize(snapshot, "a", { w: 3, h: 3 }, none, "bottom-start"))).toEqual(["a 3,2 3x3", "b 0,0 2x1"]);
    expect(places(resolveResize(snapshot, "a", { w: 3, h: 3 }, none, "top-end"))).toEqual(["a 4,1 3x3", "b 0,0 2x1"]);
    expect(places(resolveResize(snapshot, "a", { w: 1, h: 1 }, none, "end"))).toEqual(["a 4,2 1x2", "b 0,0 2x1"]);
    // Growing into another item from the start pushes it out of the way.
    const crowded = [item("a", 2, 0, 2, 1), item("b", 0, 0, 2, 1)];
    expect(places(resolveResize(crowded, "a", { w: 4, h: 1 }, PUSH, "start"))).toEqual(["a 0,0 4x1", "b 0,1 2x1"]);
  });

  it("scales or clamps a layout for another number of columns", () => {
    const layout = [item("a", 0, 0, 4, 2), item("b", 4, 0, 8, 2)];
    expect(places(deriveLayout(layout, 12, 6, "scale"))).toEqual(["a 0,0 2x2", "b 2,0 4x2"]);
    expect(places(deriveLayout(layout, 12, 6, "clamp"))).toEqual(["a 0,0 4x2", "b 0,0 6x2"]);
  });

  it("adds items the layout does not place yet below everything", () => {
    expect(places(placeMissing([item("a", 0, 0, 2, 3)], ["a", "b", "c"], 12))).toEqual(["a 0,0 2x3", "b 0,3 1x1", "c 1,3 1x1"]);
  });

  it("rejects places twice and positions or sizes that are not whole numbers in range", () => {
    expect(() => validateLayout([item("a", 0, 0, 1, 1), item("a", 1, 0, 1, 1)], "lg")).toThrow("places \"a\" more than once");
    expect(() => validateLayout([item("a", 0.5, 0, 1, 1)], "lg")).toThrow("positions are whole numbers");
    expect(() => validateLayout([item("a", 0, 0, 0, 1)], "lg")).toThrow("sizes from 1");
  });
});

/** The rules as written: every item looks at every other one, without regard for speed. */
function referenceNormalize(layout: GridLayout, rules: GridRules): GridItemLayout[] {
  const fitted = layout.map(entry => fitItem(entry, rules.columns));
  const byValue = (entries: GridItemLayout[]): Map<string, GridItemLayout> => new Map(entries.map(entry => [entry.value, entry]));
  const placed = fitted.filter(entry => entry.static);
  const settled = byValue(placed);
  for (const entry of fitted.filter(other => !other.static).sort((a, b) => a.y - b.y || a.x - b.x)) {
    let current = entry;
    for (let blocker = placed.find(other => collides(current, other)); blocker; blocker = placed.find(other => collides(current, other))) {
      current = { ...current, y: blocker.y + blocker.h };
    }
    placed.push(current);
    settled.set(current.value, current);
  }
  const overlapsGone = fitted.map(entry => settled.get(entry.value)!);
  if (rules.compact === "none") {
    return overlapsGone;
  }
  const vertical = rules.compact === "vertical";
  const statics = overlapsGone.filter(entry => entry.static);
  const reach = new Map<number, number>();
  const compacted = byValue(statics);
  const moving = overlapsGone.filter(entry => !entry.static).sort((a, b) => (vertical ? a.y - b.y || a.x - b.x : a.x - b.x || a.y - b.y));
  for (const entry of moving) {
    const lanes = Array.from({ length: vertical ? entry.w : entry.h }, (_, index) => (vertical ? entry.x : entry.y) + index);
    const start = Math.max(0, ...lanes.map(lane => reach.get(lane) ?? 0));
    let current: GridItemLayout = vertical ? { ...entry, y: start } : { ...entry, x: start };
    for (let blocker = statics.find(other => collides(current, other)); blocker; blocker = statics.find(other => collides(current, other))) {
      current = vertical ? { ...current, y: blocker.y + blocker.h } : { ...current, x: blocker.x + blocker.w };
    }
    for (const lane of lanes) {
      reach.set(lane, vertical ? current.y + current.h : current.x + current.w);
    }
    compacted.set(entry.value, current);
  }
  return overlapsGone.map(entry => compacted.get(entry.value)!);
}

function randomLayout(random: () => number, count: number, columns: number): GridItemLayout[] {
  return Array.from({ length: count }, (_, index) => {
    const w = 1 + Math.floor(random() * Math.min(4, columns));
    return item(`item-${index}`, Math.floor(random() * columns), Math.floor(random() * count / 2), w, 1 + Math.floor(random() * 3), random() < 0.1 ? { static: true } : {});
  });
}

describe("grid layout with many items", () => {
  it("settles and compacts as the rules read, written out plainly, for random layouts", () => {
    let seed = 5;
    const random = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let round = 0; round < 300; round++) {
      const columns = 1 + Math.floor(random() * 12);
      const layout = randomLayout(random, Math.floor(random() * 40), columns);
      const rules: GridRules = { columns, compact: (["vertical", "horizontal", "none"] as const)[round % 3]!, collision: "push" };
      expect(normalizeLayout(layout, rules)).toEqual(referenceNormalize(layout, rules));
    }
  });

  it("lays out and moves among thousands of items quickly", () => {
    let seed = 9;
    const random = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const layout = randomLayout(random, 3000, 12).map(entry => ({ ...entry, static: false }));
    let start = performance.now();
    const settled = normalizeLayout(layout, PUSH);
    expect(performance.now() - start).toBeLessThan(500);
    start = performance.now();
    for (let move = 0; move < 20; move++) {
      expect(resolveMove(settled, "item-0", { x: move % 10, y: 40 + move }, PUSH)).not.toBeNull();
    }
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
