// @env browser
import type { Point } from "../shared/types";
import { getOwnerWindow, getScrollParent } from "../shared/dom";
import { AUTO_SCROLL_EDGE, AUTO_SCROLL_EDGE_SHARE, AUTO_SCROLL_SPEED, SLIDE_ANIMATION_ID, SLIDE_DURATION, SLIDE_EASING } from "./constants";

export interface Slide {
  element: HTMLElement;
  /** Where the element was laid out before, within the canvas. */
  from: Point;
  /** Where it is laid out now. */
  to: Point;
}

/**
 * Animates elements from where they were showing to where they are laid out now. An element
 * still sliding from an earlier change starts from wherever that slide has it.
 */
export function slide(canvas: HTMLElement, slides: readonly Slide[]): void {
  const canvasRect = canvas.getBoundingClientRect();
  for (const { element, from, to } of slides) {
    const rect = element.getBoundingClientRect();
    // The box already sits at its new place; a running slide still shifts it.
    const shift = { x: rect.left - canvasRect.left - to.x, y: rect.top - canvasRect.top - to.y };
    for (const animation of element.getAnimations()) {
      if (animation.id === SLIDE_ANIMATION_ID) {
        animation.cancel();
      }
    }
    const start = { x: from.x + shift.x - to.x, y: from.y + shift.y - to.y };
    if (Math.hypot(start.x, start.y) < 0.5) {
      continue;
    }
    const animation = element.animate(
      [{ translate: `${start.x}px ${start.y}px` }, { translate: "0px 0px" }],
      { duration: SLIDE_DURATION, easing: SLIDE_EASING },
    );
    animation.id = SLIDE_ANIMATION_ID;
  }
}

export interface AutoScroll {
  /** Where the pointer is now. */
  update: (point: Point) => void;
  stop: () => void;
}

/**
 * Scrolls the scroll container of `element`, or the page, while the pointer stays near one of
 * its edges, faster the closer it gets, and calls `onScroll` after every step that moved.
 */
export function startAutoScroll(element: Element, onScroll: () => void): AutoScroll {
  const ownerWindow = getOwnerWindow(element);
  const container = getScrollParent(element);
  let point: Point | null = null;
  let frame = 0;
  let lastTime = 0;
  // Scroll positions are whole pixels; slow speeds add up over frames.
  const carry = { x: 0, y: 0 };

  const port = (): { left: number; top: number; width: number; height: number } => {
    if (!container) {
      return { left: 0, top: 0, width: ownerWindow.innerWidth, height: ownerWindow.innerHeight };
    }
    const rect = container.getBoundingClientRect();
    return { left: rect.left + container.clientLeft, top: rect.top + container.clientTop, width: container.clientWidth, height: container.clientHeight };
  };
  const speed = (position: number, start: number, size: number): number => {
    const edge = Math.min(AUTO_SCROLL_EDGE, size * AUTO_SCROLL_EDGE_SHARE);
    if (position < start + edge) {
      return -AUTO_SCROLL_SPEED * Math.min(1, (start + edge - position) / edge);
    }
    if (position > start + size - edge) {
      return AUTO_SCROLL_SPEED * Math.min(1, (position - (start + size - edge)) / edge);
    }
    return 0;
  };
  const scrollPosition = (): Point => (container
    ? { x: container.scrollLeft, y: container.scrollTop }
    : { x: ownerWindow.scrollX, y: ownerWindow.scrollY });

  const step = (time: number): void => {
    frame = 0;
    if (!point) {
      return;
    }
    const box = port();
    const velocity = { x: speed(point.x, box.left, box.width), y: speed(point.y, box.top, box.height) };
    if (velocity.x === 0 && velocity.y === 0) {
      lastTime = 0;
      return;
    }
    const elapsed = lastTime === 0 ? 16 : Math.min(64, time - lastTime);
    lastTime = time;
    carry.x += (velocity.x * elapsed) / 1000;
    carry.y += (velocity.y * elapsed) / 1000;
    const delta = { x: Math.trunc(carry.x), y: Math.trunc(carry.y) };
    carry.x -= delta.x;
    carry.y -= delta.y;
    const before = scrollPosition();
    (container ?? ownerWindow).scrollBy({ left: delta.x, top: delta.y, behavior: "instant" });
    const after = scrollPosition();
    if (after.x !== before.x || after.y !== before.y) {
      onScroll();
    } else if (delta.x !== 0 || delta.y !== 0) {
      // Already at the end of the scroll range; the next pointer move starts over.
      lastTime = 0;
      return;
    }
    frame = ownerWindow.requestAnimationFrame(step);
  };

  return {
    update: (next) => {
      point = next;
      if (!frame) {
        frame = ownerWindow.requestAnimationFrame(step);
      }
    },
    stop: () => {
      point = null;
      ownerWindow.cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}
