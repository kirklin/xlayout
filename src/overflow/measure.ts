// @env browser
import { getOwnerWindow } from "../shared/dom";
import { measureElementSize } from "../shared/resize-observer";
import { ITEM_NAME, LAYOUT_TOLERANCE, ROOT_NAME } from "./constants";

/** A part's border box size and used margins along the axis. */
export interface PartBox {
  size: number;
  margins: number;
}

const CSS_WHITESPACE_ONLY = /^[\t\n\f\r ]*$/;

function pixels(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function styleOf(element: Element): CSSStyleDeclaration {
  return getOwnerWindow(element).getComputedStyle(element);
}

function isElement(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE;
}

/** Space along the axis inside padding and borders. */
export function contentSize(element: HTMLElement, horizontal: boolean): number {
  const size = measureElementSize(element);
  const style = styleOf(element);
  return horizontal
    ? size.width - pixels(style.paddingLeft) - pixels(style.paddingRight) - pixels(style.borderLeftWidth) - pixels(style.borderRightWidth)
    : size.height - pixels(style.paddingTop) - pixels(style.paddingBottom) - pixels(style.borderTopWidth) - pixels(style.borderBottomWidth);
}

export function readGap(element: HTMLElement, horizontal: boolean): number {
  const style = styleOf(element);
  return pixels(horizontal ? style.columnGap : style.rowGap);
}

/**
 * The fit adds up the sizes of parts, so a part must keep the size its content or its own
 * width gives it. A part that grows or shrinks would be measured at whatever size the line
 * handed it.
 */
export function measurePart(element: HTMLElement, horizontal: boolean, partName: string): PartBox {
  const style = styleOf(element);
  const flexible = pixels(style.flexGrow) !== 0 || pixels(style.flexShrink) !== 0;
  if (flexible || (style.flexBasis !== "auto" && style.flexBasis !== "content")) {
    throw new Error(`${partName} must not grow, shrink or set flex-basis. Size it with ${horizontal ? "width" : "height"} instead.`);
  }
  const size = measureElementSize(element);
  return horizontal
    ? { size: size.width, margins: pixels(style.marginLeft) + pixels(style.marginRight) }
    : { size: size.height, margins: pixels(style.marginTop) + pixels(style.marginBottom) };
}

/**
 * The fit only counts parts, so other content on the line would take space it does not know
 * about. Content inside `display: contents` elements is on the line too; positioned and
 * undisplayed content is not.
 */
export function assertLineHoldsOnlyParts(container: Element, parts: ReadonlySet<Element>): void {
  for (const node of container.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && CSS_WHITESPACE_ONLY.test(node.textContent ?? "")) {
      continue;
    }
    if (isElement(node)) {
      if (parts.has(node)) {
        continue;
      }
      const style = styleOf(node);
      if (style.display === "contents") {
        assertLineHoldsOnlyParts(node, parts);
        continue;
      }
      if (style.display === "none" || style.position === "absolute" || style.position === "fixed") {
        continue;
      }
    } else if (node.nodeType !== Node.TEXT_NODE) {
      continue;
    }
    throw new Error(`${ROOT_NAME} only lays out its parts. Put other content in a pinned ${ITEM_NAME} so its space is counted.`);
  }
}

/**
 * Hidden parts leave the line, so a root sized by its content would shrink with every part it
 * hides and never make room to show them again. Size containment lays the root out as if it
 * were empty; containing only the inline size leaves the other axis, and with it the page's
 * scrollbars, alone.
 */
export function assertSizeIndependentOfContent(root: HTMLElement, horizontal: boolean): void {
  const before = contentSize(root, horizontal);
  const inlineIsHorizontal = styleOf(root).writingMode.startsWith("horizontal");
  const { style } = root;
  const value = style.getPropertyValue("contain");
  const priority = style.getPropertyPriority("contain");
  style.setProperty("contain", inlineIsHorizontal === horizontal ? "inline-size" : "size", "important");
  const empty = contentSize(root, horizontal);
  if (value) {
    style.setProperty("contain", value, priority);
  } else {
    style.removeProperty("contain");
  }
  if (Math.abs(empty - before) > LAYOUT_TOLERANCE) {
    const dimension = horizontal ? "width" : "height";
    throw new Error(`${ROOT_NAME} takes its ${dimension} from its items, so it would shrink with every item it hides. Give it a ${dimension} of its own, for example ${dimension}: 100% or flex: 1.`);
  }
}
