import { describe, expect, it } from "vitest";
import { formatAriaShortcut, isApplePlatform, matchesShortcut, parseShortcut } from "./shortcut";

function keyEvent(key: string, modifiers: Partial<{ ctrl: boolean; meta: boolean; alt: boolean; shift: boolean; code: string }> = {}): {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
} {
  return {
    key,
    code: modifiers.code ?? `Key${key.toUpperCase()}`,
    ctrlKey: modifiers.ctrl ?? false,
    metaKey: modifiers.meta ?? false,
    altKey: modifiers.alt ?? false,
    shiftKey: modifiers.shift ?? false,
  };
}

describe("parseShortcut", () => {
  it("reads modifiers and the key", () => {
    expect(parseShortcut("mod+b")).toEqual({ key: "b", mod: true, ctrl: false, meta: false, alt: false, shift: false });
    expect(parseShortcut("Ctrl+Shift+E")).toEqual({ key: "e", mod: false, ctrl: true, meta: false, alt: false, shift: true });
    expect(parseShortcut("cmd+option+k")).toEqual({ key: "k", mod: false, ctrl: false, meta: true, alt: true, shift: false });
  });

  it("rejects unknown modifiers and empty shortcuts", () => {
    expect(() => parseShortcut("hyper+b")).toThrow("Unknown modifier \"hyper\"");
    expect(() => parseShortcut("")).toThrow("Invalid shortcut \"\"");
  });
});

describe("matchesShortcut", () => {
  const toggle = parseShortcut("mod+b");

  it("uses Command on Apple platforms and Control elsewhere", () => {
    expect(matchesShortcut(keyEvent("b", { meta: true }), toggle, true)).toBe(true);
    expect(matchesShortcut(keyEvent("b", { ctrl: true }), toggle, true)).toBe(false);
    expect(matchesShortcut(keyEvent("b", { ctrl: true }), toggle, false)).toBe(true);
  });

  it("requires exactly the listed modifiers", () => {
    expect(matchesShortcut(keyEvent("b", { ctrl: true, shift: true }), toggle, false)).toBe(false);
    expect(matchesShortcut(keyEvent("b"), toggle, false)).toBe(false);
  });

  it("matches letters by physical key for other keyboard layouts", () => {
    expect(matchesShortcut(keyEvent("и", { ctrl: true, code: "KeyB" }), toggle, false)).toBe(true);
  });
});

describe("formatAriaShortcut", () => {
  it("lists both platform variants for mod", () => {
    expect(formatAriaShortcut(parseShortcut("mod+b"))).toBe("Control+B Meta+B");
    expect(formatAriaShortcut(parseShortcut("alt+shift+\\"))).toBe("Alt+Shift+\\");
  });
});

describe("isApplePlatform", () => {
  it("recognises Apple devices", () => {
    expect(isApplePlatform({ platform: "MacIntel", userAgent: "" })).toBe(true);
    expect(isApplePlatform({ platform: "", userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" })).toBe(true);
    expect(isApplePlatform({ platform: "Win32", userAgent: "Mozilla/5.0 (Windows NT 10.0)" })).toBe(false);
  });
});
