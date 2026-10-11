"use client";

import type { PrimitiveProps } from "../shared/primitive";
import type { Point, Size } from "../shared/types";
import type {
  DockApi,
  DockContextValue,
  DockGroupRenderProps,
  DockPanelDefinition,
  DockStripTabRenderProps,
  DockTabOverflowRenderProps,
  DockTabRenderProps,
  DragState,
  GroupElements,
} from "./context";
import type { Popout } from "./hosts";
import type { DockAction, DockAutoHide, DockFloating, DockGroup, DockGroupPlace, DockLayout, DockNode, DockRect, DockSide, DockSplit } from "./types";
import type { DockGeometry, DropZone, GroupGeometry, TabGeometry } from "./zones";
import * as React from "react";
import { createPortal } from "react-dom";
import { announce } from "../shared/announce";
import { useComposedRefs } from "../shared/compose-refs";
import { getOwnerWindow } from "../shared/dom";
import { holdTouchScrolling, startDragSession } from "../shared/drag";
import { renderSynchronously } from "../shared/flush";
import { clamp } from "../shared/math";
import { Primitive } from "../shared/primitive";
import { measureElementSize, observeElementSize } from "../shared/resize-observer";
import { DEFAULT_TOUCH_MARGIN } from "../shared/touch-reach";
import { useControllableState } from "../shared/use-controllable-state";
import { useStableCallback } from "../shared/use-stable-callback";
import {
  DRAG_THRESHOLD,
  EDGE_CONTACT,
  FLOAT_SIZE,
  FLOATING_LAYER,
  FLYOUT_KEEP,
  FLYOUT_LAYER,
  KEYBOARD_SHARE,
  KEYBOARD_STEP,
  MIN_AUTO_HIDE_SIZE,
  MIN_SHARE,
  ROOT_NAME,
  TOUCH_DRAG_THRESHOLD,
  TOUCH_HOLD_DELAY,
} from "./constants";
import { DockContext } from "./context";
import { elementId, openPopout, windowRect } from "./hosts";
import { autoHiddenOf, dockReducer, EMPTY_LAYOUT, findGroup, groupOfPanel, groupsOf, panelsOf, placeOf, runsVertically, validateLayout } from "./model";
import { FloatingView, FlyoutView, GroupView, NodeView, PopoutView, StripView } from "./parts";
import { resolveDropZone } from "./zones";

/** The smallest size of a floating group, in pixels. */
const MIN_FLOAT_SIZE = { width: 160, height: 100 };
/** How much of a floating group stays inside the dock when it is dragged away. */
const FLOAT_KEEP = 60;
/** Where a popout window opens, from the top left of the screen the dock is on. */
const POPOUT_OFFSET = 80;
const POPOUT_SIZE = { width: 640, height: 480 };
const POPOUT_RESIZE_DELAY = 200;
/** Where a keyboard choice to hide along an edge without a strip yet shows its indicator, in pixels from the edge. */
const STRIP_INDICATOR = 24;

const SIDE_WORDS: Record<DockSide, string> = { top: "above it", bottom: "below it", start: "before it", end: "after it" };
const SIDES: readonly DockSide[] = ["start", "end", "top", "bottom"];

interface Docking {
  panel: string;
  group: string;
  choices: { zone: DropZone; label: string }[];
  index: number;
}

function relativeRect(rect: DOMRect, origin: DOMRect): DockRect {
  return { x: rect.left - origin.left, y: rect.top - origin.top, width: rect.width, height: rect.height };
}

function isRightToLeft(element: Element): boolean {
  return getOwnerWindow(element).getComputedStyle(element).direction === "rtl";
}

function mainGroupsOf(node: DockNode | null): DockGroup[] {
  if (!node) {
    return [];
  }
  return node.type === "group" ? [node] : node.children.flatMap(mainGroupsOf);
}

/** The tabs of a group that show in its tab bar, with their places among its panels. */
function visibleTabs(group: DockGroup, tabBar: Element, rect: (element: Element) => DockRect): TabGeometry[] {
  return [...tabBar.querySelectorAll<HTMLElement>(":scope > [data-dock-tab]:not([data-overflow])")]
    .map(tab => ({ rect: rect(tab), index: group.panels.indexOf(tab.dataset.panel!) }));
}

/**
 * The edge of the main surface, `outer`, that a group at `inner` hides along: a group as tall as
 * the surface goes to the nearer side, one as wide as it to the nearer of the top and the bottom,
 * the way editors hide their side bars and panels; any other group goes to its nearest edge.
 */
function edgeToHideAlong(inner: DOMRect, outer: DOMRect, rtl: boolean): DockSide {
  const distances: [DockSide, number][] = [
    [rtl ? "end" : "start", inner.left - outer.left],
    [rtl ? "start" : "end", outer.right - inner.right],
    ["top", inner.top - outer.top],
    ["bottom", outer.bottom - inner.bottom],
  ];
  const touches = (index: number): boolean => distances[index]![1] <= EDGE_CONTACT;
  const tall = touches(2) && touches(3);
  const wide = touches(0) && touches(1);
  const candidates = tall === wide ? distances : distances.filter(([side]) => runsVertically(side) === tall);
  return candidates.reduce((best, entry) => (entry[1] < best[1] ? entry : best))[0];
}

/** Which way, along the pointer's axis, makes a revealed hidden group bigger: away from its edge. */
function growSign(side: DockSide, rtl: boolean): number {
  if (side === "top") {
    return 1;
  }
  if (side === "bottom") {
    return -1;
  }
  return (side === "start") === !rtl ? 1 : -1;
}

