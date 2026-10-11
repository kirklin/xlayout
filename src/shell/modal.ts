// @env browser
import { LIVE_REGION_ATTRIBUTE } from "../shared/announce";
import { getOwnerWindow } from "../shared/dom";

const TABBABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "audio[controls]",
  "video[controls]",
  "[contenteditable]:not([contenteditable=false])",
  "[tabindex]",
].join(",");

/** Elements inside `container` that Tab can reach, in tab order. */
export function getTabbableElements(container: HTMLElement): HTMLElement[] {
  const candidates = [...container.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR)];
  const tabbable = candidates.filter(element => element.tabIndex >= 0
    && !element.closest("[inert]")
    && element.checkVisibility({ visibilityProperty: true }));
  const positive = tabbable.filter(element => element.tabIndex > 0).sort((a, b) => a.tabIndex - b.tabIndex);
  return [...positive, ...tabbable.filter(element => element.tabIndex === 0)];
}

/**
 * Makes everything outside `keep` inert, so neither the pointer, the keyboard nor assistive
 * technology reaches it. Returns a function that restores the previous state.
 */
export function makeOthersInert(keep: Element[]): () => void {
  const changed: HTMLElement[] = [];
  const kept = new Set(keep);
  const isKept = (element: Element): boolean => kept.has(element)
    || element.hasAttribute(LIVE_REGION_ATTRIBUTE)
    || keep.some(item => element.contains(item) || item.contains(element));
  for (const item of keep) {
    let current: Element | null = item;
    while (current && current.parentElement && current !== current.ownerDocument.body) {
      for (const sibling of current.parentElement.children) {
        if (sibling === current || isKept(sibling) || !(sibling instanceof HTMLElement)) {
          continue;
        }
        if (sibling.tagName === "SCRIPT" || sibling.tagName === "STYLE" || sibling.inert) {
          continue;
        }
        sibling.inert = true;
        changed.push(sibling);
      }
      current = current.parentElement;
    }
  }
  return () => {
    for (const element of changed) {
      element.inert = false;
    }
  };
}

const scrollLocks = new WeakMap<Document, { count: number; restore: () => void }>();

/**
 * Stops the page from scrolling behind a drawer and pads the body by the scrollbar width so
 * nothing shifts. Locks nest; the page scrolls again when the last one is released.
 */
export function lockScroll(ownerDocument: Document): () => void {
  const existing = scrollLocks.get(ownerDocument);
  if (existing) {
    existing.count++;
  } else {
    const ownerWindow = getOwnerWindow(ownerDocument.documentElement);
    const html = ownerDocument.documentElement;
    const body = ownerDocument.body;
    const scrollbarWidth = ownerWindow.innerWidth - html.clientWidth;
    const previous = {
      overflow: html.style.overflow,
      paddingRight: body.style.paddingRight,
      scrollbarWidth: html.style.getPropertyValue("--xlayout-scrollbar-width"),
    };
    const bodyPadding = Number.parseFloat(ownerWindow.getComputedStyle(body).paddingRight);
    html.style.overflow = "hidden";
    html.style.setProperty("--xlayout-scrollbar-width", `${scrollbarWidth}px`);
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${bodyPadding + scrollbarWidth}px`;
    }
    scrollLocks.set(ownerDocument, {
      count: 1,
      restore: () => {
        html.style.overflow = previous.overflow;
        body.style.paddingRight = previous.paddingRight;
        if (previous.scrollbarWidth) {
          html.style.setProperty("--xlayout-scrollbar-width", previous.scrollbarWidth);
        } else {
          html.style.removeProperty("--xlayout-scrollbar-width");
        }
      },
    });
  }

  let released = false;
  return () => {
    const lock = scrollLocks.get(ownerDocument);
    if (released || !lock) {
      return;
    }
    released = true;
    lock.count--;
    if (lock.count === 0) {
      lock.restore();
      scrollLocks.delete(ownerDocument);
    }
  };
}
