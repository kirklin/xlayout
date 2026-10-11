import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import * as Grid from "./index";

describe("grid on the server", () => {
  it("renders every breakpoint's layout as style rules, so items are placed before scripts run", () => {
    const html = renderToString(createElement(
      Grid.Root,
      {
        breakpoints: { wide: 800, narrow: 0 },
        columns: { wide: 12, narrow: 4 },
        defaultLayouts: { wide: [{ value: "chart", x: 2, y: 0, w: 6, h: 2 }] },
      },
      createElement(Grid.Item, { value: "chart" }),
    ));
    expect(html).toContain("container-type:inline-size");
    expect(html).toContain("--xlayout-grid-columns:4");
    expect(html).toMatch(/@container xlayout-grid-\S+ \(min-width: 800px\)\{[^}]*--xlayout-grid-columns:12\}[^}]*--xlayout-grid-x:2;--xlayout-grid-y:0;--xlayout-grid-w:6;--xlayout-grid-h:2\}/);
    expect(html).toContain("data-xlayout-grid-item=\"chart\"");
  });
});
