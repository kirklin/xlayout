// @env browser
import { clamp } from "./math";

/** How far beyond a thin handle a touch still takes it, unless a part asks for another reach. */
export const DEFAULT_TOUCH_MARGIN = 12;

export interface TouchReach {
  element: HTMLElement;
  /** How far beyond the element's box, in pixels, a touch still takes it. */
  margin: number;
  /** Takes a touch that went down within reach but outside the element, as if it went down on it. */
  press: (event: PointerEvent) => void;
}

/** Touches on these keep going to them, however close a handle is. */
const CONTROLS = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "label",
  "summary",
  "[contenteditable]:not([contenteditable=false])",
  "[role=button]",
  "[role=link]",
  "[role=tab]",
  "[role=menuitem]",
  "[role=checkbox]",
  "[role=radio]",
  "[role=switch]",
  "[role=slider]",
  "[role=separator]",
].join(",");

const reachesByDocument = new Map<Document, Set<TouchReach>>();

function distanceTo(rect: DOMRect, x: number, y: number): number {
  return Math.hypot(Math.max(rect.left - x, 0, x - rect.right), Math.max(rect.top - y, 0, y - rect.bottom));
}

function handlePointerDown(event: PointerEvent): void {
  const { target } = event;
  if (event.pointerType !== "touch" || !event.isPrimary || event.defaultPrevented || !(target instanceof Element)) {
    return;
  }
  const ownerDocument = target.ownerDocument;
  const reaches = reachesByDocument.get(ownerDocument);
  if (!reaches || target.closest(CONTROLS)) {
    return;
  }
  let nearest: { reach: TouchReach; rect: DOMRect; distance: number } | null = null;
  for (const reach of reaches) {
    if (reach.margin <= 0) {
      continue;
    }
    const rect = reach.element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      continue;
    }
    const distance = distanceTo(rect, event.clientX, event.clientY);
    if (distance <= reach.margin && (!nearest || distance < nearest.distance)) {
      nearest = { reach, rect, distance };
    }
  }
  if (!nearest) {
    return;
  }
  // The handle has to show at the point of it nearest to the touch, rather than lie under a
  // dialog or a menu that the touch is meant for.
  const { rect, reach } = nearest;
  const shown = ownerDocument.elementFromPoint(clamp(event.clientX, rect.left, rect.right - 1), clamp(event.clientY, rect.top, rect.bottom - 1));
  if (!shown || !reach.element.contains(shown)) {
    return;
  }
  // The content under the touch never learns of it, so it does not start anything of its own.
  event.preventDefault();
  event.stopPropagation();
  reach.press(event);
}

/**
 * Lets touches that land within `margin` pixels of a thin handle take it, the way a finger
 * means them to. Handles that do not show, and touches on controls, are left alone.
 */
export function registerTouchReach(reach: TouchReach): () => void {
  const ownerDocument = reach.element.ownerDocument;
  let reaches = reachesByDocument.get(ownerDocument);
  if (!reaches) {
    reaches = new Set();
    reachesByDocument.set(ownerDocument, reaches);
    ownerDocument.addEventListener("pointerdown", handlePointerDown, true);
  }
  reaches.add(reach);
  return () => {
    const current = reachesByDocument.get(ownerDocument);
    if (!current) {
      return;
    }
    current.delete(reach);
    if (current.size === 0) {
      reachesByDocument.delete(ownerDocument);
      ownerDocument.removeEventListener("pointerdown", handlePointerDown, true);
    }
  };
}
