import type { GridItemLayout } from "./types";
import { describe, expect, it } from "vitest";
import { breakpointFor, resolveBreakpoints, resolveLayouts } from "./breakpoints";

const BREAKPOINTS = resolveBreakpoints({ lg: 1200, sm: 600, md: 900 }, { lg: 12, md: 8, sm: 4 });

function places(layout: readonly GridItemLayout[] | undefined): string[] {
  return (layout ?? []).map(entry => `${entry.value} ${entry.x},${entry.y} ${entry.w}x${entry.h}`);
}

describe("grid breakpoints", () => {
  it("orders breakpoints from the narrowest and gives each its columns", () => {
    expect(BREAKPOINTS.map(({ name, columns }) => `${name} ${columns}`)).toEqual(["sm 4", "md 8", "lg 12"]);
    expect(() => resolveBreakpoints({ lg: 1200, sm: 600 }, { lg: 12 })).toThrow("The sm breakpoint needs a whole number of columns");
    expect(() => resolveBreakpoints({}, 12)).toThrow("at least one breakpoint");
  });

  it("finds the widest breakpoint a width reaches", () => {
    expect(breakpointFor(1300, BREAKPOINTS).name).toBe("lg");
    expect(breakpointFor(900, BREAKPOINTS).name).toBe("md");
    expect(breakpointFor(100, BREAKPOINTS).name).toBe("sm");
  });

  it("derives missing layouts from the nearest wider one, else the nearest narrower one", () => {
    const rules = { compact: "vertical", collision: "push" } as const;
    const lg = [{ value: "a", x: 0, y: 0, w: 6, h: 2 }, { value: "b", x: 6, y: 0, w: 6, h: 2 }];
    const fromWider = resolveLayouts({ breakpoints: BREAKPOINTS, layouts: { lg }, derivation: "scale", rules, values: null });
    expect(places(fromWider.get("md"))).toEqual(["a 0,0 4x2", "b 4,0 4x2"]);
    expect(places(fromWider.get("sm"))).toEqual(["a 0,0 2x2", "b 2,0 2x2"]);
    const sm = [{ value: "a", x: 0, y: 0, w: 4, h: 1 }];
    const fromNarrower = resolveLayouts({ breakpoints: BREAKPOINTS, layouts: { sm }, derivation: "clamp", rules, values: ["a", "c"] });
    expect(places(fromNarrower.get("lg"))).toEqual(["a 0,0 4x1", "c 0,1 1x1"]);
  });

  it("rejects layouts for breakpoints it does not have", () => {
    const rules = { compact: "vertical", collision: "push" } as const;
    expect(() => resolveLayouts({ breakpoints: BREAKPOINTS, layouts: { xl: [] }, derivation: "scale", rules, values: null }))
      .toThrow("layout for \"xl\", which is not one of its breakpoints");
  });
});
