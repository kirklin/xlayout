"use client";

import type { PrimitiveProps } from "../shared/primitive";
import type { Direction, Orientation, Point } from "../shared/types";
import type { HandleEntry, HandleState, PanelEntry, ResizeState, SplitterContextValue } from "./context";
import type { RegisteredHandle, ResizeLimit, ResizeSession } from "./handle-registry";
import type { PanelSizeProps } from "./layout";
import type {
  LayoutChangeSource,
  LayoutCommitDetails,
  LayoutStorage,
  PanelConstraints,
  PanelResizeBehavior,
  PanelSize,
  ResolvedPanel,
  SizeContext,
  SplitterActions,
  SplitterLayout,
} from "./types";
import { useDirection } from "@radix-ui/react-direction";
import * as React from "react";
import { useComposedRefs } from "../shared/compose-refs";
import { getOwnerWindow, reorderByDocumentPosition, sortByDocumentPosition } from "../shared/dom";
import { holdTouchScrolling, isPrimaryPointerDown, startDragSession } from "../shared/drag";
import { composeEventHandlers } from "../shared/events";
import { renderSynchronously } from "../shared/flush";
import { fuzzyCompare, fuzzyEqual } from "../shared/math";
import { Primitive } from "../shared/primitive";
import { measureElementSize, observeElementSize } from "../shared/resize-observer";
import { DEFAULT_TOUCH_MARGIN, registerTouchReach } from "../shared/touch-reach";
import { useControllableState } from "../shared/use-controllable-state";
import { useStableCallback } from "../shared/use-stable-callback";
import {
  DEFAULT_KEYBOARD_LARGE_STEP,
  DEFAULT_KEYBOARD_STEP,
  EMPTY_SIZE_CONTEXT,
  HANDLE_NAME,
  PANEL_NAME,
  ROOT_NAME,
  TRIGGER_NAME,
} from "./constants";
import { SplitterContext, SplitterPanelContext, useSplitterContext } from "./context";
import { findIntersectingHandles, registerHandle } from "./handle-registry";
import {
  adjustLayoutByDelta,
  computeInitialLayout,
  deriveLayout,
  fitToConstraints,
  getHandleRange,
  isCollapsed,
  isPercentageSize,
  layoutsEqual,
  layoutToRecord,
  normalizeLayout,
  parsePanelSize,
  reconcileLayout,
  resizePanelTo,
  resolvePanel,
  toPercentage,
  usesAbsoluteSizes,
  withoutDisabled,
} from "./layout";
import { readStoredLayout, writeStoredLayout } from "./storage";

interface Snapshot {
  orientation: Orientation;
  direction: Direction;
  resizeMode: "live" | "deferred";
  panels: readonly PanelEntry[];
  resolvedPanels: ResolvedPanel[];
  panelIds: string[];
  constraints: PanelConstraints[];
  sizes: number[];
  handles: readonly HandleEntry[];
  handleStates: ReadonlyMap<string, HandleState>;
  keyboardStep: PanelSize;
  keyboardLargeStep: PanelSize;
  sizeContext: SizeContext;
}

interface RequestedLayout {
  sizes: number[];
  /** Panel space the sizes were requested in. */
  panelSpace: number;
  expandSizes: Record<string, number> | undefined;
}

function measureSizeContext(root: HTMLElement, panels: readonly PanelEntry[], orientation: Orientation): SizeContext {
  const ownerWindow = getOwnerWindow(root);
  const panelSpace = panels.reduce((total, entry) => {
    const size = measureElementSize(entry.element);
    return total + (orientation === "horizontal" ? size.width : size.height);
  }, 0);
  return {
    panelSpace,
    rootFontSize: Number.parseFloat(ownerWindow.getComputedStyle(root.ownerDocument.documentElement).fontSize),
    groupFontSize: Number.parseFloat(ownerWindow.getComputedStyle(root).fontSize),
    viewportWidth: ownerWindow.innerWidth,
    viewportHeight: ownerWindow.innerHeight,
  };
}

function sizeContextsEqual(a: SizeContext, b: SizeContext): boolean {
  return fuzzyEqual(a.panelSpace, b.panelSpace, 3)
    && a.rootFontSize === b.rootFontSize
    && a.groupFontSize === b.groupFontSize
    && a.viewportWidth === b.viewportWidth
    && a.viewportHeight === b.viewportHeight;
}

/**
 * The flex style of a panel before the group measures it, as on the server. Panels without a
 * size grow into the space the others leave. Percentages are bases that give up the handles'
 * space in proportion, so sizes that add up to 100 render as they will once measured.
 */
function getInitialFlexStyle(size: PanelSize | undefined): React.CSSProperties {
  if (size === undefined) {
    return { flexGrow: 1, flexShrink: 1, flexBasis: 0 };
  }
  const { value, unit } = parsePanelSize(size);
  if (unit === "%") {
    return { flexGrow: 0, flexShrink: 1, flexBasis: `${value}%` };
  }
  return { flexGrow: 0, flexShrink: 0, flexBasis: `${value}${unit}` };
}

function sumThrough(sizes: readonly number[], index: number): number {
  return sizes.slice(0, index + 1).reduce((total, size) => total + size, 0);
}