function defaultRenderTab({ title, closable, close }: DockTabRenderProps): React.ReactNode {
  return (
    <>
      <span data-dock-tab-title="">{title}</span>
      {closable && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Close ${title}`}
          data-dock-tab-close=""
          onPointerDown={event => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            close();
          }}
        >
          ×
        </button>
      )}
    </>
  );
}

function defaultRenderStripTab({ title }: DockStripTabRenderProps): React.ReactNode {
  return <span data-dock-strip-title="">{title}</span>;
}

function defaultRenderTabOverflow({ panels }: DockTabOverflowRenderProps): React.ReactNode {
  return `+${panels.length}`;
}

export interface DockProps extends Omit<PrimitiveProps<"div">, "asChild"> {
  /** Every panel the layout may place, by id. */
  panels: Readonly<Record<string, DockPanelDefinition>>;
  layout?: DockLayout;
  defaultLayout?: DockLayout;
  onLayoutChange?: (layout: DockLayout, action: DockAction) => void;
  /** What a tab shows inside it; by default the title and, for panels that close, a close button. */
  renderTab?: (tab: DockTabRenderProps) => React.ReactNode;
  /** What the button of a panel hidden along an edge shows; by default its title. */
  renderStripTab?: (tab: DockStripTabRenderProps) => React.ReactNode;
  /** What the button that lists the tabs that do not fit shows; by default how many there are. */
  renderTabOverflow?: (overflow: DockTabOverflowRenderProps) => React.ReactNode;
  /** Controls after a group's tabs, such as buttons to maximize, float, hide or pop the group out. */
  renderGroupControls?: (group: DockGroupRenderProps) => React.ReactNode;
  /** Names the separators between groups and at the inner edge of revealed hidden groups. @default "Resize" */
  handleLabel?: string;
  /** Names the strips that hold the buttons of panels hidden along the edges. @default "Hidden panels" */
  stripLabel?: string;
  /** Names the button and the menu that list the tabs that do not fit. @default "More tabs" */
  tabOverflowLabel?: string;
  /** How far beyond a separator or a resize corner, in pixels, a touch still takes it. @default 12 */
  touchMargin?: number;
  /** The size of a group that starts floating. @default { width: 360, height: 260 } */
  floatSize?: { width: number; height: number };
}

/**
 * Panels in tab groups that split the main surface, float above it, hide along its edges or open
 * in windows of their own, rearranged by dragging tabs or with the keyboard. The layout is plain
 * data. Panel content renders once and keeps its state wherever the panel goes, and fills its
 * group's content element once the dock has mounted.
 */
function Dock(props: DockProps): React.ReactNode {
  const {
    panels,
    layout: layoutProp,
    defaultLayout = EMPTY_LAYOUT,
    onLayoutChange,
    renderTab = defaultRenderTab,
    renderStripTab = defaultRenderStripTab,
    renderTabOverflow = defaultRenderTabOverflow,
    renderGroupControls,
    handleLabel = "Resize",
    stripLabel = "Hidden panels",
    tabOverflowLabel = "More tabs",
    touchMargin = DEFAULT_TOUCH_MARGIN,
    floatSize = FLOAT_SIZE,
    ref,
    style,
    children,
    ...rootProps
  } = props;
  const dockId = React.useId();
  const [layout, setLayout] = useControllableState({ prop: layoutProp, defaultProp: defaultLayout, caller: ROOT_NAME });
  validateLayout(layout);
  const unknown = panelsOf(layout).filter(panel => !Object.hasOwn(panels, panel));
  if (unknown.length > 0) {
    throw new Error(`${ROOT_NAME} layout places panels it has no definition for: ${unknown.join(", ")}. Saved layouts can be cleaned with pruneLayout.`);
  }
  const layoutRef = React.useRef(layout);
  React.useLayoutEffect(() => {
    layoutRef.current = layout;
  });
  const [root, setRoot] = React.useState<HTMLDivElement | null>(null);
  const composedRef = useComposedRefs(ref, setRoot);
  const surfaceRef = React.useRef<HTMLDivElement>(null);
  const overlayRef = React.useRef<HTMLDivElement>(null);
  const groupElementsRef = React.useRef(new Map<string, GroupElements>());
  const stripElementsRef = React.useRef(new Map<DockSide, HTMLElement>());
  const [hosts, setHosts] = React.useState<ReadonlyMap<string, HTMLElement>>(() => new Map());
  const [drag, setDrag] = React.useState<DragState | null>(null);
  const dragRef = React.useRef<DragState | null>(null);
  const [docking, setDocking] = React.useState<Docking | null>(null);
  const dockingRef = React.useRef<Docking | null>(null);
  const focusRef = React.useRef<string | null>(null);
  // Some browsers follow a drag with a click on the tab it started from; that click selects nothing.
  const draggedRef = React.useRef<string | null>(null);
  const popoutsRef = React.useRef(new Map<string, Popout>());
  const [popoutContainers, setPopoutContainers] = React.useState<ReadonlyMap<string, HTMLElement>>(() => new Map());
  // Size changes of group content render again, which places overlay panels again.
  const [, relayout] = React.useReducer((count: number) => count + 1, 0);

  const autoHidden = autoHiddenOf(layout);
  const [revealedState, setRevealedState] = React.useState<string | null>(null);
  const revealedEntry = revealedState === null ? undefined : autoHidden.find(entry => entry.group.id === revealedState);
  if (revealedState !== null && !revealedEntry) {
    // The revealed group left its edge, or closed; nothing shows any more.
    setRevealedState(null);
  }
  const revealed = revealedEntry ? revealedState : null;
  const revealedRef = React.useRef(revealed);
  React.useLayoutEffect(() => {
    revealedRef.current = revealed;
  });

  // Event handlers read these before React renders them.
  const applyDrag = React.useCallback((next: DragState | null) => {
    dragRef.current = next;
    setDrag(next);
  }, []);
  const applyDocking = React.useCallback((next: Docking | null) => {
    dockingRef.current = next;
    setDocking(next);
  }, []);

  const handleLayoutChange = useStableCallback(onLayoutChange);
  const dispatch = useStableCallback((action: DockAction) => {
    const current = layoutRef.current;
    const next = dockReducer(current, action);
    if (JSON.stringify(next) === JSON.stringify(current)) {
      return;
    }
    layoutRef.current = next;
    setLayout(next);
    handleLayoutChange(next, action);
  });

  const titleOf = React.useCallback((panel: string): string => panels[panel]?.title ?? panel, [panels]);
  const say = (message: string): void => {
    if (root) {
      announce(message, root.ownerDocument);
    }
  };

  const watchPopout = useStableCallback((group: string, popout: Popout) => {
    popout.window.addEventListener("pagehide", () => {
      // Closing a window the layout let go of is not the reader closing it.
      if (popoutsRef.current.get(group) === popout) {
        popoutsRef.current.delete(group);
        renderSynchronously(() => dispatch({ type: "return", group }));
      }
    });
    // A window resized by dragging its frame reports many sizes; the last one counts.
    let timer: ReturnType<typeof setTimeout> | undefined;
    popout.window.addEventListener("resize", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (popoutsRef.current.get(group) === popout) {
          dispatch({ type: "place", group, rect: windowRect(popout.window) });
        }
      }, POPOUT_RESIZE_DELAY);
    });
  });

  const reveal = React.useCallback((group: string | null) => {
    if (group !== null && placeOf(layoutRef.current, group) !== "autoHide") {
      throw new Error(`${ROOT_NAME} reveals only groups hidden along an edge, and "${group}" is not one.`);
    }
    revealedRef.current = group;
    setRevealedState(group);
  }, []);

  const api = React.useMemo((): DockApi => ({
    layout,
    dispatch,
    activate: panel => dispatch({ type: "activate", panel }),
    close: panel => dispatch({ type: "close", panel }),
    move: (panel, to) => dispatch({ type: "move", panel, to }),
    moveGroup: (group, to) => dispatch({ type: "moveGroup", group, to }),
    maximize: group => dispatch({ type: "maximize", group }),
    float: (panel) => {
      const bounds = root?.getBoundingClientRect();
      const width = Math.min(floatSize.width, bounds?.width ?? floatSize.width);
      const height = Math.min(floatSize.height, bounds?.height ?? floatSize.height);
      const rect = { x: ((bounds?.width ?? width) - width) / 2, y: ((bounds?.height ?? height) - height) / 2, width, height };
      dispatch({ type: "move", panel, to: { type: "float", rect } });
    },
    popout: (group) => {
      const current = layoutRef.current;
      const source = findGroup(current, group);
      if (!source || !root) {
        throw new Error(`${ROOT_NAME} has no group "${group}".`);
      }
      const ownerWindow = getOwnerWindow(root);
      const rect = { x: ownerWindow.screenX + POPOUT_OFFSET, y: ownerWindow.screenY + POPOUT_OFFSET, ...POPOUT_SIZE };
      const action: DockAction = { type: "moveGroup", group, to: { type: "popout", rect } };
      const created = dockReducer(current, action).popouts.at(-1)!.group.id;
      // The window opens now, while the click that asked for it still counts as the reader's action.
      const popout = openPopout(ownerWindow, rect, titleOf(source.active));
      if (!popout) {
        return;
      }
      popoutsRef.current.set(created, popout);
      watchPopout(created, popout);
      setPopoutContainers(new Map([...popoutsRef.current].map(([id, entry]) => [id, entry.container])));
      dispatch(action);
    },
    dock: (group) => {
      const current = layoutRef.current;
      const place = placeOf(current, group);
      if (place === "popout") {
        dispatch({ type: "return", group });
      } else if (place === "floating") {
        dispatch({ type: "moveGroup", group, to: { type: "edge", side: "end" } });
      } else if (place === "autoHide") {
        const side = autoHiddenOf(current).find(entry => entry.group.id === group)!.side;
        dispatch({ type: "moveGroup", group, to: { type: "edge", side } });
      }
    },
    autoHide: (group, side) => {
      const elements = groupElementsRef.current.get(group);
      if (!root || !findGroup(layoutRef.current, group)) {
        throw new Error(`${ROOT_NAME} has no group "${group}".`);
      }
      const rect = elements && elements.group.ownerDocument === root.ownerDocument ? elements.group.getBoundingClientRect() : null;
      const surface = surfaceRef.current!.getBoundingClientRect();
      const chosen = side ?? (rect ? edgeToHideAlong(rect, surface, isRightToLeft(root)) : "end");
      // The group keeps its size, as far as the surface leaves room for it.
      const room = (runsVertically(chosen) ? surface.width : surface.height) - FLYOUT_KEEP;
      const size = rect ? Math.min(runsVertically(chosen) ? rect.width : rect.height, room) : undefined;
      dispatch({ type: "moveGroup", group, to: { type: "autoHide", side: chosen, size: size === undefined ? undefined : Math.max(MIN_AUTO_HIDE_SIZE, Math.round(size)) } });
    },
    revealed,
    reveal,
  }), [layout, dispatch, root, floatSize, watchPopout, titleOf, revealed, reveal]);

  // Panel content renders into a host element of its own, which moves to whichever group shows it.
  React.useLayoutEffect(() => {
    if (!root) {
      return;
    }
    const wanted = new Set(panelsOf(layout));
    let changed = false;
    const next = new Map(hosts);
    for (const panel of wanted) {
      if (!next.has(panel)) {
        const host = root.ownerDocument.createElement("div");
        host.setAttribute("data-dock-panel", panel);
        host.setAttribute("role", "tabpanel");
        host.id = elementId(`${dockId}-panel`, panel);
        host.setAttribute("aria-labelledby", elementId(`${dockId}-tab`, panel));
        host.style.cssText = "position: absolute; inset: 0; overflow: auto;";
        next.set(panel, host);
        changed = true;
      }
    }
    for (const [panel, host] of next) {
      if (!wanted.has(panel)) {
        host.remove();
        next.delete(panel);
        changed = true;
      }
    }
    if (changed) {
      // Hosts are made once the dock is in a document; the content then renders into them.
      // eslint-disable-next-line react/set-state-in-effect
      setHosts(next);
    }
  }, [root, layout, hosts, dockId]);

  // Popout windows follow the layout: restored popouts open, and windows of removed ones close.
  React.useLayoutEffect(() => {
    if (!root) {
      return;
    }
    const open = popoutsRef.current;
    const blocked: string[] = [];
    let changed = false;
    for (const entry of layout.popouts) {
      if (open.has(entry.group.id)) {
        continue;
      }
      const popout = openPopout(getOwnerWindow(root), entry.rect, titleOf(entry.group.active));
      if (!popout) {
        blocked.push(entry.group.id);
        continue;
      }
      open.set(entry.group.id, popout);
      watchPopout(entry.group.id, popout);
      changed = true;
    }
    for (const [group, popout] of open) {
      if (!layout.popouts.some(entry => entry.group.id === group)) {
        open.delete(group);
        popout.window.close();
        changed = true;
      }
    }
    if (changed) {
      // eslint-disable-next-line react/set-state-in-effect
      setPopoutContainers(new Map([...open].map(([group, popout]) => [group, popout.container])));
    }
    // A window the browser would not open leaves its panels on the main surface.
    for (const group of blocked) {
      dispatch({ type: "return", group });
    }
  }, [root, layout.popouts, dispatch, watchPopout, titleOf]);

  React.useEffect(() => () => {
    for (const popout of popoutsRef.current.values()) {
      popout.window.close();
    }
    popoutsRef.current.clear();
  }, []);

  // Hosts go into the content of the group that shows them; overlay hosts are drawn over it.
  React.useLayoutEffect(() => {
    if (!root || !overlayRef.current) {
      return;
    }
    const rootRect = root.getBoundingClientRect();
    for (const [panel, host] of hosts) {
      const group = groupOfPanel(layout, panel);
      const elements = group ? groupElementsRef.current.get(group.id) : undefined;
      const place = group ? placeOf(layout, group.id) : undefined;
      const active = group?.active === panel;
      if ((panels[panel]?.render ?? "keepAlive") === "overlay" && place !== "popout") {
        if (host.parentElement !== overlayRef.current) {
          overlayRef.current.append(host);
        }
        const floatingIndex = layout.floating.findIndex(entry => entry.group.id === group?.id);
        host.style.zIndex = String(place === "autoHide" ? FLYOUT_LAYER + 1 : floatingIndex === -1 ? 1 : FLOATING_LAYER + floatingIndex * 2 + 1);
        if (elements && active) {
          const rect = relativeRect(elements.content.getBoundingClientRect(), rootRect);
          host.style.inset = "auto";
          host.style.left = `${rect.x}px`;
          host.style.top = `${rect.y}px`;
          host.style.width = `${rect.width}px`;
          host.style.height = `${rect.height}px`;
          host.style.visibility = "visible";
          host.style.pointerEvents = "auto";
        } else {
          host.style.visibility = "hidden";
          host.style.pointerEvents = "none";
        }
        continue;
      }
      if (!elements) {
        host.remove();
        continue;
      }
      if (host.parentElement !== elements.content) {
        elements.content.append(host);
      }
      host.hidden = !active;
    }
  });

  React.useLayoutEffect(() => {
    let pending = false;
    let observing = true;
    const schedule = (): void => {
      if (pending) {
        return;
      }
      pending = true;
      queueMicrotask(() => {
        pending = false;
        if (observing) {
          renderSynchronously(relayout);
        }
      });
    };
    const stops = [...groupElementsRef.current.values()].map(elements => observeElementSize(elements.content, schedule));
    return () => {
      observing = false;
      stops.forEach(stop => stop());
    };
  }, [layout, hosts, revealed]);

  // Focus follows a panel the keyboard moved, selected or closed. A tab still waiting in its
  // group's overflow menu takes focus itself once it shows.
  React.useLayoutEffect(() => {
    const panel = focusRef.current;
    if (!panel || !root) {
      return;
    }
    const id = elementId(`${dockId}-tab`, panel);
    const documents = [root.ownerDocument, ...[...popoutsRef.current.values()].map(popout => popout.window.document)];
    const tab = documents.map(document => document.getElementById(id)).find(Boolean);
    if (tab?.dataset.overflow === undefined) {
      focusRef.current = null;
      tab?.focus();
    }
  });

  // Touch drags that begin with a held finger keep the page from scrolling while they go on.
  React.useEffect(() => (root ? holdTouchScrolling(root) : undefined), [root]);

  // A revealed hidden group goes away when the reader turns to anything else.
  React.useEffect(() => {
    if (!revealed || !root) {
      return;
    }
    const ownerDocument = root.ownerDocument;
    const inside = (target: EventTarget | null): boolean => {
      if (!(target instanceof Node)) {
        return false;
      }
      const flyout = root.querySelector("[data-dock-flyout]");
      // Overlay panels of the revealed group are drawn over it from outside its element.
      const shownPanels = findGroup(layoutRef.current, revealed)?.panels ?? [];
      return Boolean(flyout?.contains(target))
        || [...stripElementsRef.current.values()].some(strip => strip.contains(target))
        || shownPanels.some(panel => hosts.get(panel)?.contains(target));
    };
    const handleOutside = (event: Event): void => {
      if (!inside(event.target) && !dragRef.current) {
        reveal(null);
      }
    };
    ownerDocument.addEventListener("pointerdown", handleOutside, true);
    ownerDocument.addEventListener("focusin", handleOutside);
    return () => {
      ownerDocument.removeEventListener("pointerdown", handleOutside, true);
      ownerDocument.removeEventListener("focusin", handleOutside);
    };
  }, [revealed, root, reveal, hosts]);

  const geometryOf = (exclude: string | null): DockGeometry => {
    const current = layoutRef.current;
    const rootRect = root!.getBoundingClientRect();
    const rect = (element: Element): DockRect => relativeRect(element.getBoundingClientRect(), rootRect);
    const describe = (group: DockGroup, place: DockGroupPlace): GroupGeometry[] => {
      const elements = groupElementsRef.current.get(group.id);
      if (!elements || group.id === exclude || elements.group.ownerDocument !== root!.ownerDocument) {
        return [];
      }
      return [{ id: group.id, place, rect: rect(elements.group), tabBar: rect(elements.tabBar), content: rect(elements.content), tabs: visibleTabs(group, elements.tabBar, rect) }];
    };
    const maximized = current.maximized ? findGroup(current, current.maximized) : undefined;
    const shown = revealedRef.current ? findGroup(current, revealedRef.current) : undefined;
    return {
      surface: rect(surfaceRef.current!),
      surfaceEmpty: current.root === null,
      groups: [
        ...[...current.floating].reverse().flatMap(entry => describe(entry.group, "floating")),
        ...(shown ? describe(shown, "autoHide") : []),
        ...(maximized ? [maximized] : mainGroupsOf(current.root)).flatMap(group => describe(group, "main")),
      ],
      strips: [...stripElementsRef.current].map(([side, element]) => ({ side, rect: rect(element) })),
      bounds: { x: 0, y: 0, width: rootRect.width, height: rootRect.height },
      rtl: isRightToLeft(root!),
    };
  };

  /** While a group is maximized, a drop can only join a group, hide along an edge or float. */
  const allowed = (zone: DropZone | null): DropZone | null => (
    zone && layoutRef.current.maximized !== null && (zone.target.type === "edge" || zone.target.type === "split") ? null : zone
  );

  const pointIn = (event: PointerEvent): Point => {
    const rect = root!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const consumeDragClick = React.useCallback((panel: string): boolean => {
    const dragged = draggedRef.current === panel;
    draggedRef.current = null;
    return dragged;
  }, []);

  const beginTabDrag = useStableCallback((group: DockGroup, panel: string, event: PointerEvent, element: HTMLElement) => {
    draggedRef.current = null;
    if (!root || dragRef.current || dockingRef.current) {
      return;
    }
    const popout = placeOf(layoutRef.current, group.id) === "popout";
    const source = { group: group.id, panel, count: group.panels.length };
    const zoneAt = (moveEvent: PointerEvent): DropZone | null => {
      if (!popout) {
        return allowed(resolveDropZone(pointIn(moveEvent), geometryOf(null), source, floatSize));
      }
      // In a popout window a tab only moves among its group's tabs.
      const elements = groupElementsRef.current.get(group.id)!;
      const origin = elements.group.getBoundingClientRect();
      const rect = (target: Element): DockRect => relativeRect(target.getBoundingClientRect(), origin);
      const zone = resolveDropZone(
        { x: moveEvent.clientX - origin.left, y: moveEvent.clientY - origin.top },
        {
          surface: { x: -1e6, y: -1e6, width: 0, height: 0 },
          surfaceEmpty: false,
          groups: [{ id: group.id, place: "popout", rect: rect(elements.group), tabBar: rect(elements.tabBar), content: rect(elements.content), tabs: visibleTabs(group, elements.tabBar, rect) }],
          strips: [],
          bounds: rect(elements.group),
          rtl: isRightToLeft(elements.group),
        },
        source,
        floatSize,
      );
      return zone?.target.type === "group" ? zone : null;
    };
    startDragSession(event, {
      threshold: DRAG_THRESHOLD,
      cursor: "grabbing",
      captureElement: element,
      touch: { threshold: TOUCH_DRAG_THRESHOLD, delay: TOUCH_HOLD_DELAY },
      // A touch that goes up or down scrolls the page; across, it drags at once, and held it drags anywhere.
      shouldStart: delta => event.pointerType !== "touch" || Math.abs(delta.x) > Math.abs(delta.y),
    }, {
      onStart: () => {
        draggedRef.current = panel;
        renderSynchronously(() => applyDrag({ kind: "panel", panel, group: group.id, zone: null }));
      },
      onMove: (moveEvent) => {
        const zone = zoneAt(moveEvent);
        renderSynchronously(() => applyDrag({ kind: "panel", panel, group: group.id, zone }));
      },
      onEnd: () => {
        const current = dragRef.current;
        renderSynchronously(() => {
          applyDrag(null);
          if (current?.kind === "panel" && current.zone) {
            focusRef.current = panel;
            dispatch({ type: "move", panel, to: current.zone.target });
          }
        });
      },
      onCancel: () => renderSynchronously(() => applyDrag(null)),
    });
  });

  const beginGroupDrag = useStableCallback((group: DockGroup, event: PointerEvent, element: HTMLElement) => {
    const entry = layoutRef.current.floating.find(floating => floating.group.id === group.id);
    if (!root || !entry || dragRef.current) {
      return;
    }
    const start = entry.rect;
    const origin = { x: event.clientX, y: event.clientY };
    startDragSession(event, { threshold: DRAG_THRESHOLD, cursor: "grabbing", captureElement: element }, {
      onStart: () => renderSynchronously(() => applyDrag({ kind: "group", group: group.id, zone: null, rect: start })),
      onMove: (moveEvent) => {
        const bounds = root.getBoundingClientRect();
        const rect = {
          ...start,
          x: clamp(start.x + moveEvent.clientX - origin.x, FLOAT_KEEP - start.width, bounds.width - FLOAT_KEEP),
          y: clamp(start.y + moveEvent.clientY - origin.y, 0, bounds.height - FLOAT_KEEP),
        };
        // A floating group moves freely; held with Shift, it docks where it is dropped.
        const zone = moveEvent.shiftKey
          ? allowed(resolveDropZone(pointIn(moveEvent), geometryOf(group.id), { group: group.id, panel: null, count: group.panels.length }, floatSize))
          : null;
        renderSynchronously(() => applyDrag({ kind: "group", group: group.id, zone: zone?.target.type === "float" ? null : zone, rect }));
      },
      onEnd: () => {
        const current = dragRef.current;
        renderSynchronously(() => {
          applyDrag(null);
          if (current?.kind !== "group") {
            return;
          }
          if (current.zone) {
            dispatch({ type: "moveGroup", group: group.id, to: current.zone.target });
          } else {
            dispatch({ type: "place", group: group.id, rect: current.rect });
          }
        });
      },
      onCancel: () => renderSynchronously(() => applyDrag(null)),
    });
  });

  const beginFloatResize = useStableCallback((group: DockGroup, event: PointerEvent, element: HTMLElement) => {
    const entry = layoutRef.current.floating.find(floating => floating.group.id === group.id);
    if (!root || !entry || dragRef.current) {
      return;
    }
    const start = entry.rect;
    const origin = { x: event.clientX, y: event.clientY };
    const rtl = isRightToLeft(root);
    startDragSession(event, { threshold: 0, cursor: rtl ? "nesw-resize" : "nwse-resize", captureElement: element }, {
      onMove: (moveEvent) => {
        const dx = moveEvent.clientX - origin.x;
        // The handle sits at the bottom of the inline end, which is the left in right to left.
        const width = Math.max(MIN_FLOAT_SIZE.width, start.width + (rtl ? -dx : dx));
        const height = Math.max(MIN_FLOAT_SIZE.height, start.height + moveEvent.clientY - origin.y);
        const rect = { x: rtl ? start.x + start.width - width : start.x, y: start.y, width, height };
        renderSynchronously(() => applyDrag({ kind: "resize", group: group.id, rect }));
      },
      onEnd: () => {
        const current = dragRef.current;
        renderSynchronously(() => {
          applyDrag(null);
          if (current?.kind === "resize") {
            dispatch({ type: "place", group: group.id, rect: current.rect });
          }
        });
      },
      onCancel: () => renderSynchronously(() => applyDrag(null)),
    });
  });

  const resizedPair = (split: DockSplit, index: number, sizes: number[], share: number): number[] => {
    const pair = sizes[index]! + sizes[index + 1]!;
    const before = clamp(sizes[index]! + share, MIN_SHARE, pair - MIN_SHARE);
    return sizes.map((size, position) => (position === index ? before : position === index + 1 ? pair - before : size));
  };

  const beginSplitResize = useStableCallback((split: DockSplit, index: number, event: PointerEvent, element: HTMLElement) => {
    const container = element.parentElement;
    if (!container || dragRef.current) {
      return;
    }
    const horizontal = split.orientation === "horizontal";
    const rect = container.getBoundingClientRect();
    const length = horizontal ? rect.width : rect.height;
    const flip = horizontal && isRightToLeft(container) ? -1 : 1;
    const origin = { x: event.clientX, y: event.clientY };
    const start = [...split.sizes];
    startDragSession(event, { threshold: 0, cursor: horizontal ? "col-resize" : "row-resize", captureElement: element }, {
      onMove: (moveEvent) => {
        const delta = horizontal ? (moveEvent.clientX - origin.x) * flip : moveEvent.clientY - origin.y;
        renderSynchronously(() => applyDrag({ kind: "split", split: split.id, sizes: resizedPair(split, index, start, delta / length) }));
      },
      onEnd: () => {
        const current = dragRef.current;
        renderSynchronously(() => {
          applyDrag(null);
          if (current?.kind === "split") {
            dispatch({ type: "resize", split: split.id, sizes: current.sizes });
          }
        });
      },
      onCancel: () => renderSynchronously(() => applyDrag(null)),
    });
  });

  /** The largest size a revealed hidden group along `side` may take, leaving some of the main surface showing. */
  const largestFlyout = (side: DockSide): number => {
    const surface = surfaceRef.current!.getBoundingClientRect();
    return Math.max(MIN_AUTO_HIDE_SIZE, (runsVertically(side) ? surface.width : surface.height) - FLYOUT_KEEP);
  };

  const beginFlyoutResize = useStableCallback((entry: DockAutoHide, event: PointerEvent, element: HTMLElement) => {
    if (!root || dragRef.current) {
      return;
    }
    const vertical = runsVertically(entry.side);
    const sign = growSign(entry.side, isRightToLeft(root));
    const largest = largestFlyout(entry.side);
    const origin = vertical ? event.clientX : event.clientY;
    const start = Math.min(entry.size, largest);
    startDragSession(event, { threshold: 0, cursor: vertical ? "col-resize" : "row-resize", captureElement: element }, {
      onMove: (moveEvent) => {
        const delta = ((vertical ? moveEvent.clientX : moveEvent.clientY) - origin) * sign;
        renderSynchronously(() => applyDrag({ kind: "flyout", group: entry.group.id, size: clamp(start + delta, MIN_AUTO_HIDE_SIZE, largest) }));
      },
      onEnd: () => {
        const current = dragRef.current;
        renderSynchronously(() => {
          applyDrag(null);
          if (current?.kind === "flyout") {
            dispatch({ type: "size", group: entry.group.id, size: Math.round(current.size) });
          }
        });
      },
      onCancel: () => renderSynchronously(() => applyDrag(null)),
    });
  });

  const handleSplitKey = useStableCallback((split: DockSplit, index: number, event: React.KeyboardEvent<HTMLElement>) => {
    const horizontal = split.orientation === "horizontal";
    const flip = horizontal && isRightToLeft(event.currentTarget) ? -1 : 1;
    const keys: Record<string, number> = horizontal
      ? { ArrowLeft: -KEYBOARD_SHARE * flip, ArrowRight: KEYBOARD_SHARE * flip }
      : { ArrowUp: -KEYBOARD_SHARE, ArrowDown: KEYBOARD_SHARE };
    const pair = split.sizes[index]! + split.sizes[index + 1]!;
    const share = event.key === "Home" ? -pair : event.key === "End" ? pair : keys[event.key];
    if (share === undefined) {
      return;
    }
    event.preventDefault();
    dispatch({ type: "resize", split: split.id, sizes: resizedPair(split, index, split.sizes, share) });
  });

  const handleFlyoutKey = useStableCallback((entry: DockAutoHide, event: React.KeyboardEvent<HTMLElement>) => {
    const vertical = runsVertically(entry.side);
    const sign = growSign(entry.side, isRightToLeft(event.currentTarget));
    const keys: Record<string, number> = vertical
      ? { ArrowLeft: -KEYBOARD_STEP * sign, ArrowRight: KEYBOARD_STEP * sign }
      : { ArrowUp: -KEYBOARD_STEP * sign, ArrowDown: KEYBOARD_STEP * sign };
    const largest = largestFlyout(entry.side);
    const size = event.key === "Home" ? MIN_AUTO_HIDE_SIZE : event.key === "End" ? largest : keys[event.key] === undefined ? undefined : entry.size + keys[event.key]!;
    if (size === undefined) {
      return;
    }
    event.preventDefault();
    dispatch({ type: "size", group: entry.group.id, size: Math.round(clamp(size, MIN_AUTO_HIDE_SIZE, largest)) });
  });

  const choicesFor = (group: DockGroup): Docking["choices"] => {
    const geometry = geometryOf(null);
    const titleOfGroup = (id: string): string => titleOf(findGroup(layoutRef.current, id)?.active ?? id);
    // Joining another group comes first, then splitting one, then the edges, hiding along them and floating.
    const choices: Docking["choices"] = geometry.groups
      .filter(target => target.id !== group.id)
      .map(target => ({ zone: { target: { type: "group", group: target.id }, indicator: target.content }, label: `With ${titleOfGroup(target.id)}` }));
    for (const target of geometry.groups) {
      if (target.place !== "main" || (target.id === group.id && group.panels.length === 1)) {
        continue;
      }
      const sides: [DockSide, DockRect][] = [
        ["top", { ...target.content, height: target.content.height / 2 }],
        ["bottom", { ...target.content, y: target.content.y + target.content.height / 2, height: target.content.height / 2 }],
        ["start", geometry.rtl ? { ...target.content, x: target.content.x + target.content.width / 2, width: target.content.width / 2 } : { ...target.content, width: target.content.width / 2 }],
        ["end", geometry.rtl ? { ...target.content, width: target.content.width / 2 } : { ...target.content, x: target.content.x + target.content.width / 2, width: target.content.width / 2 }],
      ];
      for (const [side, indicator] of sides) {
        choices.push({ zone: { target: { type: "split", group: target.id, side }, indicator }, label: `Beside ${titleOfGroup(target.id)}, ${SIDE_WORDS[side]}` });
      }
    }
    const { surface, bounds } = geometry;
    if (layoutRef.current.maximized === null) {
      const share = 0.25;
      const edges: [DockSide, DockRect][] = [
        ["top", { ...surface, height: surface.height * share }],
        ["bottom", { ...surface, y: surface.y + surface.height * (1 - share), height: surface.height * share }],
        ["start", geometry.rtl ? { ...surface, x: surface.x + surface.width * (1 - share), width: surface.width * share } : { ...surface, width: surface.width * share }],
        ["end", geometry.rtl ? { ...surface, width: surface.width * share } : { ...surface, x: surface.x + surface.width * (1 - share), width: surface.width * share }],
      ];
      for (const [side, indicator] of edges) {
        choices.push({ zone: { target: { type: "edge", side }, indicator }, label: `Along the ${side} edge` });
      }
    }
    const left = geometry.rtl ? "end" : "start";
    for (const side of SIDES) {
      const strip = geometry.strips.find(entry => entry.side === side)?.rect;
      const indicator = strip ?? (
        side === "top"
          ? { ...bounds, height: STRIP_INDICATOR }
          : side === "bottom"
            ? { ...bounds, y: bounds.height - STRIP_INDICATOR, height: STRIP_INDICATOR }
            : side === left ? { ...bounds, width: STRIP_INDICATOR } : { ...bounds, x: bounds.width - STRIP_INDICATOR, width: STRIP_INDICATOR }
      );
      choices.push({ zone: { target: { type: "autoHide", side }, indicator }, label: `Hidden along the ${side} edge` });
    }
    const width = Math.min(floatSize.width, bounds.width);
    const height = Math.min(floatSize.height, bounds.height);
    const rect = { x: (bounds.width - width) / 2, y: (bounds.height - height) / 2, width, height };
    choices.push({ zone: { target: { type: "float", rect }, indicator: rect }, label: "Floating" });
    return choices;
  };

  const handleTabKey = useStableCallback((group: DockGroup, panel: string, event: React.KeyboardEvent<HTMLElement>) => {
    const current = dockingRef.current;
    if (current) {
      if (current.panel !== panel) {
        return;
      }
      const step = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0;
      if (step !== 0) {
        event.preventDefault();
        const index = (current.index + step + current.choices.length) % current.choices.length;
        applyDocking({ ...current, index });
        say(current.choices[index]!.label);
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        applyDocking(null);
        focusRef.current = panel;
        dispatch({ type: "move", panel, to: current.choices[current.index]!.zone.target });
        say(`${titleOf(panel)} docked.`);
      } else if (event.key === "Escape") {
        event.preventDefault();
        applyDocking(null);
        say(`${titleOf(panel)} stays where it was.`);
      }
      return;
    }
    const rtl = isRightToLeft(event.currentTarget);
    const index = group.panels.indexOf(panel);
    const forward = event.key === (rtl ? "ArrowLeft" : "ArrowRight");
    const backward = event.key === (rtl ? "ArrowRight" : "ArrowLeft");
    if (event.ctrlKey && event.shiftKey && (forward || backward)) {
      event.preventDefault();
      const to = clamp(index + (forward ? 1 : -1), 0, group.panels.length - 1);
      if (to !== index) {
        focusRef.current = panel;
        dispatch({ type: "move", panel, to: { type: "group", group: group.id, index: to > index ? to + 1 : to } });
      }
      return;
    }
    // The key itself, since with Alt the character it types differs between keyboards.
    if (event.altKey && event.shiftKey && event.code === "KeyM") {
      event.preventDefault();
      const choices = choicesFor(group);
      applyDocking({ panel, group: group.id, choices, index: 0 });
      say(`Docking ${titleOf(panel)}. Arrow keys choose a place, Enter docks it there, Escape cancels. ${choices[0]!.label}.`);
      return;
    }
    let next: string | undefined;
    if (forward || backward) {
      next = group.panels[(index + (forward ? 1 : -1) + group.panels.length) % group.panels.length];
    } else if (event.key === "Home") {
      next = group.panels[0];
    } else if (event.key === "End") {
      next = group.panels.at(-1);
    } else if (event.key === "Delete" && (panels[panel]?.closable ?? true)) {
      event.preventDefault();
      const after = dockReducer(layoutRef.current, { type: "close", panel });
      focusRef.current = findGroup(after, group.id)?.active ?? groupsOf(after)[0]?.active ?? null;
      dispatch({ type: "close", panel });
      return;
    }
    if (next) {
      event.preventDefault();
      focusRef.current = next;
      dispatch({ type: "activate", panel: next });
    }
  });

  const handleTabBlur = useStableCallback((panel: string) => {
    if (dockingRef.current?.panel === panel) {
      applyDocking(null);
    }
  });

  const toggleStripTab = useStableCallback((group: DockGroup, panel: string, moveFocus: boolean) => {
    if (revealedRef.current === group.id && group.active === panel) {
      reveal(null);
      return;
    }
    if (group.active !== panel) {
      dispatch({ type: "activate", panel });
    }
    if (moveFocus) {
      focusRef.current = panel;
    }
    reveal(group.id);
  });

  const registerGroup = React.useCallback((group: string, elements: GroupElements | null) => {
    if (elements) {
      groupElementsRef.current.set(group, elements);
    } else {
      groupElementsRef.current.delete(group);
    }
  }, []);

  const registerStrip = React.useCallback((side: DockSide, element: HTMLElement | null) => {
    if (element) {
      stripElementsRef.current.set(side, element);
    } else {
      stripElementsRef.current.delete(side);
    }
  }, []);

  const splitSizes = React.useCallback(
    (split: DockSplit) => (drag?.kind === "split" && drag.split === split.id ? drag.sizes : split.sizes),
    [drag],
  );
  const floatingRect = React.useCallback(
    (entry: DockFloating) => ((drag?.kind === "group" || drag?.kind === "resize") && drag.group === entry.group.id ? drag.rect : entry.rect),
    [drag],
  );
  // A revealed hidden group takes no more of the main surface than resizing it could, whatever size it kept.
  const [surfaceSize, setSurfaceSize] = React.useState<Size | null>(null);
  React.useLayoutEffect(() => {
    const surface = surfaceRef.current!;
    // Measuring in a layout effect sizes a group revealed from the start before the first paint.
    setSurfaceSize(measureElementSize(surface));
    return observeElementSize(surface, size => renderSynchronously(() => setSurfaceSize(size)));
  }, []);
  const flyoutSize = React.useCallback((entry: DockAutoHide) => {
    const size = drag?.kind === "flyout" && drag.group === entry.group.id ? drag.size : entry.size;
    if (!surfaceSize) {
      return size;
    }
    const room = (runsVertically(entry.side) ? surfaceSize.width : surfaceSize.height) - FLYOUT_KEEP;
    return Math.min(size, Math.max(MIN_AUTO_HIDE_SIZE, room));
  }, [drag, surfaceSize]);

  const contextValue = React.useMemo((): DockContextValue => ({
    dockId,
    layout,
    panels,
    api,
    drag,
    docking: docking?.panel ?? null,
    focusRef,
    handleLabel,
    stripLabel,
    tabOverflowLabel,
    touchMargin,
    renderTab,
    renderStripTab,
    renderTabOverflow,
    renderGroupControls,
    registerGroup,
    registerStrip,
    splitSizes,
    floatingRect,
    flyoutSize,
    beginTabDrag,
    beginGroupDrag,
    beginFloatResize,
    beginSplitResize,
    beginFlyoutResize,
    handleTabKey,
    handleTabBlur,
    consumeDragClick,
    handleSplitKey,
    handleFlyoutKey,
    toggleStripTab,
  }), [dockId, layout, panels, api, drag, docking, handleLabel, stripLabel, tabOverflowLabel, touchMargin, renderTab, renderStripTab, renderTabOverflow, renderGroupControls, registerGroup, registerStrip, splitSizes, floatingRect, flyoutSize, beginTabDrag, beginGroupDrag, beginFloatResize, beginSplitResize, beginFlyoutResize, handleTabKey, handleTabBlur, consumeDragClick, handleSplitKey, handleFlyoutKey, toggleStripTab]);

  const zone = drag?.kind === "panel" || drag?.kind === "group" ? drag.zone : docking ? docking.choices[docking.index]!.zone : null;
  const maximized = layout.maximized ? findGroup(layout, layout.maximized) : undefined;
  // Content follows its panel; while the group is not shown, the content waits hidden.
  const portals = [...hosts].map(([panel, host]) => {
    const definition = panels[panel];
    const group = groupOfPanel(layout, panel);
    if (!definition || !group) {
      return null;
    }
    const place = placeOf(layout, group.id);
    const groupShown = place === "autoHide" ? revealed === group.id : !maximized || maximized.id === group.id || place !== "main";
    const shown = group.active === panel && groupShown;
    const mode = definition.render ?? "keepAlive";
    const content = mode === "whenVisible"
      ? (shown ? definition.content : null)
      : mode === "overlay"
        ? definition.content
        : <React.Activity mode={shown ? "visible" : "hidden"}>{definition.content}</React.Activity>;
    return <React.Fragment key={panel}>{createPortal(content, host)}</React.Fragment>;
  });

  const sides = SIDES.filter(side => autoHidden.some(entry => entry.side === side));
  return (
    <DockContext value={contextValue}>
      <Primitive.div
        data-dock-root=""
        data-dragging={drag?.kind}
        {...rootProps}
        ref={composedRef}
        // Clipping without a scroll container, so focusing a part can never scroll the layout away.
        style={{ position: "relative", overflow: "clip", ...style }}
      >
        <Primitive.div
          data-dock-frame=""
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            gridTemplateAreas: "\"start top end\" \"start surface end\" \"start bottom end\"",
            gridTemplateColumns: "auto minmax(0, 1fr) auto",
            gridTemplateRows: "auto minmax(0, 1fr) auto",
          }}
        >
          {sides.map(side => <StripView key={side} side={side} entries={autoHidden.filter(entry => entry.side === side)} />)}
          <Primitive.div
            ref={surfaceRef}
            data-dock-surface=""
            data-maximized={maximized ? "" : undefined}
            style={{ gridArea: "surface", position: "relative", display: "flex", minWidth: 0, minHeight: 0 }}
          >
            {maximized ? <GroupView group={maximized} place="main" /> : layout.root && <NodeView node={layout.root} />}
            {revealedEntry && <FlyoutView entry={revealedEntry} />}
          </Primitive.div>
        </Primitive.div>
        {layout.floating.map((entry, index) => <FloatingView key={entry.group.id} entry={entry} index={index} />)}
        <Primitive.div ref={overlayRef} data-dock-overlays="" style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />
        {zone && (
          <Primitive.div
            data-dock-drop-indicator=""
            data-target={zone.target.type}
            style={{ position: "absolute", left: zone.indicator.x, top: zone.indicator.y, width: zone.indicator.width, height: zone.indicator.height, pointerEvents: "none", zIndex: 1000 }}
          />
        )}
        {children}
      </Primitive.div>
      {layout.popouts.map((entry) => {
        const container = popoutContainers.get(entry.group.id);
        return container ? <PopoutView key={entry.group.id} entry={entry} container={container} /> : null;
      })}
      {portals}
    </DockContext>
  );
}

export { Dock, Dock as Root };
