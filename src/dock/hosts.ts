// @env browser
import type { DockRect } from "./types";

/** An id attribute made from any panel id: characters ids may not hold are written out. */
export function elementId(prefix: string, value: string): string {
  return `${prefix}-${value.replace(/[^\w-]/g, character => `_${character.codePointAt(0)!.toString(16)}_`)}`;
}

/** Copies the document's look into a popout window: attributes of the root element and every style sheet. */
function mirrorDocument(source: Document, target: Document): void {
  for (const attribute of source.documentElement.attributes) {
    target.documentElement.setAttribute(attribute.name, attribute.value);
  }
  for (const node of source.head.querySelectorAll("style, link[rel=stylesheet]")) {
    target.head.append(target.importNode(node, true));
  }
}

export interface Popout {
  window: Window;
  /** The element the popout's group renders into. */
  container: HTMLElement;
}

/**
 * Opens a window for a popout group. Browsers block windows opened outside a user's action,
 * which returns `null`.
 */
export function openPopout(ownerWindow: Window, rect: DockRect, title: string): Popout | null {
  const features = `popup,left=${Math.round(rect.x)},top=${Math.round(rect.y)},width=${Math.round(rect.width)},height=${Math.round(rect.height)}`;
  const popup = ownerWindow.open("", "", features);
  if (!popup) {
    return null;
  }
  const { document } = popup;
  document.title = title;
  mirrorDocument(ownerWindow.document, document);
  document.body.style.margin = "0";
  const container = document.createElement("div");
  container.style.cssText = "position: fixed; inset: 0; display: flex;";
  document.body.append(container);
  return { window: popup, container };
}

/** The window's place and size on the screen. */
export function windowRect(target: Window): DockRect {
  return { x: target.screenX, y: target.screenY, width: target.innerWidth, height: target.innerHeight };
}
