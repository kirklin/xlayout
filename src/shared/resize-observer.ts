// @env browser
import type { Size } from "./types";
import { getOwnerWindow } from "./dom";

type SizeListener = (size: Size, element: Element) => void;

interface SharedObserver {
  observer: ResizeObserver;
  listeners: Map<Element, Set<SizeListener>>;
}

const sharedObservers = new WeakMap<Window, SharedObserver>();

function getBorderBoxSize(entry: ResizeObserverEntry): Size {
  const borderBox = entry.borderBoxSize[0];
  if (!borderBox) {
    throw new Error("ResizeObserver did not report a border box size");
  }
  return { width: borderBox.inlineSize, height: borderBox.blockSize };
}

function getSharedObserver(ownerWindow: Window & typeof globalThis): SharedObserver {
  const existing = sharedObservers.get(ownerWindow);
  if (existing) {
    return existing;
  }
  const listeners = new Map<Element, Set<SizeListener>>();
  const observer = new ownerWindow.ResizeObserver((entries) => {
    for (const entry of entries) {
      const elementListeners = listeners.get(entry.target);
      if (!elementListeners) {
        continue;
      }
      const size = getBorderBoxSize(entry);
      for (const listener of elementListeners) {
        listener(size, entry.target);
      }
    }
  });
  const shared = { observer, listeners };
  sharedObservers.set(ownerWindow, shared);
  return shared;
}

/**
 * Calls `listener` with the border box size of `element` whenever it changes, sharing one
 * `ResizeObserver` per window. Callers read the initial size themselves.
 */
export function observeElementSize(element: Element, listener: SizeListener): () => void {
  const { observer, listeners } = getSharedObserver(getOwnerWindow(element));
  let elementListeners = listeners.get(element);
  if (!elementListeners) {
    elementListeners = new Set();
    listeners.set(element, elementListeners);
    observer.observe(element, { box: "border-box" });
  }
  elementListeners.add(listener);

  return () => {
    const current = listeners.get(element);
    if (!current) {
      return;
    }
    current.delete(listener);
    if (current.size === 0) {
      listeners.delete(element);
      observer.unobserve(element);
    }
  };
}

/**
 * The fractional border box size of `element`, unaffected by CSS transforms. It matches the
 * sizes `observeElementSize` reports later.
 */
export function measureElementSize(element: Element): Size {
  const style = getOwnerWindow(element).getComputedStyle(element);
  const width = Number.parseFloat(style.width);
  const height = Number.parseFloat(style.height);
  if (Number.isNaN(width) || Number.isNaN(height)) {
    return { width: 0, height: 0 };
  }
  if (style.boxSizing === "border-box") {
    return { width, height };
  }
  const horizontalExtra = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight)
    + Number.parseFloat(style.borderLeftWidth) + Number.parseFloat(style.borderRightWidth);
  const verticalExtra = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom)
    + Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.borderBottomWidth);
  return { width: width + horizontalExtra, height: height + verticalExtra };
}
