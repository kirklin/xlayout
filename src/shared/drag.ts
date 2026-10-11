// @env browser
import type * as React from "react";
import type { Point } from "./types";
import { getOwnerDocument, getOwnerWindow } from "./dom";

export interface DragSessionCallbacks {
  /** The pointer travelled past the threshold; the drag has begun. */
  onStart?: ((event: PointerEvent) => void) | undefined;
  /** Called at most once per animation frame with the latest pointer event. */
  onMove: (event: PointerEvent) => void;
  /** The pointer was released after the drag began. */
  onEnd: () => void;
  /** Escape was pressed; the drag should be undone. */
  onCancel: () => void;
  /**
   * The browser took the pointer away: `pointercancel`, a lost pointer capture, the window
   * losing focus or the page being hidden. Defaults to `onCancel`.
   */
  onInterrupt?: (() => void) | undefined;
}

export interface DragSessionOptions {
  /** Distance in pixels the pointer travels before the drag begins. `0` begins on pointer down. */
  threshold: number;
  /** Cursor shown on the whole document while dragging. */
  cursor: string;
  /** Element that receives pointer capture, normally the element the pointer went down on. */
  captureElement: HTMLElement;
}

export interface DragSession {
  readonly origin: Point;
  /** Changes the document cursor while the drag lasts. */
  setCursor: (cursor: string) => void;
  /** Ends the session without calling any callback. */
  abort: () => void;
}

function getDragStyleText(cursor: string | null): string {
  const cursorRule = cursor ? `cursor: ${cursor} !important;` : "";
  return `*, *::before, *::after, *:hover { ${cursorRule} user-select: none !important; -webkit-user-select: none !important; } iframe { pointer-events: none !important; }`;
}

/**
 * Applies document-wide drag styles through a constructed style sheet, which content
 * security policies that forbid inline styles still allow.
 */
function adoptDragStyle(ownerDocument: Document): { update: (cursor: string | null) => void; remove: () => void } {
  const ownerWindow = getOwnerWindow(ownerDocument.documentElement);
  const sheet = new ownerWindow.CSSStyleSheet();
  sheet.replaceSync(getDragStyleText(null));
  // Some browsers hand out a frozen array, so the list is replaced instead of pushed to.
  ownerDocument.adoptedStyleSheets = [...ownerDocument.adoptedStyleSheets, sheet];
  return {
    update: (cursor) => {
      sheet.replaceSync(getDragStyleText(cursor));
    },
    remove: () => {
      ownerDocument.adoptedStyleSheets = ownerDocument.adoptedStyleSheets.filter(existing => existing !== sheet);
    },
  };
}

/**
 * Tracks one pointer from `pointerdown` until it is released, with pointer capture,
 * a movement threshold, Escape to cancel, and text selection and iframes disabled
 * for the duration of the drag.
 */
export function startDragSession(
  downEvent: PointerEvent,
  options: DragSessionOptions,
  callbacks: DragSessionCallbacks,
): DragSession {
  const { threshold, cursor, captureElement } = options;
  const ownerDocument = getOwnerDocument(captureElement);
  const ownerWindow = getOwnerWindow(captureElement);
  const pointerId = downEvent.pointerId;
  const origin = { x: downEvent.clientX, y: downEvent.clientY };

  let started = false;
  let finished = false;
  let pendingMove: PointerEvent | null = null;
  let frame = 0;
  let currentCursor = cursor;
  const style = adoptDragStyle(ownerDocument);

  captureElement.setPointerCapture(pointerId);

  function begin(event: PointerEvent): void {
    started = true;
    style.update(currentCursor);
    callbacks.onStart?.(event);
  }

  function flushMove(): void {
    ownerWindow.cancelAnimationFrame(frame);
    frame = 0;
    if (pendingMove) {
      const event = pendingMove;
      pendingMove = null;
      callbacks.onMove(event);
    }
  }

  function cleanup(): void {
    finished = true;
    ownerWindow.cancelAnimationFrame(frame);
    pendingMove = null;
    style.remove();
    captureElement.removeEventListener("pointermove", handlePointerMove);
    captureElement.removeEventListener("pointerup", handlePointerUp);
    captureElement.removeEventListener("pointercancel", handleInterrupt);
    captureElement.removeEventListener("lostpointercapture", handleInterrupt);
    ownerDocument.removeEventListener("keydown", handleKeyDown, true);
    ownerDocument.removeEventListener("contextmenu", handleContextMenu, true);
    ownerWindow.removeEventListener("blur", handleInterrupt);
    ownerWindow.removeEventListener("pagehide", handleInterrupt);
    if (captureElement.hasPointerCapture(pointerId)) {
      captureElement.releasePointerCapture(pointerId);
    }
  }

  function finish(): void {
    const wasStarted = started;
    flushMove();
    cleanup();
    if (wasStarted) {
      callbacks.onEnd();
    }
  }

  function handlePointerMove(event: PointerEvent): void {
    if (event.pointerId !== pointerId) {
      return;
    }
    if (!started) {
      const distance = Math.hypot(event.clientX - origin.x, event.clientY - origin.y);
      if (distance < threshold) {
        return;
      }
      begin(event);
    }
    pendingMove = event;
    if (!frame) {
      frame = ownerWindow.requestAnimationFrame(flushMove);
    }
  }

  function handlePointerUp(event: PointerEvent): void {
    if (event.pointerId !== pointerId) {
      return;
    }
    if (started) {
      event.preventDefault();
    }
    finish();
  }

  function handleInterrupt(event: Event): void {
    if (event instanceof PointerEvent && event.pointerId !== pointerId) {
      return;
    }
    const wasStarted = started;
    cleanup();
    if (wasStarted) {
      (callbacks.onInterrupt ?? callbacks.onCancel)();
    }
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key !== "Escape" || !started) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    cleanup();
    callbacks.onCancel();
  }

  function handleContextMenu(event: MouseEvent): void {
    if (started) {
      event.preventDefault();
    }
  }

  captureElement.addEventListener("pointermove", handlePointerMove);
  captureElement.addEventListener("pointerup", handlePointerUp);
  captureElement.addEventListener("pointercancel", handleInterrupt);
  captureElement.addEventListener("lostpointercapture", handleInterrupt);
  ownerDocument.addEventListener("keydown", handleKeyDown, true);
  ownerDocument.addEventListener("contextmenu", handleContextMenu, true);
  ownerWindow.addEventListener("blur", handleInterrupt);
  ownerWindow.addEventListener("pagehide", handleInterrupt);

  if (threshold === 0) {
    begin(downEvent);
  }

  return {
    origin,
    setCursor: (nextCursor) => {
      if (nextCursor === currentCursor) {
        return;
      }
      currentCursor = nextCursor;
      if (started && !finished) {
        style.update(nextCursor);
      }
    },
    abort: () => {
      if (!finished) {
        cleanup();
      }
    },
  };
}

/** Whether a pointer down should start a drag: primary pointer, main mouse button. */
export function isPrimaryPointerDown(event: PointerEvent | React.PointerEvent): boolean {
  return event.isPrimary && event.button === 0 && !event.ctrlKey;
}