function getResizeCursor(separatorOrientation: Orientation, direction: Direction, limit: ResizeLimit): string {
  if (separatorOrientation === "vertical") {
    if (limit.atEnd) {
      return direction === "rtl" ? "e-resize" : "w-resize";
    }
    if (limit.atStart) {
      return direction === "rtl" ? "w-resize" : "e-resize";
    }
    return "col-resize";
  }
  if (limit.atEnd) {
    return "n-resize";
  }
  if (limit.atStart) {
    return "s-resize";
  }
  return "row-resize";
}

/** Two crossing handles stuck in one direction each can only move diagonally. */
function getCrossingCursor(columnLimit: ResizeLimit, rowLimit: ResizeLimit, direction: Direction): string {
  const columnStuck = columnLimit.atStart || columnLimit.atEnd;
  const rowStuck = rowLimit.atStart || rowLimit.atEnd;
  if (!columnStuck || !rowStuck) {
    return "move";
  }
  const towardStart = columnLimit.atEnd;
  const west = direction === "rtl" ? !towardStart : towardStart;
  const north = rowLimit.atEnd;
  return `${north ? "n" : "s"}${west ? "w" : "e"}-resize`;
}

function precedes(a: Element, b: Element): boolean {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

function hasExactPanels(layout: SplitterLayout | undefined, panelIds: readonly string[]): layout is SplitterLayout {
  return layout !== undefined
    && panelIds.every(id => layout[id] !== undefined)
    && Object.keys(layout).length === panelIds.length;
}

export interface SplitterProps extends Omit<PrimitiveProps<"div">, "dir"> {
  /**
   * `"horizontal"` lays the panels out side by side, `"vertical"` stacks them.
   * @default "horizontal"
   */
  orientation?: Orientation;
  /** Reading direction; inherits from a direction provider when omitted. */
  dir?: Direction;
  /**
   * Panel sizes in percent keyed by panel id, in panel order, when controlled. This is the
   * requested layout: the rendered layout may differ while the group is too small for it.
   */
  layout?: SplitterLayout;
  /**
   * Sizes to start with when uncontrolled; panels missing from it use their own `defaultSize`.
   * The server renders them too, so a layout read from a cookie shows from the first paint.
   */
  defaultLayout?: SplitterLayout;
  /** Called whenever the requested layout changes, including on every pointer move while dragging. */
  onLayoutChange?: (layout: SplitterLayout) => void;
  /** Called when a change is finished: a drag ends, a key is pressed or an action runs. */
  onLayoutCommit?: (layout: SplitterLayout, details: LayoutCommitDetails) => void;
  /**
   * How far one arrow key press moves a handle.
   * @default 5
   */
  keyboardStep?: PanelSize;
  /**
   * How far one arrow key press moves a handle while Shift is held.
   * @default 20
   */
  keyboardLargeStep?: PanelSize;
  /**
   * `"live"` resizes the panels while a handle is dragged; `"deferred"` moves only the
   * handle and resizes the panels when it is released.
   * @default "live"
   */
  resizeMode?: "live" | "deferred";
  /** Prevents resizing with the pointer, the keyboard and triggers. Actions still work. */
  disabled?: boolean;
  /** Persists the layout under this key and restores it on the next visit. */
  storageKey?: string;
  /** Where layouts are persisted. Defaults to `localStorage`. */
  storage?: LayoutStorage;
  /** Receives functions to read and change the layout from outside. */
  actionsRef?: React.Ref<SplitterActions>;
}

function Splitter(props: SplitterProps): React.ReactNode {
  const {
    orientation = "horizontal",
    dir,
    layout: layoutProp,
    defaultLayout,
    onLayoutChange,
    onLayoutCommit,
    keyboardStep = DEFAULT_KEYBOARD_STEP,
    keyboardLargeStep = DEFAULT_KEYBOARD_LARGE_STEP,
    resizeMode = "live",
    disabled = false,
    storageKey,
    storage,
    actionsRef,
    ref,
    style,
    ...rootProps
  } = props;
  const direction = useDirection(dir);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [rootElement, setRootElement] = React.useState<HTMLDivElement | null>(null);
  const composedRef = useComposedRefs(ref, rootRef, setRootElement);
  const [panels, setPanels] = React.useState<readonly PanelEntry[]>([]);
  const [handles, setHandles] = React.useState<readonly HandleEntry[]>([]);
  const [sizeContext, setSizeContext] = React.useState(EMPTY_SIZE_CONTEXT);
  const [resizing, setResizing] = React.useState<ResizeState | null>(null);
  const [requestedSpace, setRequestedSpace] = React.useState(0);
  const expandSizesRef = React.useRef(new Map<string, number>());

  const handleLayoutChange = useStableCallback(onLayoutChange);
  const handleLayoutCommit = useStableCallback(onLayoutCommit);
  const [requested, setRequested] = useControllableState<SplitterLayout | undefined>({
    prop: layoutProp,
    defaultProp: undefined,
    onChange: (layout) => {
      if (layout) {
        handleLayoutChange(layout);
      }
    },
    caller: ROOT_NAME,
  });

  const needsSpace = panels.some(entry => usesAbsoluteSizes(entry.sizeProps) || entry.sizeProps.resizeBehavior === "fixed");
  // Absolute sizes mean nothing until the group has a size; panels keep their initial
  // flex styles until then instead of committing a layout built on a size of zero.
  const measured = !needsSpace || sizeContext.panelSpace > 0;

  const resolvedPanels = React.useMemo(
    () => panels.map(entry => resolvePanel(entry.sizeProps, sizeContext)),
    [panels, sizeContext],
  );
  const panelIds = React.useMemo(() => resolvedPanels.map(panel => panel.id), [resolvedPanels]);
  const constraints = React.useMemo(() => resolvedPanels.map(panel => panel.constraints), [resolvedPanels]);

  if (resolvedPanels.length > 0 && resolvedPanels.every(panel => panel.resizeBehavior === "fixed")) {
    throw new Error(`${ROOT_NAME} needs at least one panel with resizeBehavior "proportional" to absorb size changes.`);
  }

  // The requested layout for the current panels: the state when it fits them, otherwise
  // a stored layout, the previous layout fitted to the new panels, or the defaults.
  const requestedLayout = React.useMemo((): RequestedLayout | null => {
    if (resolvedPanels.length === 0 || !measured) {
      return null;
    }
    if (hasExactPanels(requested, panelIds)) {
      return { sizes: panelIds.map(id => requested[id]!), panelSpace: requestedSpace || sizeContext.panelSpace, expandSizes: undefined };
    }
    if (storageKey) {
      const stored = readStoredLayout(storage ?? window.localStorage, storageKey, panelIds);
      if (stored && hasExactPanels(stored.layout, panelIds)) {
        return { sizes: panelIds.map(id => stored.layout[id]!), panelSpace: stored.panelSpace, expandSizes: stored.expandSizes };
      }
    }
    if (requested && Object.keys(requested).length > 0) {
      return { sizes: reconcileLayout(Object.keys(requested), Object.values(requested), resolvedPanels), panelSpace: sizeContext.panelSpace, expandSizes: undefined };
    }
    return { sizes: computeInitialLayout(resolvedPanels, defaultLayout), panelSpace: sizeContext.panelSpace, expandSizes: undefined };
  }, [resolvedPanels, measured, panelIds, requested, requestedSpace, sizeContext.panelSpace, storageKey, storage, defaultLayout]);

  const sizes = React.useMemo(
    () => (requestedLayout ? deriveLayout(requestedLayout.sizes, resolvedPanels, requestedLayout.panelSpace, sizeContext.panelSpace) : []),
    [requestedLayout, resolvedPanels, sizeContext.panelSpace],
  );

  // The last layout this component requested, to tell it apart from layouts a controlling
  // parent sets, which are meant for the panel space of the moment they are set.
  const emittedRef = React.useRef<SplitterLayout | undefined>(undefined);

  // A layout computed for a new set of panels becomes the requested layout.
  React.useLayoutEffect(() => {
    if (!requestedLayout || hasExactPanels(requested, panelIds)) {
      return;
    }
    if (requestedLayout.expandSizes) {
      expandSizesRef.current = new Map(Object.entries(requestedLayout.expandSizes));
    }
    const record = layoutToRecord(panelIds, requestedLayout.sizes);
    emittedRef.current = record;
    // The layout is already rendered from the same values; storing it changes nothing on screen.
    // eslint-disable-next-line react/set-state-in-effect
    setRequestedSpace(requestedLayout.panelSpace);
    setRequested(record);
  }, [requestedLayout, requested, panelIds, setRequested]);

  const panelStates = React.useMemo(() => new Map(sizes.length === 0
    ? []
    : panelIds.map((id, index) => [id, {
        size: sizes[index]!,
        collapsed: isCollapsed(sizes[index]!, constraints[index]!),
        constraints: constraints[index]!,
      }])), [panelIds, sizes, constraints]);

  const handleStates = React.useMemo(() => {
    const states = new Map<string, HandleState>();
    if (sizes.length === 0) {
      return states;
    }
    for (const handle of handles) {
      const primaryIndex = panels.filter(panel => precedes(panel.element, handle.element)).length - 1;
      if (primaryIndex < 0 || primaryIndex >= panels.length - 1) {
        throw new Error(`${HANDLE_NAME} must be placed between two panels of the same ${ROOT_NAME}.`);
      }
      const range = getHandleRange(sizes, constraints, primaryIndex);
      states.set(handle.id, {
        primaryIndex,
        primaryId: panelIds[primaryIndex]!,
        valueNow: sizes[primaryIndex]!,
        valueMin: range.min,
        valueMax: range.max,
      });
    }
    return states;
  }, [handles, panels, panelIds, constraints, sizes]);

  const snapshot: Snapshot = {
    orientation,
    direction,
    resizeMode,
    panels,
    resolvedPanels,
    panelIds,
    constraints,
    sizes,
    handles,
    handleStates,
    keyboardStep,
    keyboardLargeStep,
    sizeContext,
  };
  const snapshotRef = React.useRef(snapshot);
  React.useLayoutEffect(() => {
    snapshotRef.current = snapshot;
  });

  const collapsedRef = React.useRef(new Map<string, boolean>());
  React.useLayoutEffect(() => {
    const previous = collapsedRef.current;
    const next = new Map<string, boolean>();
    panels.forEach((entry, index) => {
      const size = sizes[index];
      if (size === undefined) {
        return;
      }
      const collapsed = isCollapsed(size, constraints[index]!);
      next.set(entry.id, collapsed);
      const wasCollapsed = previous.get(entry.id);
      if (wasCollapsed !== undefined && wasCollapsed !== collapsed) {
        entry.onCollapsedChange(collapsed);
      }
      // Sizes passed through while dragging are not worth restoring later.
      if (!collapsed && resizing === null) {
        expandSizesRef.current.set(entry.id, size);
      }
    });
    collapsedRef.current = next;
  }, [panels, sizes, constraints, resizing]);

  React.useLayoutEffect(() => {
    if (!rootElement || !needsSpace || panels.length === 0) {
      return;
    }
    const ownerWindow = getOwnerWindow(rootElement);
    const measure = (): void => {
      const next = measureSizeContext(rootElement, panels, orientation);
      // Measuring in a layout effect converts absolute sizes before the first paint.
      // eslint-disable-next-line react/set-state-in-effect
      setSizeContext(current => (sizeContextsEqual(current, next) ? current : next));
    };
    measure();
    const stopObserving = panels.map(entry => observeElementSize(entry.element, measure));
    ownerWindow.addEventListener("resize", measure);
    return () => {
      stopObserving.forEach(stop => stop());
      ownerWindow.removeEventListener("resize", measure);
    };
  }, [rootElement, needsSpace, panels, orientation]);

  // Panels and handles keep their order when React moves their elements.
  React.useEffect(() => {
    if (!rootElement) {
      return;
    }
    const observer = new MutationObserver(() => {
      const current = snapshotRef.current;
      const reorderedPanels = reorderByDocumentPosition(current.panels);
      if (reorderedPanels !== current.panels) {
        setPanels(reorderedPanels);
      }
      const reorderedHandles = reorderByDocumentPosition(current.handles);
      if (reorderedHandles !== current.handles) {
        setHandles(reorderedHandles);
      }
    });
    observer.observe(rootElement, { childList: true });
    return () => observer.disconnect();
  }, [rootElement]);

  const assertDirectChild = React.useCallback((element: HTMLElement, partName: string) => {
    const root = rootRef.current;
    if (root && element.parentElement !== root) {
      throw new Error(`${partName} must be a direct child of the ${ROOT_NAME} element so flex layout can size it.`);
    }
  }, []);

  const registerPanel = React.useCallback((entry: PanelEntry) => {
    assertDirectChild(entry.element, PANEL_NAME);
    setPanels((current) => {
      if (current.some(existing => existing.id === entry.id)) {
        throw new Error(`${ROOT_NAME} already has a panel with the id "${entry.id}".`);
      }
      return sortByDocumentPosition([...current, entry]);
    });
    return () => setPanels(current => current.filter(existing => existing !== entry));
  }, [assertDirectChild]);

  const registerHandleEntry = React.useCallback((entry: HandleEntry) => {
    assertDirectChild(entry.element, HANDLE_NAME);
    setHandles(current => sortByDocumentPosition([...current, entry]));
    return () => setHandles(current => current.filter(existing => existing !== entry));
  }, [assertDirectChild]);

  const measurePanelSpace = React.useCallback((): number => {
    const current = snapshotRef.current;
    const isHorizontal = current.orientation === "horizontal";
    return current.panels.reduce((total, entry) => {
      const size = measureElementSize(entry.element);
      return total + (isHorizontal ? size.width : size.height);
    }, 0);
  }, []);

  const getCurrentSizeContext = React.useCallback((): SizeContext => {
    const current = snapshotRef.current;
    const root = rootRef.current;
    if (!root) {
      return current.sizeContext;
    }
    return measureSizeContext(root, current.panels, current.orientation);
  }, []);

  React.useLayoutEffect(() => {
    if (requested && requested !== emittedRef.current && hasExactPanels(requested, panelIds)) {
      emittedRef.current = requested;

      setRequestedSpace(measurePanelSpace());
    }
  }, [requested, panelIds, measurePanelSpace]);

  const applySizes = React.useCallback((next: number[]) => {
    const current = snapshotRef.current;
    if (layoutsEqual(next, current.sizes)) {
      return;
    }
    const record = layoutToRecord(current.panelIds, next);
    emittedRef.current = record;
    setRequestedSpace(measurePanelSpace());
    setRequested(record);
  }, [measurePanelSpace, setRequested]);

  const commitLayout = React.useCallback((next: number[], source: LayoutChangeSource) => {
    const current = snapshotRef.current;
    const record = layoutToRecord(current.panelIds, next);
    next.forEach((size, index) => {
      if (!isCollapsed(size, current.constraints[index]!)) {
        expandSizesRef.current.set(current.panelIds[index]!, size);
      }
    });
    if (storageKey) {
      writeStoredLayout(storage ?? window.localStorage, storageKey, current.panelIds, {
        layout: record,
        panelSpace: measurePanelSpace(),
        expandSizes: Object.fromEntries(expandSizesRef.current),
      });
    }
    handleLayoutCommit(record, { source });
  }, [handleLayoutCommit, measurePanelSpace, storage, storageKey]);

  const getExpandTarget = React.useCallback((index: number): number => {
    const panel = snapshotRef.current.resolvedPanels[index]!;
    const target = expandSizesRef.current.get(panel.id) ?? panel.defaultSize ?? panel.constraints.minSize;
    return Math.max(panel.constraints.minSize, fitToConstraints(target, panel.constraints));
  }, []);

  const beginResize = React.useCallback((handleId: string, origin: Point): ResizeSession => {
    const current = snapshotRef.current;
    const handle = current.handleStates.get(handleId);
    if (!handle) {
      throw new Error(`${HANDLE_NAME} "${handleId}" is not registered with its ${ROOT_NAME}.`);
    }
    const initial = current.sizes;
    const isHorizontal = current.orientation === "horizontal";
    const panelSpace = current.panels.reduce((total, entry) => {
      const rect = entry.element.getBoundingClientRect();
      return total + (isHorizontal ? rect.width : rect.height);
    }, 0);
    const sign = isHorizontal && current.direction === "rtl" ? -1 : 1;
    const deferred = current.resizeMode === "deferred";
    let latest = initial;
    setResizing({ handleId, limit: { atStart: false, atEnd: false }, previewOffset: 0 });

    return {
      move: (point) => {
        const pixels = (isHorizontal ? point.x - origin.x : point.y - origin.y) * sign;
        const delta = panelSpace > 0 ? (pixels / panelSpace) * 100 : 0;
        latest = adjustLayoutByDelta({
          layout: initial,
          constraints: current.constraints,
          handleIndex: handle.primaryIndex,
          delta,
          trigger: "pointer",
        });
        const achieved = sumThrough(latest, handle.primaryIndex) - sumThrough(initial, handle.primaryIndex);
        const limit = {
          atStart: delta < 0 && fuzzyCompare(achieved, delta, 2) > 0,
          atEnd: delta > 0 && fuzzyCompare(achieved, delta, 2) < 0,
        };
        const previewOffset = deferred ? (achieved / 100) * panelSpace * sign : 0;
        setResizing(state => (state && state.handleId === handleId
          && state.limit.atStart === limit.atStart && state.limit.atEnd === limit.atEnd
          && fuzzyEqual(state.previewOffset, previewOffset, 3)
          ? state
          : { handleId, limit, previewOffset }));
        if (!deferred) {
          applySizes(latest);
        }
        return limit;
      },
      commit: () => {
        setResizing(null);
        if (!layoutsEqual(latest, initial)) {
          applySizes(latest);
          commitLayout(latest, "pointer");
        }
      },
      cancel: () => {
        setResizing(null);
        if (!deferred) {
          applySizes(initial);
        }
      },
    };
  }, [applySizes, commitLayout]);

  const resizeWithKeyboard = React.useCallback((handleId: string, event: React.KeyboardEvent): boolean => {
    const current = snapshotRef.current;
    const handle = current.handleStates.get(handleId);
    if (!handle) {
      return false;
    }
    if (event.key === "F6") {
      const ids = current.handles.map(entry => entry.id);
      const index = ids.indexOf(handleId);
      const nextIndex = (index + (event.shiftKey ? -1 : 1) + ids.length) % ids.length;
      current.handles[nextIndex]!.element.focus({ preventScroll: true });
      return true;
    }
    const { primaryIndex } = handle;
    const primary = current.constraints[primaryIndex]!;
    const primarySize = current.sizes[primaryIndex]!;
    const isHorizontal = current.orientation === "horizontal";
    const increaseKey = isHorizontal ? (current.direction === "rtl" ? "ArrowLeft" : "ArrowRight") : "ArrowDown";
    const decreaseKey = isHorizontal ? (current.direction === "rtl" ? "ArrowRight" : "ArrowLeft") : "ArrowUp";
    const getStep = (): number => {
      const step = event.shiftKey ? current.keyboardLargeStep : current.keyboardStep;
      return toPercentage(step, isPercentageSize(step) ? current.sizeContext : getCurrentSizeContext());
    };

    let delta: number;
    switch (event.key) {
      case increaseKey: {
        delta = getStep();
        break;
      }
      case decreaseKey: {
        delta = -getStep();
        break;
      }
      case "Home": {
        delta = -100;
        break;
      }
      case "End": {
        delta = 100;
        break;
      }
      case "Enter": {
        if (!primary.collapsible) {
          return false;
        }
        delta = isCollapsed(primarySize, primary)
          ? getExpandTarget(primaryIndex) - primarySize
          : primary.collapsedSize - primarySize;
        break;
      }
      default: {
        return false;
      }
    }

    const next = adjustLayoutByDelta({
      layout: current.sizes,
      constraints: current.constraints,
      handleIndex: primaryIndex,
      delta,
      trigger: "keyboard",
    });
    if (!layoutsEqual(next, current.sizes)) {
      applySizes(next);
      commitLayout(next, "keyboard");
    }
    return true;
  }, [applySizes, commitLayout, getCurrentSizeContext, getExpandTarget]);

  const resetHandle = React.useCallback((handleId: string) => {
    const current = snapshotRef.current;
    const handle = current.handleStates.get(handleId);
    if (!handle) {
      return;
    }
    const { primaryIndex } = handle;
    const primaryDefault = current.resolvedPanels[primaryIndex]!.defaultSize;
    const secondaryDefault = current.resolvedPanels[primaryIndex + 1]!.defaultSize;
    let delta: number;
    if (primaryDefault !== undefined) {
      delta = primaryDefault - current.sizes[primaryIndex]!;
    } else if (secondaryDefault !== undefined) {
      delta = current.sizes[primaryIndex + 1]! - secondaryDefault;
    } else {
      return;
    }
    const next = adjustLayoutByDelta({
      layout: current.sizes,
      constraints: current.constraints,
      handleIndex: primaryIndex,
      delta,
      trigger: "pointer",
    });
    if (!layoutsEqual(next, current.sizes)) {
      applySizes(next);
      commitLayout(next, "pointer");
    }
  }, [applySizes, commitLayout]);

  const actions = React.useMemo((): SplitterActions => {
    const indexOf = (panelId: string): number => {
      const index = snapshotRef.current.panelIds.indexOf(panelId);
      if (index < 0) {
        throw new Error(`${ROOT_NAME} has no panel with the id "${panelId}".`);
      }
      return index;
    };
    const update = (next: number[]): void => {
      if (!layoutsEqual(next, snapshotRef.current.sizes)) {
        applySizes(next);
        commitLayout(next, "imperative");
      }
    };
    return {
      getLayout: () => layoutToRecord(snapshotRef.current.panelIds, snapshotRef.current.sizes),
      setLayout: (layout) => {
        const current = snapshotRef.current;
        if (!hasExactPanels(layout, current.panelIds)) {
          throw new Error(`${ROOT_NAME} layouts need a size for exactly these panels: ${current.panelIds.join(", ")}.`);
        }
        const values = current.panelIds.map(id => layout[id]!);
        const total = values.reduce((sum, size) => sum + size, 0);
        if (!fuzzyEqual(total, 100, 2)) {
          throw new RangeError(`${ROOT_NAME} layout sizes must add up to 100, not ${total}.`);
        }
        update(normalizeLayout(values, withoutDisabled(current.constraints)));
      },
      reset: () => {
        const current = snapshotRef.current;
        update(computeInitialLayout(current.resolvedPanels, undefined));
      },
      resize: (panelId, size) => {
        const index = indexOf(panelId);
        const current = snapshotRef.current;
        const constraints = withoutDisabled(current.constraints);
        const context = isPercentageSize(size) ? current.sizeContext : getCurrentSizeContext();
        const target = fitToConstraints(toPercentage(size, context), constraints[index]!);
        update(resizePanelTo(current.sizes, constraints, index, target));
      },
      collapse: (panelId) => {
        const index = indexOf(panelId);
        const current = snapshotRef.current;
        const panel = current.constraints[index]!;
        if (!panel.collapsible) {
          throw new Error(`Panel "${panelId}" is not collapsible.`);
        }
        update(resizePanelTo(current.sizes, withoutDisabled(current.constraints), index, panel.collapsedSize));
      },
      expand: (panelId) => {
        const index = indexOf(panelId);
        const current = snapshotRef.current;
        if (!isCollapsed(current.sizes[index]!, current.constraints[index]!)) {
          return;
        }
        update(resizePanelTo(current.sizes, withoutDisabled(current.constraints), index, getExpandTarget(index)));
      },
      isCollapsed: (panelId) => {
        const index = indexOf(panelId);
        const current = snapshotRef.current;
        return isCollapsed(current.sizes[index]!, current.constraints[index]!);
      },
      getPanelSize: (panelId) => {
        const index = indexOf(panelId);
        const percentage = snapshotRef.current.sizes[index]!;
        return { percentage, pixels: (percentage / 100) * measurePanelSpace() };
      },
    };
  }, [applySizes, commitLayout, getCurrentSizeContext, getExpandTarget, measurePanelSpace]);

  React.useImperativeHandle(actionsRef, () => actions, [actions]);

  const contextValue = React.useMemo((): SplitterContextValue => ({
    orientation,
    direction,
    disabled,
    resizeMode,
    resizing,
    panelStates,
    initialLayout: requested ?? defaultLayout,
    handleStates,
    registerPanel,
    registerHandle: registerHandleEntry,
    beginResize,
    resizeWithKeyboard,
    resetHandle,
    actions,
  }), [orientation, direction, disabled, resizeMode, resizing, panelStates, requested, defaultLayout, handleStates, registerPanel, registerHandleEntry, beginResize, resizeWithKeyboard, resetHandle, actions]);

  return (
    <SplitterContext value={contextValue}>
      <Primitive.div
        dir={direction}
        data-orientation={orientation}
        data-resizing={resizing === null ? undefined : ""}
        data-disabled={disabled ? "" : undefined}
        {...rootProps}
        ref={composedRef}
        style={{
          display: "flex",
          flexDirection: orientation === "horizontal" ? "row" : "column",
          flexWrap: "nowrap",
          overflow: "hidden",
          ...style,
        }}
      />
    </SplitterContext>
  );
}

export interface SplitterPanelProps extends PrimitiveProps<"div"> {
  /** Identifies the panel in layouts and in storage. Also used as the element id. */
  id?: string;
  /** Size before anyone resizes the panel. Panels without one share the remaining space. */
  defaultSize?: PanelSize;
  /** @default 0 */
  minSize?: PanelSize;
  /** @default 100 */
  maxSize?: PanelSize;
  /** Lets the panel collapse to `collapsedSize` when resized below its minimum. */
  collapsible?: boolean;
  /** @default 0 */
  collapsedSize?: PanelSize;
  /**
   * How far past its minimum a drag must go before the panel collapses, and past its
   * collapsed size before it expands. Defaults to half the distance between the two.
   */
  collapseThreshold?: PanelSize;
  /** Keeps the panel's size while handles are dragged or moved with the keyboard. */
  disabled?: boolean;
  /**
   * How the panel reacts when the group changes size.
   * @default "proportional"
   */
  resizeBehavior?: PanelResizeBehavior;
  onCollapsedChange?: (collapsed: boolean) => void;
}

function SplitterPanel(props: SplitterPanelProps): React.ReactNode {
  const {
    id: idProp,
    defaultSize,
    minSize,
    maxSize,
    collapsible = false,
    collapsedSize,
    collapseThreshold,
    disabled = false,
    resizeBehavior = "proportional",
    onCollapsedChange,
    ref,
    style,
    ...panelProps
  } = props;
  const context = useSplitterContext(PANEL_NAME);
  const generatedId = React.useId();
  const id = idProp ?? generatedId;
  const [element, setElement] = React.useState<HTMLDivElement | null>(null);
  const composedRef = useComposedRefs(ref, setElement);
  const handleCollapsedChange = useStableCallback(onCollapsedChange);
  const { registerPanel } = context;

  React.useLayoutEffect(() => {
    if (!element) {
      return;
    }
    const sizeProps: PanelSizeProps = { id, defaultSize, minSize, maxSize, collapsible, collapsedSize, collapseThreshold, disabled, resizeBehavior };
    return registerPanel({ id, element, sizeProps, onCollapsedChange: handleCollapsedChange });
  }, [registerPanel, element, id, defaultSize, minSize, maxSize, collapsible, collapsedSize, collapseThreshold, disabled, resizeBehavior, handleCollapsedChange]);

  const state = context.panelStates.get(id);
  const flexStyle: React.CSSProperties = state
    ? { flexGrow: state.size, flexShrink: 1, flexBasis: 0 }
    : getInitialFlexStyle(context.initialLayout?.[id] ?? defaultSize);
  const collapsedAway = state !== undefined && state.collapsed && fuzzyEqual(state.constraints.collapsedSize, 0);
  const panelContext = React.useMemo(() => ({ id }), [id]);

  return (
    <SplitterPanelContext value={panelContext}>
      <Primitive.div
        id={id}
        data-state={state?.collapsed ? "collapsed" : "expanded"}
        data-orientation={context.orientation}
        data-collapsible={collapsible ? "" : undefined}
        data-disabled={disabled ? "" : undefined}
        inert={collapsedAway || undefined}
        {...panelProps}
        ref={composedRef}
        style={{
          ...flexStyle,
          "minWidth": 0,
          "minHeight": 0,
          "overflow": "hidden",
          "--xlayout-splitter-panel-size": state ? `${state.size}%` : undefined,
          ...style,
        }}
      />
    </SplitterPanelContext>
  );
}

export interface SplitterHandleProps extends PrimitiveProps<"div"> {
  /** Prevents resizing with this handle; the panels beside it still follow other handles. */
  disabled?: boolean;
  onDraggingChange?: (dragging: boolean) => void;
  /** How far beyond the handle, in pixels, a touch still takes it; `0` takes only touches on it. @default 12 */
  touchMargin?: number;
}

function SplitterHandle(props: SplitterHandleProps): React.ReactNode {
  const {
    id: idProp,
    disabled: disabledProp = false,
    onDraggingChange,
    touchMargin = DEFAULT_TOUCH_MARGIN,
    onPointerDown,
    onKeyDown,
    onDoubleClick,
    ref,
    style,
    ...handleProps
  } = props;
  const context = useSplitterContext(HANDLE_NAME);
  const generatedId = React.useId();
  const id = idProp ?? generatedId;
  const [element, setElement] = React.useState<HTMLDivElement | null>(null);
  const composedRef = useComposedRefs(ref, setElement);
  const disabled = context.disabled || disabledProp;
  const separatorOrientation: Orientation = context.orientation === "horizontal" ? "vertical" : "horizontal";
  const { registerHandle: registerWithRoot, beginResize, resizeWithKeyboard, resetHandle, direction } = context;

  React.useLayoutEffect(() => {
    if (!element) {
      return;
    }
    return registerWithRoot({ id, element });
  }, [registerWithRoot, element, id]);

  const disabledRef = React.useRef(disabled);
  React.useLayoutEffect(() => {
    disabledRef.current = disabled;
  });
  const registeredHandle = React.useMemo((): RegisteredHandle | null => {
    if (!element) {
      return null;
    }
    return {
      element,
      orientation: separatorOrientation,
      isEnabled: () => !disabledRef.current,
      beginResize: origin => beginResize(id, origin),
    };
  }, [element, separatorOrientation, beginResize, id]);
  React.useLayoutEffect(() => (registeredHandle ? registerHandle(registeredHandle) : undefined), [registeredHandle]);

  const resizing = context.resizing?.handleId === id ? context.resizing : null;
  const dragging = resizing !== null;
  const handleDraggingChange = useStableCallback(onDraggingChange);
  const previousDraggingRef = React.useRef(dragging);
  React.useEffect(() => {
    if (previousDraggingRef.current !== dragging) {
      previousDraggingRef.current = dragging;
      handleDraggingChange(dragging);
    }
  }, [dragging, handleDraggingChange]);

  const state = context.handleStates.get(id);
  let limit: "start" | "end" | undefined;
  if (resizing?.limit.atStart) {
    limit = "start";
  } else if (resizing?.limit.atEnd) {
    limit = "end";
  }
  const previewOffset = resizing && context.resizeMode === "deferred" ? resizing.previewOffset : 0;
  const previewTransform = previewOffset === 0
    ? undefined
    : separatorOrientation === "vertical" ? `translateX(${previewOffset}px)` : `translateY(${previewOffset}px)`;

  const beginPointerResize = useStableCallback((event: PointerEvent, handleElement: HTMLElement) => {
    if (!registeredHandle) {
      return;
    }
    handleElement.focus({ preventScroll: true });
    const origin = { x: event.clientX, y: event.clientY };
    const participants = [registeredHandle, ...findIntersectingHandles(registeredHandle, origin)];
    const sessions = participants.map(participant => participant.beginResize(origin));
    const crossing = participants.length > 1;
    const dragSession = startDragSession(event, {
      threshold: 0,
      cursor: crossing ? "move" : getResizeCursor(separatorOrientation, direction, { atStart: false, atEnd: false }),
      captureElement: handleElement,
    }, {
      onMove: (moveEvent) => {
        const point = { x: moveEvent.clientX, y: moveEvent.clientY };
        let limits: ResizeLimit[] = [];
        renderSynchronously(() => {
          limits = sessions.map(session => session.move(point));
        });
        if (!crossing) {
          dragSession.setCursor(getResizeCursor(separatorOrientation, direction, limits[0]!));
          return;
        }
        const columnIndex = participants.findIndex(participant => participant.orientation === "vertical");
        const rowIndex = participants.findIndex(participant => participant.orientation === "horizontal");
        dragSession.setCursor(getCrossingCursor(limits[columnIndex]!, limits[rowIndex]!, direction));
      },
      onEnd: () => {
        renderSynchronously(() => sessions.forEach(session => session.commit()));
      },
      onCancel: () => {
        renderSynchronously(() => sessions.forEach(session => session.cancel()));
      },
      // When the browser takes the pointer away, what the user did so far is kept.
      onInterrupt: () => {
        renderSynchronously(() => sessions.forEach(session => session.commit()));
      },
    });
  });

  React.useLayoutEffect(() => {
    const root = element?.parentElement;
    if (!element || !root || disabled || touchMargin <= 0) {
      return;
    }
    const stopReach = registerTouchReach({ element, margin: touchMargin, press: event => beginPointerResize(event, element) });
    const release = holdTouchScrolling(root);
    return () => {
      stopReach();
      release();
    };
  }, [element, disabled, touchMargin, beginPointerResize]);

  return (
    <Primitive.div
      role="separator"
      aria-orientation={separatorOrientation}
      aria-controls={state?.primaryId}
      aria-valuenow={state ? Math.round(state.valueNow) : undefined}
      aria-valuemin={state ? Math.round(state.valueMin) : undefined}
      aria-valuemax={state ? Math.round(state.valueMax) : undefined}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? undefined : 0}
      data-orientation={separatorOrientation}
      data-dragging={dragging ? "" : undefined}
      data-limit={limit}
      data-disabled={disabled ? "" : undefined}
      {...handleProps}
      id={idProp}
      ref={composedRef}
      style={{
        flexGrow: 0,
        flexShrink: 0,
        touchAction: "none",
        userSelect: "none",
        transform: previewTransform,
        ...style,
      }}
      onPointerDown={composeEventHandlers(onPointerDown, (event) => {
        if (disabled || !registeredHandle || !isPrimaryPointerDown(event)) {
          return;
        }
        event.preventDefault();
        beginPointerResize(event.nativeEvent, event.currentTarget);
      })}
      onKeyDown={composeEventHandlers(onKeyDown, (event) => {
        if (!disabled && resizeWithKeyboard(id, event)) {
          event.preventDefault();
        }
      })}
      onDoubleClick={composeEventHandlers(onDoubleClick, () => {
        if (!disabled) {
          resetHandle(id);
        }
      })}
    />
  );
}

export interface SplitterTriggerProps extends PrimitiveProps<"button"> {
  /** Id of the collapsible panel the trigger collapses and expands. */
  panelId: string;
}

function SplitterTrigger(props: SplitterTriggerProps): React.ReactNode {
  const { panelId, onClick, ...triggerProps } = props;
  const context = useSplitterContext(TRIGGER_NAME);
  const state = context.panelStates.get(panelId);
  const { actions } = context;

  return (
    <Primitive.button
      type="button"
      aria-controls={panelId}
      aria-expanded={state ? !state.collapsed : undefined}
      data-state={state ? (state.collapsed ? "collapsed" : "expanded") : undefined}
      data-disabled={context.disabled ? "" : undefined}
      disabled={context.disabled}
      {...triggerProps}
      onClick={composeEventHandlers(onClick, () => {
        if (actions.isCollapsed(panelId)) {
          actions.expand(panelId);
        } else {
          actions.collapse(panelId);
        }
      })}
    />
  );
}

export {
  SplitterHandle as Handle,
  SplitterPanel as Panel,
  Splitter as Root,
  Splitter,
  SplitterHandle,
  SplitterPanel,
  SplitterTrigger,
  SplitterTrigger as Trigger,
};
