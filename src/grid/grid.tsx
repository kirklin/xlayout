"use client";

import type { PrimitiveProps } from "../shared/primitive";
import type { Store } from "../shared/store";
import type { Point } from "../shared/types";
import type { GridContextValue, GridFrame, GridItemContextValue, InteractionKind, ItemEntry, ItemView } from "./context";
import type { Slide } from "./motion";
import type { Arrival, ArrivalPlace, GridPeer } from "./peers";
import type {
  GridCell,
  GridCollision,
  GridCompaction,
  GridDerivation,
  GridEdge,
  GridItemLayout,
  GridLayoutChange,
  GridLayouts,
  GridRules,
} from "./types";
import * as React from "react";
import { announce } from "../shared/announce";
import { useComposedRefs } from "../shared/compose-refs";
import { CspContext } from "../shared/csp";
import { getOwnerWindow, prefersReducedMotion, sortByDocumentPosition } from "../shared/dom";
import { isPrimaryPointerDown, startDragSession } from "../shared/drag";
import { composeEventHandlers } from "../shared/events";
import { renderSynchronously } from "../shared/flush";
import { clamp } from "../shared/math";
import { Primitive } from "../shared/primitive";
import { useRegistry } from "../shared/registry";
import { measureElementSize, observeElementSize } from "../shared/resize-observer";
import { createStore, useStoreSelector } from "../shared/store";
import { useControllableState } from "../shared/use-controllable-state";
import { useStableCallback } from "../shared/use-stable-callback";
import { breakpointFor, resolveBreakpoints, resolveLayouts } from "./breakpoints";
import {
  DEFAULT_BREAKPOINT,
  DEFAULT_COLUMNS,
  DEFAULT_GAP,
  DEFAULT_ROW_HEIGHT,
  DRAG_HANDLE_NAME,
  DROP_VALUE,
  ITEM_NAME,
  PLACEHOLDER_NAME,
  RESIZE_HANDLE_NAME,
  ROOT_NAME,
} from "./constants";
import { GridContext, GridItemContext, useGridContext, useGridItemContext } from "./context";
import { bottomOf, edgeSides, normalizeLayout, resolveMove, resolveResize } from "./layout";
import { slide, startAutoScroll } from "./motion";
import { focusOnArrival, joinGroup, peerAt, peersToward, takeArrivalFocus } from "./peers";
import { gridStyles } from "./styles";

const DEFAULT_BREAKPOINTS: Readonly<Record<string, number>> = { [DEFAULT_BREAKPOINT]: 0 };
const NO_LAYOUTS: GridLayouts = {};
const DEFAULT_DROP_SIZE = { w: 1, h: 1 };

/** Pointer travel in pixels before a press on a handle becomes a drag, so a click stays a click. */
const DRAG_THRESHOLD = 3;

/** Where an item being moved is while it is outside its grid: on its way out, or arriving in another grid of the group. */
type Away = "remove" | GridPeer | null;

interface Interaction {
  kind: InteractionKind;
  value: string;
  input: "pointer" | "keyboard";
  breakpoint: string;
  /** The layout when the item was picked up; every preview is worked out from it. */
  snapshot: readonly GridItemLayout[];
  /** The latest layout the rules allowed. */
  preview: readonly GridItemLayout[];
  /** Pointer moves, and resizes from the start or the top: how far the item is drawn from its cell. */
  offset: Point | null;
  /** Pointer resizes: the size the item is drawn at. */
  size: { width: number; height: number } | null;
  /** Keyboard: the cell the keys reached, in the grid the item is in now. */
  target: GridCell;
  /** Resizes: the edge the handle moves. */
  edge: GridEdge;
  away: Away;
}

interface ExternalDrop {
  breakpoint: string;
  preview: readonly GridItemLayout[];
}

/** An item another grid of the group shows arriving here. */
interface Incoming {
  breakpoint: string;
  value: string;
  preview: readonly GridItemLayout[];
}

/** An item let go after a pointer move, drawn away from its cell, to slide into place. */
interface Release {
  value: string;
  from: Point;
}

interface Geometry {
  width: number;
  columnWidth: number;
  rowHeight: number;
  gap: number;
  rtl: boolean;
}

