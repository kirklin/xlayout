import { describe, expect, it } from "vitest";
import { parseLength, toCssLength, toPixels } from "./length";

const context = { rootFontSize: 16, fontSize: 14, viewportWidth: 1200 };

describe("sidebar lengths", () => {
  it("treats numbers as pixels", () => {
    expect(parseLength(240)).toEqual({ value: 240, unit: "px" });
    expect(toCssLength(240)).toBe("240px");
  });

  it("converts every supported unit to pixels", () => {
    expect(toPixels("16rem", context)).toBe(256);
    expect(toPixels("10em", context)).toBe(140);
    expect(toPixels("20vw", context)).toBe(240);
    expect(toPixels("300px", context)).toBe(300);
    expect(toCssLength("16rem")).toBe("16rem");
  });

  it("rejects negative and unknown lengths", () => {
    expect(() => parseLength(-1)).toThrow("Invalid sidebar length: -1");
    expect(() => parseLength("20%" as never)).toThrow("Invalid sidebar length \"20%\"");
  });
});
