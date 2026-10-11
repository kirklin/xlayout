// @env browser
import type { Rect } from "../shared/types";
import type { SectionGeometry } from "./types";
import { getOwnerDocument, getOwnerWindow, getScrollParent } from "../shared/dom";
import { GEOMETRY_TOLERANCE, ROOT_NAME, SECTION_NAME } from "./constants";

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

/** Where the scroller's content starts in the viewport: the top of its scrollport less how far it scrolled. */
function contentOrigin(scroller: Element): number {
  const isDocument = scroller === scroller.ownerDocument.scrollingElement;
  const scrollportTop = isDocument ? 0 : scroller.getBoundingClientRect().top + scroller.clientTop;
  return scrollportTop - scroller.scrollTop;
}

/**
 * Measures the sections along the block axis, in the scroller's content, where scrolling
 * leaves them. A section's position is the scroll position that brings its start, less its
 * scroll margin, to the top of the scrollport, less the scroller's scroll padding: where
 * scrolling it into view would land.
 */
export function measureSections(scroller: Element, sections: readonly HTMLElement[]): SectionGeometry {
  const ownerWindow = getOwnerWindow(scroller);
  const scrollportSize = scroller.clientHeight;
  const paddingTop = pixels(ownerWindow.getComputedStyle(scroller).scrollPaddingTop, scrollportSize);
  const origin = contentOrigin(scroller);
  const tops = new Float64Array(sections.length);
  const bottoms = new Float64Array(sections.length);
  const positions: number[] = [];
  sections.forEach((section, index) => {
    const rect = section.getBoundingClientRect();
    tops[index] = rect.top - origin;
    bottoms[index] = rect.bottom - origin;
    positions.push(tops[index] - pixels(ownerWindow.getComputedStyle(section).scrollMarginTop, 0) - paddingTop);
  });
  return { tops, bottoms, positions, paddingTop, scrollportSize, scrollRange: scroller.scrollHeight - scrollportSize };
}

/**
 * Whether the sections are where `geometry` has them. The sizes of the sections and their
 * containers are observed; this catches what moves them without resizing those, like content
 * above them that grows, by looking at the scroller and the first and last section only.
 */
export function sectionsStayed(scroller: Element, sections: readonly HTMLElement[], geometry: SectionGeometry): boolean {
  if (scroller.clientHeight !== geometry.scrollportSize || scroller.scrollHeight - scroller.clientHeight !== geometry.scrollRange) {
    return false;
  }
  const origin = contentOrigin(scroller);
  return [0, sections.length - 1].every((index) => {
    const rect = sections[index]!.getBoundingClientRect();
    return Math.abs(rect.top - origin - geometry.tops[index]!) <= GEOMETRY_TOLERANCE
      && Math.abs(rect.bottom - origin - geometry.bottoms[index]!) <= GEOMETRY_TOLERANCE;
  });
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
