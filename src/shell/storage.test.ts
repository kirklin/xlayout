import { describe, expect, it } from "vitest";
import { parseShellState, serializeShellState } from "./storage";

describe("shell state storage", () => {
  it("round-trips sidebar state", () => {
    const state = { start: { open: false, width: 300 }, end: { open: true } };
    const serialized = serializeShellState(state);
    expect(JSON.parse(serialized)).toEqual({ version: 1, sidebars: state });
    expect(parseShellState(serialized)).toEqual(state);
  });

  it("treats a missing value as no state", () => {
    expect(parseShellState(undefined)).toBeUndefined();
    expect(parseShellState(null)).toBeUndefined();
    expect(parseShellState("")).toBeUndefined();
  });

  it("rejects values that are not shell state", () => {
    expect(() => parseShellState(JSON.stringify({ version: 2, sidebars: {} }))).toThrow("not shell state");
    expect(() => parseShellState(JSON.stringify({ version: 1, sidebars: { start: { open: "yes" } } }))).toThrow("not shell state");
    expect(() => parseShellState("{")).toThrow(SyntaxError);
  });
});
