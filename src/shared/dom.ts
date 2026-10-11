// @env browser

export function getOwnerDocument(node: Node | null | undefined): Document {
  return node?.ownerDocument ?? document;
}

export function getOwnerWindow(node: Node | null | undefined): Window & typeof globalThis {
  return (getOwnerDocument(node).defaultView ?? window) as Window & typeof globalThis;
}

/** Whether keystrokes on `target` belong to text editing rather than to the layout. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  if (target instanceof HTMLElement && target.isContentEditable) {
    return true;
  }
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
    return true;
  }
  if (target instanceof HTMLInputElement) {
    const nonTextTypes = new Set(["button", "checkbox", "color", "file", "image", "radio", "range", "reset", "submit"]);
    return !nonTextTypes.has(target.type);
  }
  return false;
}

// `hidden` hides scrollbars, yet the element still scrolls; only `visible` and `clip` do not.
const SCROLLABLE_OVERFLOW = /auto|scroll|overlay|hidden/;

export function isScrollContainer(element: Element): boolean {
  const style = getOwnerWindow(element).getComputedStyle(element);
  return SCROLLABLE_OVERFLOW.test(`${style.overflow}${style.overflowX}${style.overflowY}`);
}

/**
 * The nearest ancestor that scrolls `element`, or `null` when the document viewport scrolls it.
 */
export function getScrollParent(element: Element): HTMLElement | null {
  const ownerDocument = getOwnerDocument(element);
  let parent = element.parentElement;
  while (parent && parent !== ownerDocument.body && parent !== ownerDocument.documentElement) {
    if (isScrollContainer(parent)) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}

/**
 * Entries in the order of their elements in the document. Elements that share a parent, as the
 * items of a layout usually do, are put in order by one pass over its children.
 */
export function sortByDocumentPosition<T extends { element: Element }>(entries: readonly T[]): T[] {
  const parent = entries[0]?.element.parentNode;
  if (parent && entries.every(entry => entry.element.parentNode === parent)) {
    const positions = new Map<Element, number>();
    let position = 0;
    for (const child of parent.children) {
      positions.set(child, position++);
    }
    return [...entries].sort((a, b) => positions.get(a.element)! - positions.get(b.element)!);
  }
  return [...entries].sort((a, b) => {
    if (a.element === b.element) {
      return 0;
    }
    return a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });
}

/** Re-sorts entries whose elements may have moved; returns the same array when nothing moved. */
export function reorderByDocumentPosition<T extends { element: Element }>(entries: readonly T[]): readonly T[] {
  const sorted = sortByDocumentPosition(entries);
  return sorted.every((entry, index) => entry === entries[index]) ? entries : sorted;
}

export function prefersReducedMotion(node: Node | null | undefined): boolean {
  return getOwnerWindow(node).matchMedia("(prefers-reduced-motion: reduce)").matches;
}
