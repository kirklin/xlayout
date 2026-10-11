import { describe, expect, it } from "vitest";
import { preparePositions, redistributePositions, selectPrepared, selectSection } from "./select";

describe("redistributePositions", () => {
  it("leaves positions alone when nothing scrolls", () => {
    expect(redistributePositions([0, 300, 900], 800, 0)).toEqual([0, 300, 900]);
  });

  it("spreads positions past the end over the last eighth of the scrollport", () => {
    // The stretch is min(800 / 8, 1000 / 2) = 100, so the last stretch starts at 900.
    expect(redistributePositions([0, 400, 950, 1100, 1300], 800, 1000)).toEqual([0, 400, 912.5, 950, 1000]);
  });

  it("spreads positions before the start over the first stretch", () => {
    expect(redistributePositions([-200, -50, 30, 500], 800, 1000)).toEqual([0, 50, 230 / 3, 500]);
  });

  it("uses half the scroll range when that is shorter", () => {
    // The stretch is min(800 / 8, 120 / 2) = 60, so it starts at 60 and 70 lands at 60 + 10 / 140 * 60.
    expect(redistributePositions([0, 70, 200], 800, 120)).toEqual([0, 60 + 30 / 7, 120]);
  });
});

describe("selectSection", () => {
  it("picks the last section whose position scrolling has reached", () => {
    expect(selectSection([0, 400, 900], 0, 800)).toBe(0);
    expect(selectSection([0, 400, 900], 399.5, 800)).toBe(1);
    expect(selectSection([0, 400, 900], 950, 800)).toBe(2);
  });

  it("picks the first of several sections at the same position", () => {
    expect(selectSection([0, 300, 300, 600], 350, 800)).toBe(1);
  });

  it("moves on early once the previous section started more than half a scrollport above", () => {
    // The section at 1000 starts within the upper half while the one before started at 0.
    expect(selectSection([0, 1000], 700, 800)).toBe(1);
    expect(selectSection([0, 1000], 500, 800)).toBe(0);
  });

  it("finds nothing before the first section", () => {
    expect(selectSection([200, 600], 0, 300)).toBe(-1);
    expect(selectSection([], 0, 300)).toBe(-1);
  });

  it("selects as the rule reads, written out plainly, for random positions", () => {
    // Every distinct position is looked at in turn, the way the specification describes it.
    const reference = (positions: number[], scrollPosition: number, scrollportSize: number): number => {
      const distinct = [...new Set(positions)].sort((a, b) => a - b);
      let selected: number | undefined;
      distinct.forEach((position, index) => {
        const previous = distinct[index - 1];
        const reached = position <= scrollPosition + 1;
        const leads = previous !== undefined && previous < scrollPosition - scrollportSize / 2 && position < scrollPosition + scrollportSize / 2;
        if (reached || leads) {
          selected = position;
        }
      });
      return selected === undefined ? -1 : positions.indexOf(selected);
    };
    let seed = 13;
    const random = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let round = 0; round < 500; round++) {
      const positions = Array.from({ length: Math.floor(random() * 30) }, () => Math.floor(random() * 40) * 50);
      const scrollPosition = Math.floor(random() * 2200) - 100;
      const scrollportSize = 100 + Math.floor(random() * 900);
      expect(selectSection(positions, scrollPosition, scrollportSize)).toBe(reference(positions, scrollPosition, scrollportSize));
    }
  });

  it("selects among a hundred thousand sections quickly", () => {
    const positions = Array.from({ length: 100_000 }, (_, index) => index * 40);
    const prepared = preparePositions(redistributePositions(positions, 800, 4_000_000 - 800));
    const start = performance.now();
    const selected = Array.from({ length: 1000 }, (_, frame) => selectPrepared(prepared, frame * 3000, 800));
    expect(performance.now() - start).toBeLessThan(50);
    expect(selected).toEqual(Array.from({ length: 1000 }, (_, frame) => Math.floor((frame * 3000 + 1) / 40)));
  });
});
