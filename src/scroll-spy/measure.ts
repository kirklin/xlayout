// @env browser
import type { Rect } from "../shared/types";
import type { SectionMeasurement } from "./types";
import { getOwnerDocument, getOwnerWindow, getScrollParent, isScrollContainer } from "../shared/dom";
import { ROOT_NAME, SECTION_NAME } from "./constants";

function pixels(value: string, basis: number): number {
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) {
    return 0;
  }
  return value.endsWith("%") ? (parsed / 100) * basis : parsed;
}

/** The element whose scrolling moves the sections: their scroll container, or the document's. */
export function scrollerOf(sections: readonly HTMLElement[]): Element {
  const [first] = sections;
  if (!first) {
    throw new Error(`${ROOT_NAME} has no sections.`);
  }
  const scrollers = new Set(sections.map(section => getScrollParent(section)));
  if (scrollers.size > 1) {
    throw new Error(`Every ${SECTION_NAME} of a ${ROOT_NAME} must scroll in the same container.`);
  }
  const ownerDocument = getOwnerDocument(first);
  return getScrollParent(first) ?? ownerDocument.scrollingElement ?? ownerDocument.documentElement;
}

/**
 * Measures the sections along the block axis. A section's position is the scroll position
 * that brings its start, less its scroll margin, to the top of the scrollport, less the
 * scroller's scroll padding: where scrolling it into view would land.
 */
export function measureSections(scroller: Element, sections: readonly HTMLElement[]): SectionMeasurement {
  const ownerWindow = getOwnerWindow(scroller);
  const isDocument = scroller === scroller.ownerDocument.scrollingElement;
  const scrollportSize = scroller.clientHeight;
  const scrollportTop = isDocument ? 0 : scroller.getBoundingClientRect().top + scroller.clientTop;
  const paddingTop = pixels(ownerWindow.getComputedStyle(scroller).scrollPaddingTop, scrollportSize);
  const scrollPosition = scroller.scrollTop;
  const positions: number[] = [];
  const visible: boolean[] = [];
  const passed: boolean[] = [];
  for (const section of sections) {
    const rect = section.getBoundingClientRect();
    const marginTop = pixels(ownerWindow.getComputedStyle(section).scrollMarginTop, 0);
    positions.push(rect.top - marginTop - scrollportTop - paddingTop + scrollPosition);
    visible.push(rect.bottom > scrollportTop && rect.top < scrollportTop + scrollportSize);
    passed.push(rect.bottom <= scrollportTop + paddingTop);
  }
  return {
    positions,
    scrollPosition,
    scrollportSize,
    scrollRange: scroller.scrollHeight - scrollportSize,
    visible,
    passed,
  };
}

/** Where `element` sits in the content of `container`, which moves with its scrolling. */
export function boxWithin(element: Element, container: Element): Rect {
  const rect = element.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  return {
    x: rect.left - containerRect.left - container.clientLeft + container.scrollLeft,
    y: rect.top - containerRect.top - container.clientTop + container.scrollTop,
    width: rect.width,
    height: rect.height,
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
  const top = distance(rect.top, rect.bottom, containerRect.top + container.clientTop, container.clientHeight);
  const left = distance(rect.left, rect.right, containerRect.left + container.clientLeft, container.clientWidth);
  if (top !== 0 || left !== 0) {
    container.scrollBy({ top, left });
  }
}
