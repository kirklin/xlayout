// @env browser
import type { Orientation, Point } from "../shared/types";
import { INTERSECTION_MARGIN } from "./constants";

export interface ResizeLimit {
  /** The pointer is past the furthest position towards the start of the group. */
  atStart: boolean;
  /** The pointer is past the furthest position towards the end of the group. */
  atEnd: boolean;
}

export interface ResizeSession {
  move: (point: Point) => ResizeLimit;
  commit: () => void;
  cancel: () => void;
}

export interface RegisteredHandle {
  element: HTMLElement;
  /** Orientation of the separator bar, perpendicular to its group. */
  orientation: Orientation;
  isEnabled: () => boolean;
  beginResize: (origin: Point) => ResizeSession;
}

const registeredHandles = new Set<RegisteredHandle>();

export function registerHandle(handle: RegisteredHandle): () => void {
  registeredHandles.add(handle);
  return () => {
    registeredHandles.delete(handle);
  };
}

/**
 * Handles of other groups that cross or touch `source` where the pointer is, so dragging
 * the crossing point resizes both groups at once.
 */
export function findIntersectingHandles(source: RegisteredHandle, point: Point): RegisteredHandle[] {
  const sourceRect = source.element.getBoundingClientRect();
  const margin = INTERSECTION_MARGIN;
  const intersecting: RegisteredHandle[] = [];
  for (const handle of registeredHandles) {
    if (handle === source || handle.orientation === source.orientation || !handle.isEnabled()) {
      continue;
    }
    if (handle.element.ownerDocument !== source.element.ownerDocument) {
      continue;
    }
    const rect = handle.element.getBoundingClientRect();
    const touchesSource = rect.left - margin <= sourceRect.right
      && rect.right + margin >= sourceRect.left
      && rect.top - margin <= sourceRect.bottom
      && rect.bottom + margin >= sourceRect.top;
    const pointerOnBar = handle.orientation === "horizontal"
      ? point.y >= rect.top - margin && point.y <= rect.bottom + margin
      : point.x >= rect.left - margin && point.x <= rect.right + margin;
    if (touchesSource && pointerOnBar) {
      intersecting.push(handle);
    }
  }
  return intersecting;
}
