import { describe, expect, it } from "vitest";
import { resolveBreakpoints } from "./breakpoints";
import { containerName, gridStyles } from "./styles";

describe("grid styles", () => {
  it("lays the grid out and places items at the narrowest breakpoint always and at wider ones in container queries", () => {
    const breakpoints = resolveBreakpoints({ wide: 800, narrow: 0 }, { wide: 12, narrow: 4 });
    const layouts = new Map([
      ["narrow", [{ value: "a", x: 0, y: 0, w: 4, h: 1 }]],
      ["wide", [{ value: "a", x: 2, y: 1, w: 6, h: 2 }]],
    ]);
    expect(gridStyles({ scope: "r1", breakpoints, layouts, rowHeight: 120, gap: 8 })).toBe(
      "[data-xlayout-grid=\"r1\"]{container-type:inline-size;container-name:xlayout-grid-r1}"
      + "[data-xlayout-grid-canvas=\"r1\"]{display:grid;grid-template-columns:repeat(var(--xlayout-grid-columns),minmax(0,1fr));grid-auto-rows:120px;gap:8px;position:relative}"
      + "[data-xlayout-grid-canvas=\"r1\"]>[data-xlayout-grid-item]{grid-column:calc(var(--xlayout-grid-x) + 1)/span var(--xlayout-grid-w);grid-row:calc(var(--xlayout-grid-y) + 1)/span var(--xlayout-grid-h)}"
      + "[data-xlayout-grid-canvas=\"r1\"]{--xlayout-grid-columns:4}"
      + "[data-xlayout-grid-canvas=\"r1\"]>[data-xlayout-grid-item=\"a\"]{--xlayout-grid-x:0;--xlayout-grid-y:0;--xlayout-grid-w:4;--xlayout-grid-h:1}"
      + "@container xlayout-grid-r1 (min-width: 800px){"
      + "[data-xlayout-grid-canvas=\"r1\"]{--xlayout-grid-columns:12}"
      + "[data-xlayout-grid-canvas=\"r1\"]>[data-xlayout-grid-item=\"a\"]{--xlayout-grid-x:2;--xlayout-grid-y:1;--xlayout-grid-w:6;--xlayout-grid-h:2}"
      + "}",
    );
  });

  it("escapes item values and makes scopes valid container names", () => {
    const breakpoints = resolveBreakpoints({ base: 0 }, 2);
    const layouts = new Map([["base", [{ value: "say \"hi\"\\", x: 0, y: 0, w: 1, h: 1 }]]]);
    const css = gridStyles({ scope: "«r2»", breakpoints, layouts, rowHeight: 100, gap: 10 });
    expect(css).toContain("[data-xlayout-grid-item=\"say \\\"hi\\\"\\\\\"]");
    expect(containerName("«r2»")).toBe("xlayout-grid--r2-");
  });
});
