// @env browser
import type { Point } from "../shared/types";
import type { InteractionKind } from "./context";
import type { GridCell } from "./types";

/** An item on its way from one grid to another of the same group. */
export interface Arrival {
  value: string;
  label: string;
  /** Its size in cells in the grid it leaves. */
  w: number;
  h: number;
}

/** Where an arriving item would go: its top left corner at a point of the screen, or a cell. */
export type ArrivalPlace = { corner: Point } | { cell: { x: number; y: number } };

/** What a grid offers the other grids of its group. */
export interface GridPeer {
  /** The element whose box takes items dropped on the grid: all of the grid, below its rows too. */
  area: () => HTMLElement | null;
  /** Shows where the item would land and returns its cell, or `null` when the grid cannot take it. */
  preview: (arrival: Arrival, place: ArrivalPlace) => GridCell | null;
  /** Shows the item no more. */
  leave: () => void;
  /** Takes the item where it was last shown and returns its cell, or `null` when it showed nowhere. */
  receive: (arrival: Arrival) => GridCell | null;
  /** The columns of the breakpoint in use. */
  columns: () => number | null;
  /** Names the grid in announcements. */
  label: () => string;
}

const groups = new Map<string, Set<GridPeer>>();

/** Lets the grids of `group` find `peer`, until the returned function is called. */
export function joinGroup(group: string, peer: GridPeer): () => void {
  let peers = groups.get(group);
  if (!peers) {
    peers = new Set();
    groups.set(group, peers);
  }
  peers.add(peer);
  return () => {
    const current = groups.get(group);
    current?.delete(peer);
    if (current?.size === 0) {
      groups.delete(group);
    }
  };
}

function boxOf(peer: GridPeer): DOMRect | null {
  return peer.area()?.getBoundingClientRect() ?? null;
}

function contains(rect: DOMRect, point: Point): boolean {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}

/** The other grid of `group` whose box holds `point`; of nested ones, the innermost. */
export function peerAt(group: string, self: GridPeer, point: Point): GridPeer | null {
  let found: { peer: GridPeer; area: number } | null = null;
  for (const peer of groups.get(group) ?? []) {
    const rect = peer === self ? null : boxOf(peer);
    if (rect && contains(rect, point) && (!found || rect.width * rect.height < found.area)) {
      found = { peer, area: rect.width * rect.height };
    }
  }
  return found?.peer ?? null;
}

/**
 * The grids of `group` other than `from` that lie in the direction of `unit` from it, the nearest
 * first; `unit` counts columns from the inline start, so `rtl` turns its horizontal part around.
 */
export function peersToward(group: string, from: GridPeer, unit: Point, rtl: boolean): GridPeer[] {
  const origin = boxOf(from);
  if (!origin) {
    return [];
  }
  const dx = rtl ? -unit.x : unit.x;
  const candidates: { peer: GridPeer; distance: number }[] = [];
  for (const peer of groups.get(group) ?? []) {
    const rect = peer === from ? null : boxOf(peer);
    if (!rect) {
      continue;
    }
    const ahead = dx > 0 ? rect.left >= origin.right - 1 : dx < 0 ? rect.right <= origin.left + 1 : unit.y > 0 ? rect.top >= origin.bottom - 1 : rect.bottom <= origin.top + 1;
    // Beside it means overlapping it across the direction of travel.
    const beside = dx === 0 ? rect.left < origin.right && origin.left < rect.right : rect.top < origin.bottom && origin.top < rect.bottom;
    if (ahead && beside) {
      const distance = dx > 0 ? rect.left - origin.right : dx < 0 ? origin.left - rect.right : unit.y > 0 ? rect.top - origin.bottom : origin.top - rect.bottom;
      candidates.push({ peer, distance });
    }
  }
  return candidates.sort((a, b) => a.distance - b.distance).map(entry => entry.peer);
}

/** The handle that takes focus once the item it belongs to arrived in another grid, as the keyboard moved it. */
let pendingFocus: { value: string; kind: InteractionKind } | null = null;

export function focusOnArrival(value: string, kind: InteractionKind): void {
  pendingFocus = { value, kind };
}

/** Whether the handle of `kind` of the item `value` is the one to take focus now; asking clears it. */
export function takeArrivalFocus(value: string, kind: InteractionKind): boolean {
  if (pendingFocus?.value === value && pendingFocus.kind === kind) {
    pendingFocus = null;
    return true;
  }
  return false;
}
