import type { ShellLength } from "./types";

const LENGTH_PATTERN = /^(\d+(?:\.\d+)?|\.\d+)(px|rem|em|vw)$/;

export interface LengthContext {
  rootFontSize: number;
  fontSize: number;
  viewportWidth: number;
}

export function parseLength(length: ShellLength): { value: number; unit: "px" | "rem" | "em" | "vw" } {
  if (typeof length === "number") {
    if (!Number.isFinite(length) || length < 0) {
      throw new TypeError(`Invalid sidebar length: ${length}`);
    }
    return { value: length, unit: "px" };
  }
  const match = LENGTH_PATTERN.exec(length.trim());
  if (!match) {
    throw new TypeError(`Invalid sidebar length "${length}". Use a number of pixels or a string ending in px, rem, em or vw.`);
  }
  return { value: Number(match[1]), unit: match[2] as "px" | "rem" | "em" | "vw" };
}

export function toPixels(length: ShellLength, context: LengthContext): number {
  const { value, unit } = parseLength(length);
  switch (unit) {
    case "px": {
      return value;
    }
    case "rem": {
      return value * context.rootFontSize;
    }
    case "em": {
      return value * context.fontSize;
    }
    case "vw": {
      return (value * context.viewportWidth) / 100;
    }
    default: {
      unit satisfies never;
      throw new TypeError(`Unknown unit in "${length}".`);
    }
  }
}

/** The length as it is written in CSS. */
export function toCssLength(length: ShellLength): string {
  return typeof length === "number" ? `${length}px` : length;
}

export function readLengthContext(element: Element): LengthContext {
  const ownerDocument = element.ownerDocument;
  const ownerWindow = ownerDocument.defaultView;
  if (!ownerWindow) {
    throw new Error("Lengths can only be measured in a document with a window.");
  }
  return {
    rootFontSize: Number.parseFloat(ownerWindow.getComputedStyle(ownerDocument.documentElement).fontSize),
    fontSize: Number.parseFloat(ownerWindow.getComputedStyle(element).fontSize),
    viewportWidth: ownerWindow.innerWidth,
  };
}
