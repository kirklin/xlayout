// @env browser
import type { DockRect } from "./types";

/** An id attribute made from any panel id: characters ids may not hold are written out. */
export function elementId(prefix: string, value: string): string {
  return `${prefix}-${value.replace(/[^\w-]/g, character => `_${character.codePointAt(0)!.toString(16)}_`)}`;
}

/** The id of the element a revealed hidden group shows in. */
export function flyoutId(dockId: string, group: string): string {
  return elementId(`${dockId}-flyout`, group);
}

/** The id of the button of a panel hidden along an edge. */
export function stripTabId(dockId: string, panel: string): string {
  return elementId(`${dockId}-strip`, panel);
}

/** Copies the document's look into a popout window: attributes of the root element and every style sheet. */
function mirrorDocument(source: Document, target: Document): void {
  for (const attribute of source.documentElement.attributes) {
    target.documentElement.setAttribute(attribute.name, attribute.value);
  }
  for (const node of source.head.querySelectorAll<HTMLStyleElement | HTMLLinkElement>("style, link[rel=stylesheet]")) {
    const copy = target.importNode(node, true);
    // Once a page has loaded, browsers hide a nonce from the attribute; the property still holds
    // it, and the window shares the page's content security policy.
    copy.nonce = node.nonce;
    target.head.append(copy);
  }
  // A constructed style sheet belongs to one document, so the window gets copies of their rules.
  const targetWindow = target.defaultView!;
  target.adoptedStyleSheets = source.adoptedStyleSheets.map((sheet) => {
    const copy = new targetWindow.CSSStyleSheet();
    copy.replaceSync([...sheet.cssRules].map(rule => rule.cssText).join("\n"));
    return copy;
  });
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