function pixels(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function contentWidth(element: HTMLElement): number {
  const style = getOwnerWindow(element).getComputedStyle(element);
  return measureElementSize(element).width
    - pixels(style.paddingLeft) - pixels(style.paddingRight) - pixels(style.borderLeftWidth) - pixels(style.borderRightWidth);
}

function measureGeometry(canvas: HTMLElement, columns: number, rowHeight: number, gap: number): Geometry {
  const width = measureElementSize(canvas).width;
  return {
    width,
    columnWidth: (width - (columns - 1) * gap) / columns,
    rowHeight,
    gap,
    rtl: getOwnerWindow(canvas).getComputedStyle(canvas).direction === "rtl",
  };
}

/** The top left corner of a cell within the canvas. */
function cellOrigin(cell: GridCell, geometry: Geometry): Point {
  const column = geometry.columnWidth + geometry.gap;
  return {
    x: geometry.rtl ? geometry.width - (cell.x + cell.w) * column + geometry.gap : cell.x * column,
    y: cell.y * (geometry.rowHeight + geometry.gap),
  };
}

function sameCell(a: GridCell | undefined, b: GridCell | undefined): boolean {
  return a !== undefined && b !== undefined && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

function sameLayout(a: readonly GridItemLayout[], b: readonly GridItemLayout[] | null): boolean {
  return b !== null && a.length === b.length && a.every((item, index) => item.value === b[index]!.value && sameCell(item, b[index]));
}

function cellOf(layout: readonly GridItemLayout[] | null | undefined, value: string): GridItemLayout | undefined {
  return layout?.find(item => item.value === value);
}

/** The entries of a layout by value, so looking one up costs the same however many there are. */
function indexCells(layout: readonly GridItemLayout[] | null): ReadonlyMap<string, GridItemLayout> | null {
  return layout && new Map(layout.map(item => [item.value, item]));
}

function samePoint(a: Point | null, b: Point | null): boolean {
  return a === b || (a !== null && b !== null && a.x === b.x && a.y === b.y);
}

function sameView(a: ItemView, b: ItemView): boolean {
  return a.state === b.state
    && a.isStatic === b.isStatic
    && a.leaving === b.leaving
    && (a.cell === b.cell || (a.cell !== null && b.cell !== null && sameCell(a.cell, b.cell)))
    && samePoint(a.offset, b.offset)
    && (a.size === b.size || (a.size !== null && b.size !== null && a.size.width === b.size.width && a.size.height === b.size.height));
}

/** The layout once the item is gone, the others closing the gap it leaves. */
function withoutItem(layout: readonly GridItemLayout[], value: string, rules: GridRules): GridItemLayout[] {
  return normalizeLayout(layout.filter(item => item.value !== value), rules);
}

/**
 * Moves or resizes an item one step in a direction, going further when a step changes nothing,
 * such as a move onto an item that only swaps once passed halfway. A resize moves the sides of
 * `edge`; arrows along the other axis change nothing.
 */
function advance(
  kind: InteractionKind,
  snapshot: readonly GridItemLayout[],
  value: string,
  start: GridCell,
  unit: Point,
  rules: GridRules,
  shown: readonly GridItemLayout[],
  edge: GridEdge,
): { target: GridCell; preview: GridItemLayout[] } | null {
  const bottom = bottomOf(snapshot);
  const sides = edgeSides(edge);
  for (let step = 1; step <= Math.max(rules.columns, bottom + 1); step++) {
    if (kind === "move") {
      const target = { ...start, x: start.x + unit.x * step, y: start.y + unit.y * step };
      if (target.x < 0 || target.x + target.w > rules.columns || target.y < 0 || target.y > bottom) {
        return null;
      }
      const preview = resolveMove(snapshot, value, target, rules);
      if (preview && !sameLayout(preview, shown)) {
        return { target, preview };
      }
      continue;
    }
    const size = { w: start.w + sides.x * unit.x * step, h: start.h + sides.y * unit.y * step };
    if (size.w < 1 || size.h < 1 || size.w > rules.columns || size.h > bottom + 1 + start.h) {
      return null;
    }
    const preview = resolveResize(snapshot, value, size, rules, edge);
    if (preview && !sameLayout(preview, shown)) {
      return { target: cellOf(preview, value)!, preview };
    }
  }
  return null;
}

/** The step an arrow key asks for, in grid units, with columns counted from the inline start. */
function arrowStep(key: string, rtl: boolean): Point | null {
  switch (key) {
    case "ArrowLeft":
      return { x: rtl ? 1 : -1, y: 0 };
    case "ArrowRight":
      return { x: rtl ? -1 : 1, y: 0 };
    case "ArrowUp":
      return { x: 0, y: -1 };
    case "ArrowDown":
      return { x: 0, y: 1 };
    default:
      return null;
  }
}

/** The cursor of a resize from `edge`; the diagonal ones turn around in right to left. */
function resizeCursor(edge: GridEdge, rtl: boolean): string {
  const { x, y } = edgeSides(edge);
  if (x === 0) {
    return "ns-resize";
  }
  if (y === 0) {
    return "ew-resize";
  }
  return (x === y) !== rtl ? "nwse-resize" : "nesw-resize";
}

export interface GridDrop {
  breakpoint: string;
  /** Where the dropped item goes. */
  cell: GridCell;
  /** The other items, moved out of its way. */
  layout: GridItemLayout[];
}

export interface GridProps extends Omit<PrimitiveProps<"div">, "asChild"> {
  /** Breakpoints by name, each the narrowest grid width it applies to. @default { base: 0 } */
  breakpoints?: Readonly<Record<string, number>>;
  /** Columns, for every breakpoint or by breakpoint name. @default 12 */
  columns?: number | Readonly<Record<string, number>>;
  layouts?: GridLayouts;
  defaultLayouts?: GridLayouts;
  /**
   * Called when the user moved, resized or removed an item, or one arrived from another grid of
   * the group, with every layout. An item that arrived or left needs rendering, or no more, by you.
   */
  onLayoutsChange?: (layouts: GridLayouts, change: GridLayoutChange) => void;
  /** How breakpoints without a layout adapt the nearest one. @default "scale" */
  derive?: GridDerivation;
  /** Row height in pixels. @default 150 */
  rowHeight?: number;
  /** Space between cells in pixels. @default 10 */
  gap?: number;
  /** @default "vertical" */
  compact?: GridCompaction;
  /** @default "push" */
  collision?: GridCollision;
  /** Slides items to their new places. @default true */
  animate?: boolean;
  /**
   * Grids with the same group take each other's items: an item dragged over another such grid,
   * or moved past the edge toward it with the keyboard, goes over to it.
   */
  group?: string;
  /**
   * Lets an item dragged out of the grid, onto no grid of its group, go away, and Delete remove
   * the item picked up with the keyboard. The grid reports the change with the reason `"remove"`.
   */
  removable?: boolean;
  /** The size in cells of an item dragged in from outside. @default { w: 1, h: 1 } */
  dropSize?: { w: number; h: number };
  /** Accepts items dragged in from outside; the grid shows where they would land meanwhile. */
  onDropItem?: (drop: GridDrop, event: React.DragEvent<HTMLDivElement>) => void;
  /** Whether a drag from outside may drop here. */
  acceptDrop?: (event: React.DragEvent<HTMLDivElement>) => boolean;
}

/**
 * A dashboard grid: items take whole cells, move and resize by pointer, keyboard or code, and
 * have a layout for each breakpoint of the grid's own width. The layouts are written as style
 * rules in container queries, so they are right before any script runs.
 */
function Grid(props: GridProps): React.ReactNode {
  const {
    breakpoints: minWidths = DEFAULT_BREAKPOINTS,
    columns = DEFAULT_COLUMNS,
    layouts: layoutsProp,
    defaultLayouts = NO_LAYOUTS,
    onLayoutsChange,
    derive = "scale",
    rowHeight = DEFAULT_ROW_HEIGHT,
    gap = DEFAULT_GAP,
    compact = "vertical",
    collision = "push",
    animate = true,
    group,
    removable = false,
    dropSize = DEFAULT_DROP_SIZE,
    onDropItem,
    acceptDrop,
    ref,
    style,
    children,
    ...rootProps
  } = props;
  // Keys keep objects written inline from counting as a change on every render.
  const breakpointsKey = JSON.stringify(minWidths);
  const columnsKey = JSON.stringify(columns);
  const breakpoints = React.useMemo(
    () => resolveBreakpoints(JSON.parse(breakpointsKey) as Record<string, number>, JSON.parse(columnsKey) as number | Record<string, number>),
    [breakpointsKey, columnsKey],
  );
  const scopeId = React.useId();
  const [layouts, setLayouts] = useControllableState({ prop: layoutsProp, defaultProp: defaultLayouts, caller: ROOT_NAME });
  const layoutsRef = React.useRef(layouts);
  React.useLayoutEffect(() => {
    layoutsRef.current = layouts;
  });
  const [root, setRoot] = React.useState<HTMLDivElement | null>(null);
  const composedRef = useComposedRefs(ref, setRoot);
  const [canvas, setCanvas] = React.useState<HTMLDivElement | null>(null);
  const [items, registerEntry] = useRegistry<ItemEntry>(sortByDocumentPosition);
  const [mounted, setMounted] = React.useState(false);
  const [width, setWidth] = React.useState<number | null>(null);
  const [interaction, setInteraction] = React.useState<Interaction | null>(null);
  const interactionRef = React.useRef<Interaction | null>(null);
  const [drop, setDrop] = React.useState<ExternalDrop | null>(null);
  const [incoming, setIncoming] = React.useState<Incoming | null>(null);
  const incomingRef = React.useRef<Incoming | null>(null);
  const releaseRef = React.useRef<Release | null>(null);
  const labelsRef = React.useRef(new Map<string, string>());

  // Event handlers read these before React renders them.
  const applyInteraction = React.useCallback((next: Interaction | null) => {
    interactionRef.current = next;
    setInteraction(next);
  }, []);
  const applyIncoming = React.useCallback((next: Incoming | null) => {
    incomingRef.current = next;
    setIncoming(next);
  }, []);

  React.useLayoutEffect(() => {
    // Until the items have registered, every layout entry is shown, as on the server.
    // eslint-disable-next-line react/set-state-in-effect
    setMounted(true);
  }, []);

  const values = React.useMemo(() => (mounted ? items.map(entry => entry.value) : null), [mounted, items]);
  const resolved = React.useMemo(
    () => resolveLayouts({ breakpoints, layouts, derivation: derive, rules: { compact, collision }, values }),
    [breakpoints, layouts, derive, compact, collision, values],
  );
  const active = width === null ? null : breakpointFor(width, breakpoints);
  const committed = active ? resolved.get(active.name)! : null;
  const rulesFor = React.useCallback(
    (breakpoint: string): GridRules => ({ columns: breakpoints.find(entry => entry.name === breakpoint)!.columns, compact, collision }),
    [breakpoints, compact, collision],
  );

  React.useLayoutEffect(() => {
    if (!root) {
      return;
    }
    // Measuring in a layout effect knows the breakpoint before the first paint.
    // eslint-disable-next-line react/set-state-in-effect
    setWidth(contentWidth(root));
    let pending = false;
    let observing = true;
    const stop = observeElementSize(root, () => {
      if (pending) {
        return;
      }
      pending = true;
      queueMicrotask(() => {
        pending = false;
        if (observing) {
          renderSynchronously(() => setWidth(contentWidth(root)));
        }
      });
    });
    return () => {
      observing = false;
      stop();
    };
  }, [root]);

  const handleLayoutsChange = useStableCallback(onLayoutsChange);
  const report = (next: GridLayouts, change: GridLayoutChange): void => {
    layoutsRef.current = next;
    setLayouts(next);
    handleLayoutsChange(next, change);
  };
  const commit = useStableCallback((breakpoint: string, layout: readonly GridItemLayout[], change: Omit<GridLayoutChange, "breakpoint">) => {
    report({ ...layoutsRef.current, [breakpoint]: layout.map(item => ({ ...item })) }, { breakpoint, ...change });
  });
  /** Takes the item out of every layout, the one in use given as `layout`. */
  const commitRemoval = useStableCallback((breakpoint: string, layout: readonly GridItemLayout[], value: string) => {
    const next: Record<string, GridItemLayout[]> = {};
    for (const [name, entries] of Object.entries(layoutsRef.current)) {
      next[name] = entries.filter(item => item.value !== value).map(item => ({ ...item }));
    }
    next[breakpoint] = layout.filter(item => item.value !== value).map(item => ({ ...item }));
    report(next, { breakpoint, value, reason: "remove" });
  });
  /** Puts an item that arrived in every layout: where it was shown in the one in use, below the others elsewhere. */
  const commitArrival = useStableCallback((breakpoint: string, layout: readonly GridItemLayout[], arrival: Arrival) => {
    const next: Record<string, GridItemLayout[]> = {};
    for (const [name, entries] of Object.entries(layoutsRef.current)) {
      const count = breakpoints.find(entry => entry.name === name)!.columns;
      next[name] = [...entries.map(item => ({ ...item })), { value: arrival.value, x: 0, y: bottomOf(entries), w: Math.min(arrival.w, count), h: arrival.h }];
    }
    next[breakpoint] = layout.map(item => ({ ...item }));
    report(next, { breakpoint, value: arrival.value, reason: "add" });
  });

  const say = (message: string): void => {
    if (canvas) {
      announce(message, canvas.ownerDocument);
    }
  };
  const labelOf = (value: string): string => labelsRef.current.get(value) ?? value;
  const gridLabel = rootProps["aria-label"] ?? "another grid";

  // Other grids of the group see this one through its peer, which reads the latest state.
  const areaRef = React.useRef<HTMLDivElement | null>(null);
  const activeRef = React.useRef(active);
  const committedRef = React.useRef(committed);
  const gridLabelRef = React.useRef(gridLabel);
  React.useLayoutEffect(() => {
    areaRef.current = root;
    activeRef.current = active;
    committedRef.current = committed;
    gridLabelRef.current = gridLabel;
  });
  const previewArrival = useStableCallback((arrival: Arrival, place: ArrivalPlace): GridCell | null => {
    const current = committedRef.current;
    const breakpoint = activeRef.current;
    if (!canvas || !breakpoint || !current || interactionRef.current || items.some(entry => entry.value === arrival.value)) {
      return null;
    }
    const rules = rulesFor(breakpoint.name);
    const geometry = measureGeometry(canvas, rules.columns, rowHeight, gap);
    const size = { w: Math.min(arrival.w, rules.columns), h: arrival.h };
    let target = "cell" in place ? place.cell : null;
    if ("corner" in place) {
      const rect = canvas.getBoundingClientRect();
      const left = place.corner.x - rect.left;
      const top = place.corner.y - rect.top;
      const drawn = size.w * geometry.columnWidth + (size.w - 1) * gap;
      target = {
        x: Math.round((geometry.rtl ? geometry.width - left - drawn : left) / (geometry.columnWidth + gap)),
        y: Math.round(top / (rowHeight + gap)),
      };
    }
    const arriving = [...current, { value: arrival.value, x: 0, y: bottomOf(current), ...size }];
    const next = resolveMove(arriving, arrival.value, target!, rules, false);
    if (!next) {
      return null;
    }
    const shown = incomingRef.current;
    if (!(shown && shown.value === arrival.value && sameLayout(next, shown.preview))) {
      renderSynchronously(() => applyIncoming({ breakpoint: breakpoint.name, value: arrival.value, preview: next }));
    }
    return cellOf(next, arrival.value) ?? null;
  });
  const leaveArrival = useStableCallback(() => {
    if (incomingRef.current) {
      renderSynchronously(() => applyIncoming(null));
    }
  });
  const receiveArrival = useStableCallback((arrival: Arrival): GridCell | null => {
    const shown = incomingRef.current;
    if (!shown || shown.value !== arrival.value) {
      return null;
    }
    applyIncoming(null);
    commitArrival(shown.breakpoint, shown.preview, arrival);
    return cellOf(shown.preview, arrival.value) ?? null;
  });
  const peer = React.useMemo((): GridPeer => ({
    area: () => areaRef.current,
    preview: (arrival, place) => previewArrival(arrival, place) ?? null,
    leave: leaveArrival,
    receive: arrival => receiveArrival(arrival) ?? null,
    columns: () => activeRef.current?.columns ?? null,
    label: () => gridLabelRef.current,
  }), [previewArrival, leaveArrival, receiveArrival]);
  React.useEffect(() => (group === undefined ? undefined : joinGroup(group, peer)), [group, peer]);

  /**
   * Where an item dragged to `point` goes: away to remove, to another grid of the group, or
   * nowhere but this grid, which takes it anywhere on its box, below its rows too.
   */
  const awayAt = (point: Point, arrival: Arrival, corner: Point, previous: Away): Away => {
    const rect = root!.getBoundingClientRect();
    const inside = point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
    let away: Away = null;
    if (!inside) {
      const other = group === undefined ? null : peerAt(group, peer, point);
      if (other) {
        away = other.preview(arrival, { corner }) ? other : null;
      } else if (removable) {
        away = "remove";
      }
    }
    if (previous && previous !== "remove" && previous !== away) {
      previous.leave();
    }
    return away;
  };

  const beginPointer = useStableCallback((kind: InteractionKind, value: string, event: React.PointerEvent<HTMLElement>, edge: GridEdge) => {
    const entry = items.find(item => item.value === value);
    const origin = cellOf(committed, value);
    if (!canvas || !active || !committed || !entry || !origin || origin.static || interactionRef.current) {
      return;
    }
    const breakpoint = active.name;
    const rules = rulesFor(breakpoint);
    const geometry = measureGeometry(canvas, rules.columns, rowHeight, gap);
    const canvasRect = canvas.getBoundingClientRect();
    const itemRect = entry.element.getBoundingClientRect();
    const start = { x: itemRect.left - canvasRect.left, y: itemRect.top - canvasRect.top, width: itemRect.width, height: itemRect.height };
    const sides = edgeSides(edge);
    // The physical sides a resize moves: the inline start is on the right in right to left.
    const movesRight = sides.x !== 0 && (sides.x > 0) !== geometry.rtl;
    const movesLeft = sides.x !== 0 && !movesRight;
    // Where the pointer holds the item: by its top left corner to move it, by the sides it moves to resize it.
    const hold = kind === "move"
      ? { x: event.clientX - itemRect.left, y: event.clientY - itemRect.top }
      : { x: event.clientX - (movesRight ? itemRect.right : itemRect.left), y: event.clientY - (sides.y > 0 ? itemRect.bottom : itemRect.top) };
    const snapshot = committed;
    const arrival: Arrival = { value, label: labelOf(value), w: origin.w, h: origin.h };
    let pointer = { x: event.clientX, y: event.clientY };

    const update = (): void => {
      const current = interactionRef.current;
      if (!current) {
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const corner = { x: pointer.x - hold.x - rect.left, y: pointer.y - hold.y - rect.top };
      if (kind === "move") {
        const offset = { x: corner.x - start.x, y: corner.y - start.y };
        const away = awayAt(pointer, arrival, { x: pointer.x - hold.x, y: pointer.y - hold.y }, current.away);
        if (away) {
          renderSynchronously(() => applyInteraction({ ...current, preview: withoutItem(snapshot, value, rules), offset, away }));
          return;
        }
        const column = geometry.columnWidth + geometry.gap;
        const x = Math.round((geometry.rtl ? geometry.width - corner.x - start.width : corner.x) / column);
        const y = Math.round(corner.y / (geometry.rowHeight + geometry.gap));
        const preview = resolveMove(snapshot, value, { x, y }, rules) ?? (current.away ? snapshot : current.preview);
        renderSynchronously(() => applyInteraction({ ...current, preview, offset, away: null }));
        return;
      }
      const left = movesLeft ? Math.min(corner.x, start.x + start.width - geometry.columnWidth) : start.x;
      const right = movesRight ? Math.max(corner.x, start.x + geometry.columnWidth) : start.x + start.width;
      const top = sides.y < 0 ? Math.min(corner.y, start.y + start.height - geometry.rowHeight) : start.y;
      const bottom = sides.y > 0 ? Math.max(corner.y, start.y + geometry.rowHeight) : start.y + start.height;
      const drawn = { width: right - left, height: bottom - top };
      const size = {
        w: Math.round((drawn.width + geometry.gap) / (geometry.columnWidth + geometry.gap)),
        h: Math.round((drawn.height + geometry.gap) / (geometry.rowHeight + geometry.gap)),
      };
      const preview = resolveResize(snapshot, value, size, rules, edge) ?? current.preview;
      renderSynchronously(() => applyInteraction({ ...current, preview, size: drawn, offset: { x: left - start.x, y: top - start.y } }));
    };

    const autoScroll = startAutoScroll(canvas, update);
    const finish = (keep: boolean): void => {
      autoScroll.stop();
      const current = interactionRef.current;
      if (!current) {
        return;
      }
      const { away } = current;
      if (kind === "move" && current.offset && !away) {
        releaseRef.current = { value, from: { x: start.x + current.offset.x, y: start.y + current.offset.y } };
      }
      renderSynchronously(() => {
        applyInteraction(null);
        if (away && away !== "remove") {
          if (keep && away.receive(arrival)) {
            commitRemoval(breakpoint, current.preview, value);
          } else {
            away.leave();
          }
        } else if (away === "remove") {
          if (keep) {
            commitRemoval(breakpoint, current.preview, value);
          }
        } else if (keep && !sameLayout(current.preview, snapshot)) {
          commit(breakpoint, current.preview, { value, reason: kind });
        }
      });
    };
    startDragSession(event.nativeEvent, {
      threshold: DRAG_THRESHOLD,
      cursor: kind === "move" ? "grabbing" : resizeCursor(edge, geometry.rtl),
      captureElement: event.currentTarget,
    }, {
      onStart: () => {
        renderSynchronously(() => applyInteraction({
          kind,
          value,
          input: "pointer",
          breakpoint,
          snapshot,
          preview: snapshot,
          offset: { x: 0, y: 0 },
          size: kind === "resize" ? { width: start.width, height: start.height } : null,
          target: origin,
          edge,
          away: null,
        }));
      },
      onMove: (moveEvent) => {
        pointer = { x: moveEvent.clientX, y: moveEvent.clientY };
        autoScroll.update(pointer);
        update();
      },
      onEnd: () => finish(true),
      onCancel: () => finish(false),
      // When the browser takes the pointer away, what the user did so far is kept.
      onInterrupt: () => finish(true),
    });
  });

  const finishKeyboard = (keep: boolean): void => {
    const current = interactionRef.current;
    if (!current) {
      return;
    }
    applyInteraction(null);
    const { away, value } = current;
    if (away && away !== "remove") {
      const { w, h } = cellOf(current.snapshot, value)!;
      const arrival: Arrival = { value, label: labelOf(value), w, h };
      const cell = keep ? away.receive(arrival) : null;
      if (cell) {
        commitRemoval(current.breakpoint, current.preview, value);
        focusOnArrival(value, current.kind);
        say(`${labelOf(value)} dropped in ${away.label()} at column ${cell.x + 1}, row ${cell.y + 1}.`);
        return;
      }
      away.leave();
    }
    if (keep && !sameLayout(current.preview, current.snapshot)) {
      commit(current.breakpoint, current.preview, { value, reason: current.kind });
    }
    const cell = cellOf(keep ? current.preview : current.snapshot, value)!;
    say(keep
      ? `${labelOf(value)} dropped at column ${cell.x + 1}, row ${cell.y + 1}.`
      : `${labelOf(value)} put back at column ${cell.x + 1}, row ${cell.y + 1}.`);
  };

  /**
   * Moves the item picked up with the keyboard past the edge of the grid it is in, into the
   * nearest grid of the group that way, which may be its own again; returns whether one took it.
   */
  const crossOver = (current: Interaction, unit: Point, rtl: boolean): boolean => {
    if (group === undefined || current.kind !== "move") {
      return false;
    }
    const from = current.away && current.away !== "remove" ? current.away : peer;
    const { w, h } = cellOf(current.snapshot, current.value)!;
    const arrival: Arrival = { value: current.value, label: labelOf(current.value), w, h };
    for (const target of peersToward(group, from, unit, rtl)) {
      const count = target === peer ? rulesFor(current.breakpoint).columns : target.columns();
      if (count === null) {
        continue;
      }
      const width = Math.min(w, count);
      const cell = {
        x: unit.x > 0 ? 0 : unit.x < 0 ? count - width : clamp(current.target.x, 0, count - width),
        y: unit.y === 0 ? current.target.y : 0,
      };
      if (target === peer) {
        const preview = resolveMove(current.snapshot, current.value, cell, rulesFor(current.breakpoint));
        if (!preview) {
          continue;
        }
        from.leave();
        applyInteraction({ ...current, away: null, preview, target: cellOf(preview, current.value)! });
        const landed = cellOf(preview, current.value)!;
        say(`${labelOf(current.value)} moved back to column ${landed.x + 1}, row ${landed.y + 1}.`);
        return true;
      }
      const landed = target.preview(arrival, { cell });
      if (!landed) {
        continue;
      }
      if (from !== peer) {
        from.leave();
      }
      const rules = rulesFor(current.breakpoint);
      applyInteraction({ ...current, away: target, preview: withoutItem(current.snapshot, current.value, rules), target: landed });
      say(`${labelOf(current.value)} moved to ${target.label()}, column ${landed.x + 1}, row ${landed.y + 1}.`);
      return true;
    }
    return false;
  };

  const handleKey = useStableCallback((kind: InteractionKind, value: string, event: React.KeyboardEvent<HTMLElement>, edge: GridEdge) => {
    const current = interactionRef.current;
    const picked = current?.input === "keyboard" && current.value === value && current.kind === kind;
    const confirm = event.key === " " || event.key === "Enter";
    if (!picked) {
      const origin = cellOf(committed, value);
      if (!confirm || current || !active || !committed || !origin || origin.static) {
        return;
      }
      event.preventDefault();
      applyInteraction({
        kind,
        value,
        input: "keyboard",
        breakpoint: active.name,
        snapshot: committed,
        preview: committed,
        offset: null,
        size: null,
        target: { x: origin.x, y: origin.y, w: origin.w, h: origin.h },
        edge,
        away: null,
      });
      say(kind === "move"
        ? `${labelOf(value)} picked up. Arrow keys move it, Space or Enter drops it, Escape puts it back${removable ? ", Delete removes it" : ""}.`
        : `${labelOf(value)} picked up for resizing. Arrow keys resize it, Space or Enter drops it, Escape puts it back.`);
      return;
    }
    if (confirm || event.key === "Escape") {
      event.preventDefault();
      finishKeyboard(confirm);
      return;
    }
    if (event.key === "Delete" && removable && kind === "move") {
      event.preventDefault();
      if (current.away && current.away !== "remove") {
        current.away.leave();
      }
      applyInteraction(null);
      commitRemoval(current.breakpoint, withoutItem(current.snapshot, value, rulesFor(current.breakpoint)), value);
      say(`${labelOf(value)} removed.`);
      return;
    }
    const rtl = canvas ? getOwnerWindow(canvas).getComputedStyle(canvas).direction === "rtl" : false;
    const unit = arrowStep(event.key, rtl);
    if (!unit) {
      return;
    }
    event.preventDefault();
    const away = current.away && current.away !== "remove" ? current.away : null;
    if (away) {
      // In another grid of the group, the keys move the item there.
      const cell = { x: current.target.x + unit.x, y: current.target.y + unit.y };
      const count = away.columns() ?? 0;
      if (cell.x >= 0 && cell.x + current.target.w <= count && cell.y >= 0) {
        const { w, h } = cellOf(current.snapshot, value)!;
        const landed = away.preview({ value, label: labelOf(value), w, h }, { cell });
        if (landed) {
          applyInteraction({ ...current, target: landed });
          say(`${labelOf(value)} moved to column ${landed.x + 1}, row ${landed.y + 1}.`);
          return;
        }
      }
      if (!crossOver(current, unit, rtl)) {
        say(`${labelOf(value)} cannot go further that way.`);
      }
      return;
    }
    const next = advance(kind, current.snapshot, value, current.target, unit, rulesFor(current.breakpoint), current.preview, current.edge);
    if (next) {
      applyInteraction({ ...current, target: next.target, preview: next.preview });
      const cell = cellOf(next.preview, value)!;
      say(kind === "move"
        ? `${labelOf(value)} moved to column ${cell.x + 1}, row ${cell.y + 1}.`
        : `${labelOf(value)} resized to ${cell.w} columns by ${cell.h} rows.`);
      return;
    }
    if (!crossOver(current, unit, rtl)) {
      say(`${labelOf(value)} cannot go further that way.`);
    }
  });

  const handleBlur = useStableCallback((value: string) => {
    const current = interactionRef.current;
    if (current?.input === "keyboard" && current.value === value) {
      finishKeyboard(false);
    }
  });

  const step = useStableCallback((kind: InteractionKind, value: string, unit: Point): boolean => {
    const origin = cellOf(committed, value);
    if (!active || !committed || !origin || interactionRef.current) {
      return false;
    }
    const next = advance(kind, committed, value, origin, unit, rulesFor(active.name), committed, "bottom-end");
    if (!next) {
      return false;
    }
    commit(active.name, next.preview, { value, reason: kind });
    return true;
  });

  const remove = useStableCallback((value: string): boolean => {
    if (!active || !committed || !cellOf(committed, value) || interactionRef.current) {
      return false;
    }
    commitRemoval(active.name, withoutItem(committed, value, rulesFor(active.name)), value);
    return true;
  });

  const entriesRef = React.useRef(new Map<string, ItemEntry>());
  const registerItem = React.useCallback((entry: ItemEntry) => {
    const entries = entriesRef.current;
    if (entries.has(entry.value)) {
      throw new Error(`${ROOT_NAME} already has an item with the value "${entry.value}".`);
    }
    entries.set(entry.value, entry);
    labelsRef.current.set(entry.value, entry.label);
    const unregister = registerEntry(entry);
    return () => {
      unregister();
      entries.delete(entry.value);
    };
  }, [registerEntry]);

  const preview = interaction?.preview ?? incoming?.preview ?? drop?.preview ?? null;
  const committedCells = React.useMemo(() => indexCells(committed), [committed]);
  const previewCells = React.useMemo(() => indexCells(preview), [preview]);
  const snapshotCells = React.useMemo(() => indexCells(interaction?.snapshot ?? null), [interaction?.snapshot]);
  const itemView = React.useCallback((value: string): ItemView => {
    const isStatic = committedCells?.get(value)?.static === true;
    if (interaction?.value === value) {
      const state = interaction.kind === "move" ? "dragging" : "resizing";
      const leaving = interaction.away !== null;
      if (interaction.input === "keyboard") {
        return { state, isStatic, leaving, cell: previewCells?.get(value) ?? snapshotCells?.get(value) ?? null, offset: null, size: null };
      }
      // A pointer holds the item at its old cell, drawn where the pointer has it.
      return { state, isStatic, leaving, cell: snapshotCells?.get(value) ?? null, offset: interaction.offset, size: interaction.size };
    }
    // The style rules place an item where the preview leaves it, so it changes only when the preview moves it.
    const shown = previewCells?.get(value);
    const moved = shown !== undefined && !sameCell(shown, committedCells?.get(value));
    return { state: "idle", isStatic, leaving: false, cell: moved ? shown : null, offset: null, size: null };
  }, [committedCells, previewCells, snapshotCells, interaction]);
  // The cell each item is drawn in, for sliding the ones that move.
  const drawn = React.useMemo(() => {
    const cells = new Map<string, GridCell>();
    for (const entry of items) {
      const cell = itemView(entry.value).cell ?? committedCells?.get(entry.value);
      if (cell) {
        cells.set(entry.value, cell);
      }
    }
    return cells;
  }, [items, itemView, committedCells]);

  // Like dragged items, items dragged in from outside land anywhere on the grid's box.
  const dropHandlers: React.HTMLAttributes<HTMLDivElement> = onDropItem
    ? {
        onDragOver: composeEventHandlers(rootProps.onDragOver, (event) => {
          if (!canvas || !active || !committed || interactionRef.current || (acceptDrop && !acceptDrop(event))) {
            return;
          }
          event.preventDefault();
          const rules = rulesFor(active.name);
          const geometry = measureGeometry(canvas, rules.columns, rowHeight, gap);
          const size = { w: Math.min(dropSize.w, rules.columns), h: dropSize.h };
          const drawn = { width: size.w * geometry.columnWidth + (size.w - 1) * gap, height: size.h * geometry.rowHeight + (size.h - 1) * gap };
          const rect = canvas.getBoundingClientRect();
          // The item is held by its middle.
          const left = event.clientX - rect.left - drawn.width / 2;
          const top = event.clientY - rect.top - drawn.height / 2;
          const target = {
            x: Math.round((geometry.rtl ? geometry.width - left - drawn.width : left) / (geometry.columnWidth + gap)),
            y: Math.round(top / (geometry.rowHeight + gap)),
          };
          const arriving = [...committed, { value: DROP_VALUE, x: 0, y: bottomOf(committed), ...size }];
          const next = resolveMove(arriving, DROP_VALUE, target, rules, false);
          if (next && !(drop && sameLayout(next, drop.preview))) {
            setDrop({ breakpoint: active.name, preview: next });
          }
        }),
        onDragLeave: composeEventHandlers(rootProps.onDragLeave, (event) => {
          const entered = event.relatedTarget;
          if (!(root && entered instanceof getOwnerWindow(root).Node && root.contains(entered))) {
            setDrop(null);
          }
        }),
        onDrop: composeEventHandlers(rootProps.onDrop, (event) => {
          if (!drop) {
            return;
          }
          event.preventDefault();
          const { x, y, w, h } = cellOf(drop.preview, DROP_VALUE)!;
          setDrop(null);
          onDropItem({ breakpoint: drop.breakpoint, cell: { x, y, w, h }, layout: drop.preview.filter(item => item.value !== DROP_VALUE) }, event);
        }),
      }
    : {};

  // The preview is the dragged item's, the arriving item's or the dropped one's, whichever there is.
  const landing = interaction?.input === "pointer" ? interaction.value : incoming ? incoming.value : drop ? DROP_VALUE : null;
  const placeholder = landing === null ? null : previewCells?.get(landing) ?? null;
  const pickedUp = interaction?.input === "keyboard" ? interaction : null;
  const shownCells = previewCells ?? committedCells;
  const frame = React.useMemo((): GridFrame => ({
    breakpoint: active?.name ?? null,
    columns: active?.columns ?? null,
    layout: preview ?? committed,
    cellOf: value => shownCells?.get(value),
    placeholder,
    pickedUp: pickedUp ? { value: pickedUp.value, kind: pickedUp.kind } : null,
    itemView,
    entries: items,
    drawn,
    held: interaction?.input === "pointer" ? interaction.value : null,
  }), [active, preview, committed, shownCells, placeholder, pickedUp, itemView, items, drawn, interaction]);
  const [frameStore] = React.useState(() => createStore(frame));
  React.useLayoutEffect(() => {
    frameStore.set(frame);
  }, [frameStore, frame]);

  const stepItem = React.useCallback((kind: InteractionKind, value: string, unit: Point) => step(kind, value, unit) ?? false, [step]);
  const removeItem = React.useCallback((value: string) => remove(value) ?? false, [remove]);
  const contextValue = React.useMemo((): GridContextValue => ({
    frame: frameStore,
    registerItem,
    beginPointer,
    handleKey,
    handleBlur,
    step: stepItem,
    remove: removeItem,
  }), [frameStore, registerItem, beginPointer, handleKey, handleBlur, stepItem, removeItem]);

  const nonce = React.use(CspContext);
  const css = React.useMemo(
    () => gridStyles({ scope: scopeId, breakpoints, layouts: resolved, rowHeight, gap }),
    [scopeId, breakpoints, resolved, rowHeight, gap],
  );
  const state = interaction
    ? interaction.away === "remove" ? "removing" : interaction.kind === "move" ? "dragging" : "resizing"
    : incoming || drop ? "dropping" : "idle";
  return (
    <GridContext value={contextValue}>
      <Primitive.div
        data-xlayout-grid={scopeId}
        data-breakpoint={active?.name}
        data-state={state}
        {...rootProps}
        {...dropHandlers}
        ref={composedRef}
        style={style}
      >
        <style nonce={nonce}>{css}</style>
        <div ref={setCanvas} data-xlayout-grid-canvas={scopeId}>
          {children}
          <GridMotion frame={frameStore} canvas={canvas} animate={animate} rowHeight={rowHeight} gap={gap} releaseRef={releaseRef} />
        </div>
      </Primitive.div>
    </GridContext>
  );
}

interface GridMotionProps {
  frame: Store<GridFrame>;
  canvas: HTMLElement | null;
  animate: boolean;
  rowHeight: number;
  gap: number;
  /** The item a pointer let go of, drawn where it was dropped. */
  releaseRef: React.RefObject<Release | null>;
}

/**
 * Slides items from where they were drawn to where they are drawn now; a change of breakpoint
 * places them at once. It renders with the items a change concerns, after them, so it measures
 * them where that change put them.
 */
function GridMotion({ frame, canvas, animate, rowHeight, gap, releaseRef }: GridMotionProps): null {
  const current = useStoreSelector(frame, state => state);
  const shownRef = React.useRef<{ breakpoint: string | null; cells: ReadonlyMap<string, GridCell> }>({ breakpoint: null, cells: new Map() });
  React.useLayoutEffect(() => {
    const release = releaseRef.current;
    releaseRef.current = null;
    if (!canvas || current.breakpoint === null || current.columns === null) {
      return;
    }
    const previous = shownRef.current;
    shownRef.current = { breakpoint: current.breakpoint, cells: current.drawn };
    if (!animate || previous.breakpoint !== current.breakpoint || prefersReducedMotion(canvas)) {
      return;
    }
    const geometry = measureGeometry(canvas, current.columns, rowHeight, gap);
    const slides: Slide[] = [];
    for (const entry of current.entries) {
      const cell = current.drawn.get(entry.value);
      if (!cell || current.held === entry.value) {
        continue;
      }
      const to = cellOrigin(cell, geometry);
      const before = previous.cells.get(entry.value);
      if (release?.value === entry.value) {
        slides.push({ element: entry.element, from: release.from, to });
      } else if (before && !sameCell(before, cell)) {
        slides.push({ element: entry.element, from: cellOrigin(before, geometry), to });
      }
    }
    slide(canvas, slides);
  }, [current, canvas, animate, rowHeight, gap, releaseRef]);
  return null;
}

export interface GridItemProps extends PrimitiveProps<"div"> {
  /** Names the item's entry in the layouts. */
  value: string;
  /** Names the item in what screen readers announce. @default value */
  label?: string;
}

function GridItem(props: GridItemProps): React.ReactNode {
  const { value, label, ref, style, ...itemProps } = props;
  const context = useGridContext(ITEM_NAME);
  const name = label ?? value;
  const { registerItem } = context;
  // Registering from the ref puts the item into the root's next render.
  const register = React.useCallback(
    (element: HTMLDivElement | null) => (element ? registerItem({ value, element, label: name }) : undefined),
    [registerItem, value, name],
  );
  const composedRef = useComposedRefs(ref, register);
  const selectView = React.useCallback((frame: GridFrame) => frame.itemView(value), [value]);
  const view = useStoreSelector(context.frame, selectView, sameView);
  const itemContext = React.useMemo((): GridItemContextValue => ({ value, label: name }), [value, name]);
  return (
    <GridItemContext value={itemContext}>
      <Primitive.div
        data-xlayout-grid-item={value}
        data-state={view.state}
        data-static={view.isStatic ? "" : undefined}
        data-leaving={view.leaving ? "" : undefined}
        {...itemProps}
        ref={composedRef}
        // The grid's style rules place the item; these show a change while it is previewed.
        style={{
          ...(view.cell
            ? {
                "--xlayout-grid-x": view.cell.x,
                "--xlayout-grid-y": view.cell.y,
                "--xlayout-grid-w": view.cell.w,
                "--xlayout-grid-h": view.cell.h,
              }
            : null),
          ...(view.offset && (view.offset.x !== 0 || view.offset.y !== 0) ? { translate: `${view.offset.x}px ${view.offset.y}px` } : null),
          ...(view.size ? { width: view.size.width, height: view.size.height, justifySelf: "start", alignSelf: "start" } : null),
          ...style,
        }}
      />
    </GridItemContext>
  );
}

type HandleProps = PrimitiveProps<"button">;

function useHandleProps(kind: InteractionKind, partName: string, props: HandleProps, edge: GridEdge): HandleProps & { "data-state": "picked" | "idle" } {
  const { onPointerDown, onKeyDown, onBlur, ref, style, ...handleProps } = props;
  const context = useGridContext(partName);
  const item = useGridItemContext(partName);
  const [element, setElement] = React.useState<HTMLButtonElement | null>(null);
  const composedRef = useComposedRefs(ref, setElement);
  const selectPicked = React.useCallback(
    (frame: GridFrame) => frame.pickedUp?.value === item.value && frame.pickedUp.kind === kind,
    [item.value, kind],
  );
  const picked = useStoreSelector(context.frame, selectPicked);
  // The handle the keyboard used to move the item into this grid from another takes focus again.
  React.useLayoutEffect(() => {
    if (element && takeArrivalFocus(item.value, kind)) {
      element.focus();
    }
  }, [element, item.value, kind]);
  return {
    "type": "button",
    "aria-pressed": picked,
    "data-state": picked ? "picked" : "idle",
    ...handleProps,
    "ref": composedRef,
    "onPointerDown": composeEventHandlers(onPointerDown, (event) => {
      if (isPrimaryPointerDown(event)) {
        context.beginPointer(kind, item.value, event, edge);
      }
    }),
    "onKeyDown": composeEventHandlers(onKeyDown, event => context.handleKey(kind, item.value, event, edge)),
    "onBlur": composeEventHandlers(onBlur, () => context.handleBlur(item.value)),
    // The handle takes touch drags itself instead of scrolling the page.
    "style": { touchAction: "none", ...style },
  };
}

export interface GridDragHandleProps extends HandleProps {}

/** Moves its item: drag it, or press Space or Enter and then the arrow keys. */
function GridDragHandle(props: GridDragHandleProps): React.ReactNode {
  return <Primitive.button {...useHandleProps("move", DRAG_HANDLE_NAME, props, "bottom-end")} />;
}

export interface GridResizeHandleProps extends HandleProps {
  /** The side or corner of the item the handle moves; the opposite one stays. @default "bottom-end" */
  edge?: GridEdge;
}

/** Resizes its item from an edge or corner: drag it, or press Space or Enter and then the arrow keys. */
function GridResizeHandle(props: GridResizeHandleProps): React.ReactNode {
  const { edge = "bottom-end", ...handleProps } = props;
  return <Primitive.button data-edge={edge} {...useHandleProps("resize", RESIZE_HANDLE_NAME, handleProps, edge)} />;
}

export interface GridPlaceholderProps extends PrimitiveProps<"div"> {}

/** Shows where a dragged, resized or arriving item would land; renders nothing otherwise. */
function selectPlaceholder(frame: GridFrame): GridCell | null {
  return frame.placeholder;
}

function samePlaceholder(a: GridCell | null, b: GridCell | null): boolean {
  return a === b || (a !== null && b !== null && sameCell(a, b));
}

function GridPlaceholder(props: GridPlaceholderProps): React.ReactNode {
  const { style, ...placeholderProps } = props;
  const { frame } = useGridContext(PLACEHOLDER_NAME);
  const placeholder = useStoreSelector(frame, selectPlaceholder, samePlaceholder);
  if (!placeholder) {
    return null;
  }
  return (
    <Primitive.div
      aria-hidden
      {...placeholderProps}
      style={{
        gridColumn: `${placeholder.x + 1} / span ${placeholder.w}`,
        gridRow: `${placeholder.y + 1} / span ${placeholder.h}`,
        pointerEvents: "none",
        ...style,
      }}
    />
  );
}

export {
  GridDragHandle as DragHandle,
  Grid,
  GridDragHandle,
  GridItem,
  GridPlaceholder,
  GridResizeHandle,
  GridItem as Item,
  GridPlaceholder as Placeholder,
  GridResizeHandle as ResizeHandle,
  Grid as Root,
};
