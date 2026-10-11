"use client";

import type { PrimitiveProps } from "../shared/primitive";
import type { Point } from "../shared/types";
import type { GridContextValue, GridItemContextValue, InteractionKind, ItemEntry, ItemView } from "./context";
import type { Slide } from "./motion";
import type {
  GridCell,
  GridCollision,
  GridCompaction,
  GridDerivation,
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
import { Primitive } from "../shared/primitive";
import { measureElementSize, observeElementSize } from "../shared/resize-observer";
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
import { bottomOf, resolveMove, resolveResize } from "./layout";
import { slide, startAutoScroll } from "./motion";
import { gridStyles } from "./styles";

const DEFAULT_BREAKPOINTS: Readonly<Record<string, number>> = { [DEFAULT_BREAKPOINT]: 0 };
const NO_LAYOUTS: GridLayouts = {};
const DEFAULT_DROP_SIZE = { w: 1, h: 1 };

/** Pointer travel in pixels before a press on a handle becomes a drag, so a click stays a click. */
const DRAG_THRESHOLD = 3;

interface Interaction {
  kind: InteractionKind;
  value: string;
  input: "pointer" | "keyboard";
  breakpoint: string;
  /** The layout when the item was picked up; every preview is worked out from it. */
  snapshot: readonly GridItemLayout[];
  /** The latest layout the rules allowed. */
  preview: readonly GridItemLayout[];
  /** Pointer moves: how far the item is drawn from its cell. */
  offset: Point | null;
  /** Pointer resizes: the size the item is drawn at. */
  size: { width: number; height: number } | null;
  /** Keyboard: the cell the keys reached. */
  target: GridCell;
}

interface ExternalDrop {
  breakpoint: string;
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

/**
 * Moves or resizes an item one step in a direction, going further when a step changes nothing,
 * such as a move onto an item that only swaps once passed halfway.
 */
function advance(
  kind: InteractionKind,
  snapshot: readonly GridItemLayout[],
  value: string,
  start: GridCell,
  unit: Point,
  rules: GridRules,
  shown: readonly GridItemLayout[],
): { target: GridCell; preview: GridItemLayout[] } | null {
  const bottom = bottomOf(snapshot);
  for (let step = 1; step <= Math.max(rules.columns, bottom + 1); step++) {
    const target = kind === "move"
      ? { ...start, x: start.x + unit.x * step, y: start.y + unit.y * step }
      : { ...start, w: start.w + unit.x * step, h: start.h + unit.y * step };
    const outside = kind === "move"
      ? target.x < 0 || target.x + target.w > rules.columns || target.y < 0 || target.y > bottom
      : target.w < 1 || target.x + target.w > rules.columns || target.h < 1 || target.y + target.h > bottom + 1;
    if (outside) {
      return null;
    }
    const preview = kind === "move" ? resolveMove(snapshot, value, target, rules) : resolveResize(snapshot, value, target, rules);
    if (preview && !sameLayout(preview, shown)) {
      return { target, preview };
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
  /** Called when the user moved or resized an item, with every layout. */
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
  const [items, setItems] = React.useState<readonly ItemEntry[]>([]);
  const [mounted, setMounted] = React.useState(false);
  const [width, setWidth] = React.useState<number | null>(null);
  const [interaction, setInteraction] = React.useState<Interaction | null>(null);
  const interactionRef = React.useRef<Interaction | null>(null);
  const [drop, setDrop] = React.useState<ExternalDrop | null>(null);
  const releaseRef = React.useRef<Release | null>(null);
  const labelsRef = React.useRef(new Map<string, string>());

  // Event handlers read the interaction before React renders it.
  const applyInteraction = React.useCallback((next: Interaction | null) => {
    interactionRef.current = next;
    setInteraction(next);
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
  const commit = useStableCallback((breakpoint: string, layout: readonly GridItemLayout[], change: Omit<GridLayoutChange, "breakpoint">) => {
    const next: GridLayouts = { ...layoutsRef.current, [breakpoint]: layout.map(item => ({ ...item })) };
    layoutsRef.current = next;
    setLayouts(next);
    handleLayoutsChange(next, { breakpoint, ...change });
  });

  const say = (message: string): void => {
    if (canvas) {
      announce(message, canvas.ownerDocument);
    }
  };
  const labelOf = (value: string): string => labelsRef.current.get(value) ?? value;

  const beginPointer = useStableCallback((kind: InteractionKind, value: string, event: React.PointerEvent<HTMLElement>) => {
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
    // Where the pointer holds the item: by its top left corner to move it, by its far corner,
    // the bottom of the inline end, to resize it.
    const hold = {
      x: event.clientX - (kind === "resize" && !geometry.rtl ? itemRect.right : itemRect.left),
      y: event.clientY - (kind === "resize" ? itemRect.bottom : itemRect.top),
    };
    const snapshot = committed;
    let pointer = { x: event.clientX, y: event.clientY };

    const update = (): void => {
      const current = interactionRef.current;
      if (!current) {
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const corner = { x: pointer.x - hold.x - rect.left, y: pointer.y - hold.y - rect.top };
      if (kind === "move") {
        const column = geometry.columnWidth + geometry.gap;
        const x = Math.round((geometry.rtl ? geometry.width - corner.x - start.width : corner.x) / column);
        const y = Math.round(corner.y / (geometry.rowHeight + geometry.gap));
        const preview = resolveMove(snapshot, value, { x, y }, rules) ?? current.preview;
        renderSynchronously(() => applyInteraction({ ...current, preview, offset: { x: corner.x - start.x, y: corner.y - start.y } }));
        return;
      }
      const drawn = {
        width: Math.max(geometry.columnWidth, geometry.rtl ? start.x + start.width - corner.x : corner.x - start.x),
        height: Math.max(geometry.rowHeight, corner.y - start.y),
      };
      const size = {
        w: Math.round((drawn.width + geometry.gap) / (geometry.columnWidth + geometry.gap)),
        h: Math.round((drawn.height + geometry.gap) / (geometry.rowHeight + geometry.gap)),
      };
      const preview = resolveResize(snapshot, value, size, rules) ?? current.preview;
      renderSynchronously(() => applyInteraction({ ...current, preview, size: drawn }));
    };

    const autoScroll = startAutoScroll(canvas, update);
    const finish = (keep: boolean): void => {
      autoScroll.stop();
      const current = interactionRef.current;
      if (!current) {
        return;
      }
      if (kind === "move" && current.offset) {
        releaseRef.current = { value, from: { x: start.x + current.offset.x, y: start.y + current.offset.y } };
      }
      renderSynchronously(() => {
        applyInteraction(null);
        if (keep && !sameLayout(current.preview, snapshot)) {
          commit(breakpoint, current.preview, { value, reason: kind });
        }
      });
    };
    startDragSession(event.nativeEvent, {
      threshold: DRAG_THRESHOLD,
      cursor: kind === "move" ? "grabbing" : geometry.rtl ? "nesw-resize" : "nwse-resize",
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
          offset: kind === "move" ? { x: 0, y: 0 } : null,
          size: kind === "resize" ? { width: start.width, height: start.height } : null,
          target: origin,
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
    if (keep && !sameLayout(current.preview, current.snapshot)) {
      commit(current.breakpoint, current.preview, { value: current.value, reason: current.kind });
    }
    const cell = cellOf(keep ? current.preview : current.snapshot, current.value)!;
    say(keep
      ? `${labelOf(current.value)} dropped at column ${cell.x + 1}, row ${cell.y + 1}.`
      : `${labelOf(current.value)} put back at column ${cell.x + 1}, row ${cell.y + 1}.`);
  };

  const handleKey = useStableCallback((kind: InteractionKind, value: string, event: React.KeyboardEvent<HTMLElement>) => {
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
      });
      say(kind === "move"
        ? `${labelOf(value)} picked up. Arrow keys move it, Space or Enter drops it, Escape puts it back.`
        : `${labelOf(value)} picked up for resizing. Arrow keys resize it, Space or Enter drops it, Escape puts it back.`);
      return;
    }
    if (confirm || event.key === "Escape") {
      event.preventDefault();
      finishKeyboard(confirm);
      return;
    }
    const unit = canvas ? arrowStep(event.key, getOwnerWindow(canvas).getComputedStyle(canvas).direction === "rtl") : null;
    if (!unit) {
      return;
    }
    event.preventDefault();
    const next = advance(kind, current.snapshot, value, current.target, unit, rulesFor(current.breakpoint), current.preview);
    if (!next) {
      say(`${labelOf(value)} cannot go further that way.`);
      return;
    }
    applyInteraction({ ...current, target: next.target, preview: next.preview });
    const cell = cellOf(next.preview, value)!;
    say(kind === "move"
      ? `${labelOf(value)} moved to column ${cell.x + 1}, row ${cell.y + 1}.`
      : `${labelOf(value)} resized to ${cell.w} columns by ${cell.h} rows.`);
  });

  const handleBlur = useStableCallback((value: string) => {
    const current = interactionRef.current;
    if (current?.input === "keyboard" && current.value === value) {
      finishKeyboard(false);
    }
  });

  const step = React.useCallback((kind: InteractionKind, value: string, unit: Point): boolean => {
    const origin = cellOf(committed, value);
    if (!active || !committed || !origin || interactionRef.current) {
      return false;
    }
    const next = advance(kind, committed, value, origin, unit, rulesFor(active.name), committed);
    if (!next) {
      return false;
    }
    commit(active.name, next.preview, { value, reason: kind });
    return true;
  }, [active, committed, rulesFor, commit]);

  const registerItem = React.useCallback((entry: ItemEntry) => {
    setItems((current) => {
      if (current.some(existing => existing.value === entry.value)) {
        throw new Error(`${ROOT_NAME} already has an item with the value "${entry.value}".`);
      }
      return sortByDocumentPosition([...current, entry]);
    });
    labelsRef.current.set(entry.value, entry.label);
    return () => setItems(current => current.filter(existing => existing !== entry));
  }, []);

  const preview = interaction?.preview ?? drop?.preview ?? null;
  const itemView = React.useCallback((value: string): ItemView => {
    const isStatic = cellOf(committed, value)?.static === true;
    if (interaction?.value === value) {
      const state = interaction.kind === "move" ? "dragging" : "resizing";
      if (interaction.input === "keyboard") {
        return { state, isStatic, cell: cellOf(interaction.preview, value) ?? null, offset: null, size: null };
      }
      // A pointer holds the item at its old cell, drawn where the pointer has it.
      return { state, isStatic, cell: cellOf(interaction.snapshot, value) ?? null, offset: interaction.offset, size: interaction.size };
    }
    return { state: "idle", isStatic, cell: preview ? cellOf(preview, value) ?? null : null, offset: null, size: null };
  }, [committed, interaction, preview]);

  // Items slide from where they were shown to where they are shown now; changes of breakpoint
  // place them at once.
  const shownRef = React.useRef<{ breakpoint: string | null; cells: Map<string, GridCell> }>({ breakpoint: null, cells: new Map() });
  React.useLayoutEffect(() => {
    const release = releaseRef.current;
    releaseRef.current = null;
    if (!canvas || !active || !committed) {
      return;
    }
    const cells = new Map<string, GridCell>();
    for (const entry of items) {
      const cell = itemView(entry.value).cell ?? cellOf(committed, entry.value);
      if (cell) {
        cells.set(entry.value, cell);
      }
    }
    const previous = shownRef.current;
    shownRef.current = { breakpoint: active.name, cells };
    if (!animate || previous.breakpoint !== active.name || prefersReducedMotion(canvas)) {
      return;
    }
    const geometry = measureGeometry(canvas, active.columns, rowHeight, gap);
    const slides: Slide[] = [];
    for (const entry of items) {
      const cell = cells.get(entry.value);
      if (!cell || (interaction?.input === "pointer" && interaction.value === entry.value)) {
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
  });

  const dropHandlers: React.HTMLAttributes<HTMLDivElement> = onDropItem
    ? {
        onDragOver: (event) => {
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
        },
        onDragLeave: (event) => {
          const entered = event.relatedTarget;
          if (!(canvas && entered instanceof getOwnerWindow(canvas).Node && canvas.contains(entered))) {
            setDrop(null);
          }
        },
        onDrop: (event) => {
          if (!drop) {
            return;
          }
          event.preventDefault();
          const { x, y, w, h } = cellOf(drop.preview, DROP_VALUE)!;
          setDrop(null);
          onDropItem({ breakpoint: drop.breakpoint, cell: { x, y, w, h }, layout: drop.preview.filter(item => item.value !== DROP_VALUE) }, event);
        },
      }
    : {};

  const placeholder = interaction?.input === "pointer"
    ? cellOf(interaction.preview, interaction.value) ?? null
    : drop
      ? cellOf(drop.preview, DROP_VALUE) ?? null
      : null;
  const pickedUp = interaction?.input === "keyboard" ? interaction : null;
  const contextValue = React.useMemo((): GridContextValue => ({
    breakpoint: active?.name ?? null,
    columns: active?.columns ?? null,
    layout: preview ?? committed,
    placeholder,
    pickedUp: pickedUp ? { value: pickedUp.value, kind: pickedUp.kind } : null,
    registerItem,
    itemView,
    beginPointer,
    handleKey,
    handleBlur,
    step,
  }), [active, preview, committed, placeholder, pickedUp, registerItem, itemView, beginPointer, handleKey, handleBlur, step]);

  const nonce = React.use(CspContext);
  const css = React.useMemo(
    () => gridStyles({ scope: scopeId, breakpoints, layouts: resolved, rowHeight, gap }),
    [scopeId, breakpoints, resolved, rowHeight, gap],
  );
  return (
    <GridContext value={contextValue}>
      <Primitive.div
        data-xlayout-grid={scopeId}
        data-breakpoint={active?.name}
        data-state={interaction ? (interaction.kind === "move" ? "dragging" : "resizing") : drop ? "dropping" : "idle"}
        {...rootProps}
        ref={composedRef}
        style={style}
      >
        <style nonce={nonce}>{css}</style>
        <div ref={setCanvas} data-xlayout-grid-canvas={scopeId} {...dropHandlers}>
          {children}
        </div>
      </Primitive.div>
    </GridContext>
  );
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
  const view = context.itemView(value);
  const itemContext = React.useMemo((): GridItemContextValue => ({ value, label: name }), [value, name]);
  return (
    <GridItemContext value={itemContext}>
      <Primitive.div
        data-xlayout-grid-item={value}
        data-state={view.state}
        data-static={view.isStatic ? "" : undefined}
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
          ...(view.offset ? { translate: `${view.offset.x}px ${view.offset.y}px` } : null),
          ...(view.size ? { width: view.size.width, height: view.size.height, justifySelf: "start", alignSelf: "start" } : null),
          ...style,
        }}
      />
    </GridItemContext>
  );
}

type HandleProps = PrimitiveProps<"button">;

function useHandleProps(kind: InteractionKind, partName: string, props: HandleProps): HandleProps & { "data-state": "picked" | "idle" } {
  const { onPointerDown, onKeyDown, onBlur, style, ...handleProps } = props;
  const context = useGridContext(partName);
  const item = useGridItemContext(partName);
  const picked = context.pickedUp?.value === item.value && context.pickedUp.kind === kind;
  return {
    "type": "button",
    "aria-pressed": picked,
    "data-state": picked ? "picked" : "idle",
    ...handleProps,
    "onPointerDown": composeEventHandlers(onPointerDown, (event) => {
      if (isPrimaryPointerDown(event)) {
        context.beginPointer(kind, item.value, event);
      }
    }),
    "onKeyDown": composeEventHandlers(onKeyDown, event => context.handleKey(kind, item.value, event)),
    "onBlur": composeEventHandlers(onBlur, () => context.handleBlur(item.value)),
    // The handle takes touch drags itself instead of scrolling the page.
    "style": { touchAction: "none", ...style },
  };
}

export interface GridDragHandleProps extends HandleProps {}

/** Moves its item: drag it, or press Space or Enter and then the arrow keys. */
function GridDragHandle(props: GridDragHandleProps): React.ReactNode {
  return <Primitive.button {...useHandleProps("move", DRAG_HANDLE_NAME, props)} />;
}

export interface GridResizeHandleProps extends HandleProps {}

/** Resizes its item from the far corner: drag it, or press Space or Enter and then the arrow keys. */
function GridResizeHandle(props: GridResizeHandleProps): React.ReactNode {
  return <Primitive.button {...useHandleProps("resize", RESIZE_HANDLE_NAME, props)} />;
}

export interface GridPlaceholderProps extends PrimitiveProps<"div"> {}

/** Shows where a dragged, resized or arriving item would land; renders nothing otherwise. */
function GridPlaceholder(props: GridPlaceholderProps): React.ReactNode {
  const { style, ...placeholderProps } = props;
  const { placeholder } = useGridContext(PLACEHOLDER_NAME);
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
