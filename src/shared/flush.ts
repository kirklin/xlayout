import { flushSync } from "react-dom";

/**
 * Renders the updates made in `callback` before returning. Pointer moves are delivered in
 * animation frames, and rendering inside the frame keeps the layout under the pointer
 * instead of one frame behind it.
 */
export function renderSynchronously(callback: () => void): void {
  // eslint-disable-next-line react/dom-no-flush-sync
  flushSync(callback);
}
