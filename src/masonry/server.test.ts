import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import * as Masonry from "./index";

describe("masonry on the server", () => {
  it("renders a plain grid until the browser measures it", () => {
    const responsive = renderToString(createElement(Masonry.Root, { minColumnWidth: 120 }, createElement(Masonry.Item, { span: 2 })));
    expect(responsive).toContain("display:grid;grid-template-columns:repeat(auto-fill, minmax(min(120px, 100%), 1fr))");
    expect(responsive).toContain("grid-column:span 2");
    const fixed = renderToString(createElement(Masonry.Root, { columns: 3 }));
    expect(fixed).toContain("grid-template-columns:repeat(3, minmax(0, 1fr))");
  });
});
