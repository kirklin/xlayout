// @env browser
import type { Point } from "../shared/types";
import type { PhysicalSide } from "./types";
import { getOwnerWindow } from "../shared/dom";
import { PHYSICAL_SIDES, ROOT_NAME } from "./constants";

/**
 * The nearest ancestor with a box of its own. Sticking moves the element within it but never
 * moves the ancestor, so positions measured against it change only when sticking does.
 */
export function referenceOf(element: HTMLElement): HTMLElement {
  let parent = element.parentElement;
  while (parent && getOwnerWindow(parent).getComputedStyle(parent).display === "contents") {
    parent = parent.parentElement;
  }
  if (!parent) {
    throw new Error(`${ROOT_NAME} must be inside an element that has a box.`);
  }
  return parent;
}

/**
 * Where the reference's content starts in the viewport. A reference that scrolls moves its
 * content under its own box, so its scroll position counts too; the root element's box
 * scrolls along with the content.
 */
export function contentOrigin(reference: Element): Point {
  const rect = reference.getBoundingClientRect();
  const scrolls = reference !== reference.ownerDocument.documentElement;
  return {
    x: rect.left - (scrolls ? reference.scrollLeft : 0),
    y: rect.top - (scrolls ? reference.scrollTop : 0),
  };
}

/** The element's position in the content whose origin is given. */
export function offsetFrom(element: Element, origin: Point): Point {
  const rect = element.getBoundingClientRect();
  return { x: rect.left - origin.x, y: rect.top - origin.y };
}

/**
 * Puts the element where it sits in normal flow, and returns what puts it back. Relative
 * positioning without offsets puts it there and keeps it the containing block of its
 * positioned descendants, so nothing else moves.
 */
export function holdInFlow(element: HTMLElement): () => void {
  const { style } = element;
  const saved = ["position", ...PHYSICAL_SIDES].map(name => ({
    name,
    value: style.getPropertyValue(name),
    priority: style.getPropertyPriority(name),
  }));
  style.setProperty("position", "relative", "important");
  for (const side of PHYSICAL_SIDES) {
    style.setProperty(side, "auto", "important");
  }
  return () => {
    for (const { name, value, priority } of saved) {
      if (value) {
        style.setProperty(name, value, priority);
      } else {
        style.removeProperty(name);
      }
    }
  };
}

/** The pixel value of an inset, which a sticky element always has on the sides it sticks to. */
export function resolvedInset(element: HTMLElement, side: PhysicalSide): number {
  const value = Number.parseFloat(getOwnerWindow(element).getComputedStyle(element)[side]);
  if (Number.isNaN(value)) {
    throw new TypeError(`${ROOT_NAME} has no ${side} offset; its offset must be a CSS length.`);
  }
  return value;
}
