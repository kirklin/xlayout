// @env browser

export type Politeness = "polite" | "assertive";

export const LIVE_REGION_ATTRIBUTE = "data-xlayout-live-region";

const MESSAGE_LIFETIME = 7000;

const VISUALLY_HIDDEN_STYLE = "position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;";

function getLiveRegion(ownerDocument: Document, politeness: Politeness): HTMLElement {
  const selector = `[${LIVE_REGION_ATTRIBUTE}="${politeness}"]`;
  const existing = ownerDocument.querySelector<HTMLElement>(selector);
  if (existing) {
    return existing;
  }
  const region = ownerDocument.createElement("div");
  region.setAttribute(LIVE_REGION_ATTRIBUTE, politeness);
  region.setAttribute("aria-live", politeness);
  region.setAttribute("aria-relevant", "additions");
  region.setAttribute("role", politeness === "assertive" ? "log" : "status");
  region.setAttribute("style", VISUALLY_HIDDEN_STYLE);
  ownerDocument.body.append(region);
  return region;
}

/**
 * Reads `message` to screen reader users through a shared live region. Every call adds
 * a new node, so repeating the same message is announced again.
 */
export function announce(message: string, ownerDocument: Document, politeness: Politeness = "polite"): void {
  if (!message) {
    return;
  }
  const region = getLiveRegion(ownerDocument, politeness);
  const node = ownerDocument.createElement("div");
  node.textContent = message;
  region.append(node);
  ownerDocument.defaultView?.setTimeout(() => node.remove(), MESSAGE_LIFETIME);
}
