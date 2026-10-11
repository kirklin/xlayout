// @env browser

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
