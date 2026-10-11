import { describe, expect, it } from "vitest";
import { resolveSides, stuckSides } from "./sides";

describe("resolveSides", () => {
  it("keeps physical sides and maps inline sides by reading direction", () => {
    expect(resolveSides(["top", "inline-start"], "ltr")).toEqual([
      { side: "top", physical: "top" },
      { side: "inline-start", physical: "left" },
    ]);
    expect(resolveSides(["inline-start", "inline-end"], "rtl")).toEqual([
      { side: "inline-start", physical: "right" },
      { side: "inline-end", physical: "left" },
    ]);
  });

  it("rejects no sides and the same side twice", () => {
    expect(() => resolveSides([], "ltr")).toThrow("needs at least one side");
    expect(() => resolveSides(["left", "inline-start"], "ltr")).toThrow("names the same side more than once");
    expect(resolveSides(["left", "inline-start"], "rtl")).toHaveLength(2);
  });
});

describe("stuckSides", () => {
  const sides = resolveSides(["top", "right", "bottom", "left"], "ltr");

  it("reads the side from the direction the element moved", () => {
    expect(stuckSides({ x: 0, y: 12 }, sides)).toEqual(["top"]);
    expect(stuckSides({ x: 0, y: -12 }, sides)).toEqual(["bottom"]);
    expect(stuckSides({ x: 8, y: 0 }, sides)).toEqual(["left"]);
    expect(stuckSides({ x: -8, y: 3 }, sides)).toEqual(["top", "right"]);
  });

  it("ignores rounding and sides that were not asked for", () => {
    expect(stuckSides({ x: 0.4, y: -0.4 }, sides)).toEqual([]);
    expect(stuckSides({ x: 0, y: 20 }, resolveSides(["bottom"], "ltr"))).toEqual([]);
  });

  it("names inline sides as they were asked for", () => {
    expect(stuckSides({ x: -5, y: 0 }, resolveSides(["inline-start"], "rtl"))).toEqual(["inline-start"]);
  });
});
