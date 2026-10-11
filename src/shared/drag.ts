// @env browser
import type * as React from "react";
import type { Point } from "./types";
import { getOwnerDocument, getOwnerWindow } from "./dom";

export interface DragSessionCallbacks {
  /** The pointer travelled past the threshold, or a touch was held long enough; the drag has begun. */
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

export interface TouchDragOptions {
  /** Distance a touch travels before the drag begins; defaults to `threshold`. */
  threshold?: number;
  /**
   * Milliseconds a touch held within `tolerance` of where it went down begins the drag, so a
   * press and hold drags where the element otherwise lets touches scroll the page.
   */
  delay?: number;
  /** How far a held touch may wander before the hold no longer counts. @default 8 */
  tolerance?: number;
}

export interface DragSessionOptions {
  /** Distance in pixels the pointer travels before the drag begins. `0` begins on pointer down. */
  threshold: number;
  /** Cursor shown on the whole document while dragging. */
  cursor: string;
  /** Element that receives pointer capture, normally the element the pointer went down on. */
  captureElement: HTMLElement;
  /** How a touch starts the drag. */
  touch?: TouchDragOptions | undefined;
  /**
   * Whether the pointer, having travelled `delta` past the threshold, begins the drag; returning
   * `false` lets it go, as for a swipe in a direction the drag does not take.
   */
  shouldStart?: ((delta: Point) => boolean) | undefined;
}

export interface DragSession {
  readonly origin: Point;
  /** Changes the document cursor while the drag lasts. */
  setCursor: (cursor: string) => void;
  /** Ends the session without calling any callback. */
  abort: () => void;
}

const DEFAULT_HOLD_TOLERANCE = 8;

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

function preventScrolling(event: TouchEvent): void {
  if (event.cancelable) {
    event.preventDefault();
  }
}

/**
 * Tracks one pointer from `pointerdown` until it is released, with pointer capture,
 * a movement threshold, Escape to cancel, and text selection and iframes disabled
 * for the duration of the drag. A touch drag keeps the page from scrolling once it began;
 * the browser lets it do so where `touchmove` listeners that are not passive were added
 * before the touch, see `holdTouchScrolling`.
 */
export function startDragSession(
  downEvent: PointerEvent,
  options: DragSessionOptions,
  callbacks: DragSessionCallbacks,
): DragSession {
  const { cursor, captureElement, shouldStart } = options;
  const ownerDocument = getOwnerDocument(captureElement);
  const ownerWindow = getOwnerWindow(captureElement);
  const pointerId = downEvent.pointerId;
  const origin = { x: downEvent.clientX, y: downEvent.clientY };
  const isTouch = downEvent.pointerType === "touch";
  const threshold = isTouch ? options.touch?.threshold ?? options.threshold : options.threshold;
  const holdDelay = isTouch ? options.touch?.delay : undefined;
  const holdTolerance = options.touch?.tolerance ?? DEFAULT_HOLD_TOLERANCE;

  let started = false;
  let finished = false;
  let pendingMove: PointerEvent | null = null;
  let latestEvent = downEvent;
  let frame = 0;
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  let currentCursor = cursor;
  const style = adoptDragStyle(ownerDocument);

  captureElement.setPointerCapture(pointerId);

  function begin(event: PointerEvent): void {
    started = true;
    clearTimeout(holdTimer);
    style.update(currentCursor);
    if (isTouch) {
      ownerDocument.addEventListener("touchmove", preventScrolling, { capture: true, passive: false });
    }
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
    clearTimeout(holdTimer);
    ownerWindow.cancelAnimationFrame(frame);
    pendingMove = null;
    style.remove();
    captureElement.removeEventListener("pointermove", handlePointerMove);
    captureElement.removeEventListener("pointerup", handlePointerUp);
    captureElement.removeEventListener("pointercancel", handleInterrupt);
    captureElement.removeEventListener("lostpointercapture", handleInterrupt);
    ownerDocument.removeEventListener("keydown", handleKeyDown, true);
    ownerDocument.removeEventListener("contextmenu", handleContextMenu, true);
    ownerDocument.removeEventListener("touchmove", preventScrolling, true);
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
    latestEvent = event;
    if (!started) {
      const delta = { x: event.clientX - origin.x, y: event.clientY - origin.y };
      const distance = Math.hypot(delta.x, delta.y);
      if (holdDelay !== undefined && distance > holdTolerance) {
        // The touch moved on before it was held long enough; only the threshold can start it now.
        clearTimeout(holdTimer);
      }
      if (distance < threshold) {
        return;
      }
      if (shouldStart && !shouldStart(delta)) {
        cleanup();
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
    // A held touch opens the context menu; a drag that may begin from the hold keeps it shut.
    if (started || holdDelay !== undefined) {
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
  } else if (holdDelay !== undefined) {
    holdTimer = setTimeout(() => {
      if (!finished && !started) {
        begin(latestEvent);
      }
    }, holdDelay);
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

function ignoreTouch(): void {}

/**
 * Lets touch drags that start inside `element` keep the page from scrolling. Browsers decide
 * when a touch begins whether its moves can be cancelled, which takes a `touchmove` listener
 * that is not passive; this one only lets the drag session's own listener cancel them later.
 */
export function holdTouchScrolling(element: HTMLElement): () => void {
  element.addEventListener("touchmove", ignoreTouch, { passive: false });
  return () => element.removeEventListener("touchmove", ignoreTouch);
}
