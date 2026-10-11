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
 * The element's position in the reference's content. A reference that scrolls moves its
 * content under its own box, so its scroll position counts too; the root element's box
 * scrolls along with the content.
 */
export function offsetWithin(element: Element, reference: Element): Point {
  const rect = element.getBoundingClientRect();
  const referenceRect = reference.getBoundingClientRect();
  const scrolls = reference !== reference.ownerDocument.documentElement;
  return {
    x: rect.left - referenceRect.left + (scrolls ? reference.scrollLeft : 0),
    y: rect.top - referenceRect.top + (scrolls ? reference.scrollTop : 0),
  };
}

/**
 * Where the element sits in normal flow. Relative positioning without offsets puts it there
 * and keeps it the containing block of its positioned descendants, so nothing else moves.
 */
export function measureStaticOffset(element: HTMLElement, reference: Element): Point {
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
  const offset = offsetWithin(element, reference);
  for (const { name, value, priority } of saved) {
    if (value) {
      style.setProperty(name, value, priority);
    } else {
      style.removeProperty(name);
    }
  }
  return offset;
}

/** The pixel value of an inset, which a sticky element always has on the sides it sticks to. */
export function resolvedInset(element: HTMLElement, side: PhysicalSide): number {
  const value = Number.parseFloat(getOwnerWindow(element).getComputedStyle(element)[side]);
  if (Number.isNaN(value)) {
    throw new TypeError(`${ROOT_NAME} has no ${side} offset; its offset must be a CSS length.`);
  }
  return value;
}
