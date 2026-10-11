// @env browser
import { isScrollContainer } from "./dom";

interface ScrollFrameSubscription {
  listeners: Set<() => void>;
  stop: () => void;
}

const subscriptions = new WeakMap<Document, ScrollFrameSubscription>();

function subscribe(ownerDocument: Document): ScrollFrameSubscription {
  const ownerWindow = ownerDocument.defaultView;
  if (!ownerWindow) {
    throw new Error("Scrolling can only be followed in a document that has a window.");
  }
  const listeners = new Set<() => void>();
  let frame: number | null = null;
  const schedule = (): void => {
    if (frame !== null) {
      return;
    }
    // Scroll and resize events are dispatched right before animation frames, so the
    // listeners still run before the frame is painted.
    frame = ownerWindow.requestAnimationFrame(() => {
      frame = null;
      for (const listener of [...listeners]) {
        listener();
      }
    });
  };
  ownerDocument.addEventListener("scroll", schedule, { capture: true, passive: true });
  ownerWindow.addEventListener("resize", schedule, { passive: true });
  const stop = (): void => {
    ownerDocument.removeEventListener("scroll", schedule, { capture: true });
    ownerWindow.removeEventListener("resize", schedule);
    if (frame !== null) {
      ownerWindow.cancelAnimationFrame(frame);
    }
  };
  return { listeners, stop };
}

/**
 * Calls `listener` once in every animation frame in which anything in the document scrolled
 * or its window resized, sharing one pair of event listeners per document.
 */
export function onScrollFrame(ownerDocument: Document, listener: () => void): () => void {
  let subscription = subscriptions.get(ownerDocument);
  if (!subscription) {
    subscription = subscribe(ownerDocument);
    subscriptions.set(ownerDocument, subscription);
  }
  const { listeners, stop } = subscription;
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stop();
      subscriptions.delete(ownerDocument);
    }
  };
}

/**
 * Scrolls the nearest scroll container between `element` and `boundary`, inclusive, just far
 * enough to show the element. Containers outside the boundary, like the page, stay put.
 */
export function revealWithin(element: Element, boundary: Element): void {
  let container = element.parentElement;
  while (container && !isScrollContainer(container)) {
    container = container === boundary ? null : container.parentElement;
  }
  if (!container) {
    return;
  }
  const rect = element.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const distance = (start: number, end: number, portStart: number, portSize: number): number => {
    if (start < portStart || end - start > portSize) {
      return start - portStart;
    }
    return end > portStart + portSize ? end - (portStart + portSize) : 0;
  };
  // Some engines keep scroll positions in whole pixels, so a fraction is rounded away from zero
  // to show all of the element.
  const outward = (value: number): number => (value > 0 ? Math.ceil(value) : Math.floor(value));
  const top = outward(distance(rect.top, rect.bottom, containerRect.top + container.clientTop, container.clientHeight));
  const left = outward(distance(rect.left, rect.right, containerRect.left + container.clientLeft, container.clientWidth));
  if (top !== 0 || left !== 0) {
    container.scrollBy({ top, left });
  }
}
