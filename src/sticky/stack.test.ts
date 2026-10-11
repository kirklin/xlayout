import { describe, expect, it } from "vitest";
import { stackLayers } from "./stack";

describe("stackLayers", () => {
  it("places each layer past the far edge of the layers below it", () => {
    const stack = stackLayers([
      { key: "header", layer: 0, offset: 0, size: 56 },
      { key: "toolbar", layer: 1, offset: 8, size: 40 },
      { key: "table", layer: 2, offset: 0, size: 32 },
    ]);
    expect(Object.fromEntries(stack.offsets)).toEqual({ header: 0, toolbar: 56, table: 104 });
    expect(stack.extent).toBe(136);
  });

  it("gives elements of one layer the same distance and clears the largest of them", () => {
    const stack = stackLayers([
      { key: "first", layer: 1, offset: 0, size: 30 },
      { key: "second", layer: 1, offset: 0, size: 44 },
      { key: "below", layer: 2, offset: 0, size: 20 },
    ]);
    expect(Object.fromEntries(stack.offsets)).toEqual({ first: 0, second: 0, below: 44 });
    expect(stack.extent).toBe(64);
  });

  it("reaches nowhere without elements", () => {
    expect(stackLayers([])).toEqual({ offsets: new Map(), extent: 0 });
  });
});
