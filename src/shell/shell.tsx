import type { PrimitiveProps } from "../shared/primitive";
import type { Direction } from "../shared/types";
import type { ShellContextValue, SidebarContextValue, SidebarLimits } from "./context";
import type { LengthContext } from "./length";
import type {
  PersistedSidebar,
  ShellLength,
  ShellState,
  ShellStorage,
  SidebarApi,
  SidebarCollapsible,
  SidebarMode,
  SidebarSide,
  SidebarState,
} from "./types";
import { useDirection } from "@radix-ui/react-direction";
import * as React from "react";
import { useComposedRefs } from "../shared/compose-refs";
import { getOwnerWindow, isEditableTarget, sortByDocumentPosition } from "../shared/dom";
import { isPrimaryPointerDown, startDragSession } from "../shared/drag";
import { composeEventHandlers } from "../shared/events";
import { renderSynchronously } from "../shared/flush";
import { fuzzyCompare, fuzzyEqual } from "../shared/math";
import { Primitive } from "../shared/primitive";
import { measureElementSize, observeElementSize } from "../shared/resize-observer";
import { useControllableState } from "../shared/use-controllable-state";
import { useMediaQuery } from "../shared/use-media-query";
import { useStableCallback } from "../shared/use-stable-callback";
import { clampPanelSize } from "../splitter/layout";
import {
  DEFAULT_BREAKPOINT,
  DEFAULT_COLLAPSED_WIDTH,
  DEFAULT_WIDTH,
  FOOTER_NAME,
  HEADER_NAME,
  KEYBOARD_LARGE_STEP,
  KEYBOARD_STEP,
  MAIN_NAME,
  OVERLAY_NAME,
  RESIZER_NAME,
  ROOT_NAME,
  SIDEBAR_NAME,
  SKIP_LINK_NAME,
  TRIGGER_NAME,
} from "./constants";
import { OVERLAY_ATTRIBUTE, ShellContext, SidebarContext, useShellContext, useSidebarContext } from "./context";
import { readLengthContext, toCssLength, toPixels } from "./length";
import { getTabbableElements, lockScroll, makeOthersInert } from "./modal";
import { formatAriaShortcut, isApplePlatform, matchesShortcut, parseShortcut } from "./shortcut";
import { parseShellState, serializeShellState } from "./storage";

const storageListeners = new Set<() => void>();

function subscribeToStorage(onChange: () => void): () => void {
  storageListeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    storageListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function subscribeToNothing(): () => void {
  return () => {};
}

function useHydrated(): boolean {
  return React.useSyncExternalStore(subscribeToNothing, () => true, () => false);
}

function lengthToPixels(length: ShellLength, context: LengthContext): number {
  return toPixels(length, context);
}

function focusFirst(container: HTMLElement): void {
  const target = getTabbableElements(container)[0] ?? container;
  target.focus({ preventScroll: true });
}

export interface ShellProps extends Omit<PrimitiveProps<"div">, "dir"> {
  /**
   * Media query under which sidebars open as modal drawers.
   * @default "(max-width: 767px)"
   */
  breakpoint?: string;
  /** Reading direction; inherits from a direction provider when omitted. */
  dir?: Direction;
  /**
   * Persisted state known on the server, for example parsed from a cookie with
   * `parseShellState`, so the first render already matches it.
   */
  defaultState?: ShellState;
  /** Called with the new persisted state and its serialized form, to store it in a cookie. */
  onStateChange?: (state: ShellState, serialized: string) => void;
  /** Persists sidebar state under this key in `storage`. */
  storageKey?: string;
  /** Where sidebar state is persisted. Defaults to `localStorage`. */
  storage?: ShellStorage;
  /** Moves focus between the header, sidebars, main content and footer with F6 and Shift+F6. */
  landmarkNavigation?: boolean;
}

function Shell(props: ShellProps): React.ReactNode {
  const {
    breakpoint = DEFAULT_BREAKPOINT,
    dir,
    defaultState,
    onStateChange,
    storageKey,
    storage,
    landmarkNavigation = false,
    ref,
    style,
    ...rootProps
  } = props;
  const direction = useDirection(dir);
  const isMobile = useMediaQuery(breakpoint, false);
  const hydrated = useHydrated();
  const mainId = React.useId();
  const mainRef = React.useRef<HTMLElement | null>(null);
  const [sidebars, setSidebars] = React.useState<ReadonlyMap<string, SidebarApi>>(() => new Map());
  const sidebarElementsRef = React.useRef(new Map<string, HTMLElement>());
  const [landmarks, setLandmarks] = React.useState<readonly { element: HTMLElement }[]>([]);
  const [resizingId, setResizingId] = React.useState<string | null>(null);
  const [regionHeights, setRegionHeights] = React.useState<{ header: number | null; footer: number | null }>({ header: null, footer: null });

  const getStoredValue = React.useCallback(
    () => (storageKey ? (storage ?? window.localStorage).getItem(storageKey) : null),
    [storage, storageKey],
  );
  const storedValue = React.useSyncExternalStore(subscribeToStorage, getStoredValue, () => null);
  const storedState = React.useMemo(() => parseShellState(storedValue), [storedValue]);
  const persisted = storedState ?? defaultState;
  const persistedRef = React.useRef(persisted);
  React.useLayoutEffect(() => {
    persistedRef.current = persisted;
  });

  const handleStateChange = useStableCallback(onStateChange);
  const persist = React.useCallback((id: string, value: PersistedSidebar) => {
    const current = persistedRef.current?.[id];
    if (current && current.open === value.open && current.width === value.width) {
      return;
    }
    const next: ShellState = { ...persistedRef.current, [id]: value };
    persistedRef.current = next;
    const serialized = serializeShellState(next);
    if (storageKey) {
      (storage ?? window.localStorage).setItem(storageKey, serialized);
      storageListeners.forEach(listener => listener());
    }
    handleStateChange(next, serialized);
  }, [handleStateChange, storage, storageKey]);

  const publishSidebar = React.useCallback((api: SidebarApi, element: HTMLElement) => {
    const existing = sidebarElementsRef.current.get(api.id);
    if (existing && existing !== element) {
      throw new Error(`${ROOT_NAME} already has a sidebar with the id "${api.id}".`);
    }
    sidebarElementsRef.current.set(api.id, element);
    setSidebars(current => new Map(current).set(api.id, api));
    return () => {
      sidebarElementsRef.current.delete(api.id);
      setSidebars((current) => {
        const next = new Map(current);
        next.delete(api.id);
        return next;
      });
    };
  }, []);

  const openersRef = React.useRef(new Map<string, HTMLElement>());
  const rememberOpener = React.useCallback((sidebarId: string, element: HTMLElement) => {
    openersRef.current.set(sidebarId, element);
  }, []);
  const takeOpener = React.useCallback((sidebarId: string) => {
    const opener = openersRef.current.get(sidebarId);
    openersRef.current.delete(sidebarId);
    return opener;
  }, []);

  const registerLandmark = React.useCallback((element: HTMLElement) => {
    const entry = { element };
    setLandmarks(current => sortByDocumentPosition([...current, entry]));
    return () => setLandmarks(current => current.filter(existing => existing !== entry));
  }, []);

  const setRegionHeight = React.useCallback((region: "header" | "footer", height: number | null) => {
    setRegionHeights(current => (current[region] === height ? current : { ...current, [region]: height }));
  }, []);

  // F6 moves between landmarks and returns to the element last focused in each one.
  const lastFocusedRef = React.useRef(new WeakMap<HTMLElement, HTMLElement>());
  React.useEffect(() => {
    if (!landmarkNavigation || landmarks.length === 0) {
      return;
    }
    const ownerDocument = landmarks[0]!.element.ownerDocument;
    const findLandmark = (node: Node | null): HTMLElement | undefined => landmarks
      .map(landmark => landmark.element)
      .filter(element => node && element.contains(node))
      .at(-1);
    const handleFocusIn = (event: FocusEvent): void => {
      const landmark = findLandmark(event.target as Node);
      if (landmark && event.target instanceof HTMLElement && event.target !== landmark) {
        lastFocusedRef.current.set(landmark, event.target);
      }
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "F6" || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      const available = landmarks
        .map(landmark => landmark.element)
        .filter(element => !element.closest("[inert]") && element.checkVisibility());
      if (available.length === 0) {
        return;
      }
      event.preventDefault();
      const current = findLandmark(ownerDocument.activeElement);
      const index = current ? available.indexOf(current) : -1;
      const step = event.shiftKey ? -1 : 1;
      const next = available[(index + step + available.length) % available.length]!;
      const remembered = lastFocusedRef.current.get(next);
      if (remembered && remembered.isConnected && next.contains(remembered)) {
        remembered.focus();
        return;
      }
      const first = getTabbableElements(next)[0];
      if (first) {
        first.focus();
        return;
      }
      if (!next.hasAttribute("tabindex")) {
        next.setAttribute("tabindex", "-1");
      }
      next.focus();
    };
    ownerDocument.addEventListener("focusin", handleFocusIn);
    ownerDocument.addEventListener("keydown", handleKeyDown);
    return () => {
      ownerDocument.removeEventListener("focusin", handleFocusIn);
      ownerDocument.removeEventListener("keydown", handleKeyDown);
    };
  }, [landmarkNavigation, landmarks]);

  const cssVariables: Record<string, string> = {};
  const sideOffsets: Record<SidebarSide, string[]> = { start: [], end: [] };
  for (const sidebar of sidebars.values()) {
    cssVariables[`--xlayout-shell-${sidebar.id}-width`] = sidebar.width;
    cssVariables[`--xlayout-shell-${sidebar.id}-offset`] = sidebar.offset;
    sideOffsets[sidebar.side].push(sidebar.offset);
  }
  for (const side of ["start", "end"] as const) {
    const offsets = sideOffsets[side];
    cssVariables[`--xlayout-shell-${side}-offset`] = offsets.length === 0 ? "0px" : offsets.length === 1 ? offsets[0]! : `calc(${offsets.join(" + ")})`;
  }
  if (regionHeights.header !== null) {
    cssVariables["--xlayout-shell-header-height"] = `${regionHeights.header}px`;
  }
  if (regionHeights.footer !== null) {
    cssVariables["--xlayout-shell-footer-height"] = `${regionHeights.footer}px`;
  }

  const contextValue = React.useMemo((): ShellContextValue => ({
    isMobile,
    hydrated,
    direction,
    mainId,
    mainRef,
    persisted,
    sidebars,
    resizingId,
    publishSidebar,
    persist,
    rememberOpener,
    takeOpener,
    setResizingId,
    registerLandmark,
    setRegionHeight,
  }), [isMobile, hydrated, direction, mainId, persisted, sidebars, resizingId, publishSidebar, persist, rememberOpener, takeOpener, registerLandmark, setRegionHeight]);

  return (
    <ShellContext value={contextValue}>
      <Primitive.div
        dir={direction}
        data-mobile={hydrated && isMobile ? "" : undefined}
        data-hydrated={hydrated ? "" : undefined}
        data-resizing={resizingId === null ? undefined : ""}
        {...rootProps}
        ref={ref}
        style={{ ...cssVariables, ...style }}
      />
    </ShellContext>
  );
}

function useLandmark(element: HTMLElement | null): void {
  const { registerLandmark } = useShellContext("Shell landmarks");
  React.useLayoutEffect(() => (element ? registerLandmark(element) : undefined), [element, registerLandmark]);
}

function useRegionHeight(region: "header" | "footer", element: HTMLElement | null): void {
  const { setRegionHeight } = useShellContext("Shell regions");
  React.useLayoutEffect(() => {
    if (!element) {
      return;
    }
    setRegionHeight(region, measureElementSize(element).height);
    const stop = observeElementSize(element, size => setRegionHeight(region, size.height));
    return () => {
      stop();
      setRegionHeight(region, null);
    };
  }, [element, region, setRegionHeight]);
}

export interface ShellHeaderProps extends PrimitiveProps<"header"> {}

function ShellHeader(props: ShellHeaderProps): React.ReactNode {
  const { ref, ...headerProps } = props;
  useShellContext(HEADER_NAME);
  const [element, setElement] = React.useState<HTMLElement | null>(null);
  const composedRef = useComposedRefs(ref, setElement);
  useLandmark(element);
  useRegionHeight("header", element);
  return <Primitive.header {...headerProps} ref={composedRef} />;
}

export interface ShellFooterProps extends PrimitiveProps<"footer"> {}

function ShellFooter(props: ShellFooterProps): React.ReactNode {
  const { ref, ...footerProps } = props;
  useShellContext(FOOTER_NAME);
  const [element, setElement] = React.useState<HTMLElement | null>(null);
  const composedRef = useComposedRefs(ref, setElement);
  useLandmark(element);
  useRegionHeight("footer", element);
  return <Primitive.footer {...footerProps} ref={composedRef} />;
}

export interface ShellMainProps extends PrimitiveProps<"main"> {}

function ShellMain(props: ShellMainProps): React.ReactNode {
  const { ref, ...mainProps } = props;
  const context = useShellContext(MAIN_NAME);
  const [element, setElement] = React.useState<HTMLElement | null>(null);
  const composedRef = useComposedRefs(ref, setElement, context.mainRef);
  useLandmark(element);
  return <Primitive.main id={context.mainId} tabIndex={-1} {...mainProps} ref={composedRef} />;
}

export interface ShellSkipLinkProps extends PrimitiveProps<"a"> {}

/**
 * A link to the main content for keyboard users. Render it first and keep it visually
 * hidden until it receives focus.
 */
function ShellSkipLink(props: ShellSkipLinkProps): React.ReactNode {
  const { onClick, ...linkProps } = props;
  const context = useShellContext(SKIP_LINK_NAME);
  return (
    <Primitive.a
      href={`#${context.mainId}`}
      {...linkProps}
      onClick={composeEventHandlers(onClick, (event) => {
        const main = context.mainRef.current;
        if (!main) {
          return;
        }
        event.preventDefault();
        main.focus();
      })}
    />
  );
}

export interface ShellSidebarProps extends PrimitiveProps<"div"> {
  /** Identifies the sidebar for triggers, overlays, storage and CSS variables. Defaults to `side`. */
  "id"?: string;
  /** @default "start" */
  "side"?: SidebarSide;
  /** @default "offcanvas" */
  "collapsible"?: SidebarCollapsible;
  /** Whether the sidebar is open on wide screens, when controlled. */
  "open"?: boolean;
  /** @default true */
  "defaultOpen"?: boolean;
  "onOpenChange"?: (open: boolean) => void;
  /** Whether the drawer is open on narrow screens, when controlled. */
  "openMobile"?: boolean;
  /** @default false */
  "defaultOpenMobile"?: boolean;
  "onOpenMobileChange"?: (open: boolean) => void;
  /** Expanded width in pixels, when controlled. */
  "width"?: number;
  /** @default "16rem" */
  "defaultWidth"?: ShellLength;
  "onWidthChange"?: (width: number) => void;
  /** Narrowest width a resizer allows. @default "12rem" */
  "minWidth"?: ShellLength;
  /** Widest width a resizer allows; never wider than the viewport. @default "32rem" */
  "maxWidth"?: ShellLength;
  /** Width of an `"icon"` sidebar while collapsed. @default "3rem" */
  "collapsedWidth"?: ShellLength;
  /**
   * How far below the minimum a resizer must be dragged before the sidebar collapses.
   * Defaults to half the distance between the minimum and the collapsed width.
   */
  "collapseThreshold"?: ShellLength;
  /** Keyboard shortcut that toggles the sidebar, such as `"mod+b"`. */
  "shortcut"?: string;
  /** Closes the drawer when a link inside it is clicked. @default true */
  "closeOnNavigate"?: boolean;
  /** Names the drawer while it is open as a modal dialog. */
  "aria-label"?: string;
  /** Names the drawer while it is open as a modal dialog. */
  "aria-labelledby"?: string;
}

function ShellSidebar(props: ShellSidebarProps): React.ReactNode {
  const {
    side = "start",
    id = side,
    collapsible = "offcanvas",
    open: openProp,
    defaultOpen,
    onOpenChange,
    openMobile: openMobileProp,
    defaultOpenMobile = false,
    onOpenMobileChange,
    width: widthProp,
    defaultWidth = DEFAULT_WIDTH,
    onWidthChange,
    minWidth = "12rem",
    maxWidth = "32rem",
    collapsedWidth = DEFAULT_COLLAPSED_WIDTH,
    collapseThreshold,
    shortcut,
    closeOnNavigate = true,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledby,
    onKeyDown,
    onClick,
    ref,
    style,
    ...sidebarProps
  } = props;
  const root = useShellContext(SIDEBAR_NAME);
  const [element, setElement] = React.useState<HTMLDivElement | null>(null);
  const composedRef = useComposedRefs(ref, setElement);
  useLandmark(element);
  const persistedSidebar = root.persisted?.[id];

  const [open, setOpenState] = useControllableState({
    prop: openProp,
    defaultProp: persistedSidebar?.open ?? defaultOpen ?? true,
    onChange: onOpenChange,
    caller: SIDEBAR_NAME,
  });
  const [openMobile, setOpenMobileState] = useControllableState({
    prop: openMobileProp,
    defaultProp: defaultOpenMobile,
    onChange: onOpenMobileChange,
    caller: SIDEBAR_NAME,
  });
  const [width, setWidthState] = useControllableState<number | undefined>({
    prop: widthProp,
    defaultProp: persistedSidebar?.width,
    onChange: (next) => {
      if (next !== undefined) {
        onWidthChange?.(next);
      }
    },
    caller: SIDEBAR_NAME,
  });

  // Storage is only readable after hydration; apply what it holds once, unless the user
  // already changed the sidebar.
  const interactedRef = React.useRef(false);
  const appliedPersistedRef = React.useRef(persistedSidebar !== undefined);
  React.useEffect(() => {
    if (!persistedSidebar || appliedPersistedRef.current || interactedRef.current) {
      return;
    }
    appliedPersistedRef.current = true;
    setOpenState(persistedSidebar.open);
    if (persistedSidebar.width !== undefined) {
      setWidthState(persistedSidebar.width);
    }
  }, [persistedSidebar, setOpenState, setWidthState]);

  const mode: SidebarMode = root.isMobile && collapsible !== "none" ? "modal" : "docked";
  const expanded = collapsible === "none" || (mode === "modal" ? openMobile : open);
  const state: SidebarState = expanded ? "expanded" : "collapsed";
  const widthCss = width === undefined ? toCssLength(defaultWidth) : `${width}px`;
  const collapsedCss = collapsible === "icon" ? toCssLength(collapsedWidth) : "0px";
  let offset = "0px";
  if (mode === "docked") {
    offset = expanded ? widthCss : collapsedCss;
  }
  const resizing = root.resizingId === id;

  const { persist } = root;
  const persistDocked = React.useCallback((nextOpen: boolean, nextWidth: number | undefined) => {
    persist(id, nextWidth === undefined ? { open: nextOpen } : { open: nextOpen, width: nextWidth });
  }, [persist, id]);

  const setOpen = React.useCallback((next: boolean) => {
    interactedRef.current = true;
    setOpenState(next);
    persistDocked(next, width);
  }, [setOpenState, persistDocked, width]);

  const setOpenMobile = React.useCallback((next: boolean) => {
    interactedRef.current = true;
    setOpenMobileState(next);
  }, [setOpenMobileState]);

  const toggle = React.useCallback(() => {
    if (collapsible === "none") {
      return;
    }
    if (mode === "modal") {
      setOpenMobile(!openMobile);
    } else {
      setOpen(!open);
    }
  }, [collapsible, mode, open, openMobile, setOpen, setOpenMobile]);

  const [lengthContext, setLengthContext] = React.useState<LengthContext | null>(null);
  React.useLayoutEffect(() => {
    if (!element) {
      return;
    }
    const ownerWindow = getOwnerWindow(element);
    const measure = (): void => {
      const next = readLengthContext(element);
      // Lengths in rem, em and vw are converted once fonts and the viewport are known.
      // eslint-disable-next-line react/set-state-in-effect
      setLengthContext(current => (current
        && current.fontSize === next.fontSize
        && current.rootFontSize === next.rootFontSize
        && current.viewportWidth === next.viewportWidth
        ? current
        : next));
    };
    measure();
    ownerWindow.addEventListener("resize", measure);
    return () => ownerWindow.removeEventListener("resize", measure);
  }, [element]);

  const limits = React.useMemo((): SidebarLimits | null => {
    if (!lengthContext) {
      return null;
    }
    const collapsed = collapsible === "icon" ? lengthToPixels(collapsedWidth, lengthContext) : 0;
    const max = Math.min(lengthToPixels(maxWidth, lengthContext), lengthContext.viewportWidth);
    const min = Math.min(Math.max(lengthToPixels(minWidth, lengthContext), collapsed), max);
    const threshold = collapseThreshold === undefined ? (min - collapsed) / 2 : lengthToPixels(collapseThreshold, lengthContext);
    return { min, max, collapsed, threshold, collapsible: collapsible !== "none" };
  }, [lengthContext, collapsible, collapsedWidth, maxWidth, minWidth, collapseThreshold]);

  const defaultWidthPixels = lengthContext ? lengthToPixels(defaultWidth, lengthContext) : null;
  const widthPixels = width ?? defaultWidthPixels;

  const setWidth = React.useCallback((next: ShellLength) => {
    if (!lengthContext) {
      throw new Error(`${SIDEBAR_NAME} "${id}" cannot be resized before it is mounted.`);
    }
    const pixels = lengthToPixels(next, lengthContext);
    interactedRef.current = true;
    setWidthState(pixels);
    persistDocked(open, pixels);
  }, [lengthContext, id, setWidthState, persistDocked, open]);

  const resetWidth = React.useCallback(() => {
    interactedRef.current = true;
    setWidthState(undefined);
    setOpenState(true);
    persistDocked(true, undefined);
  }, [setWidthState, setOpenState, persistDocked]);

  const applyWidth = React.useCallback((nextOpen: boolean, nextWidth: number, persist: boolean) => {
    interactedRef.current = true;
    setOpenState(nextOpen);
    const keptWidth = nextOpen ? nextWidth : width;
    if (nextOpen) {
      setWidthState(nextWidth);
    }
    if (persist) {
      persistDocked(nextOpen, keptWidth);
    }
  }, [setOpenState, setWidthState, persistDocked, width]);

  const api = React.useMemo((): SidebarApi => ({
    id,
    side,
    mode,
    state,
    collapsible,
    open,
    openMobile,
    width: widthCss,
    offset,
    resizing,
    shortcut,
    setOpen,
    setOpenMobile,
    toggle,
    setWidth,
    resetWidth,
  }), [id, side, mode, state, collapsible, open, openMobile, widthCss, offset, resizing, shortcut, setOpen, setOpenMobile, toggle, setWidth, resetWidth]);

  const { publishSidebar } = root;
  React.useLayoutEffect(() => (element ? publishSidebar(api, element) : undefined), [element, api, publishSidebar]);

  // Crossing the breakpoint closes the drawer, so it does not reappear later by surprise.
  React.useEffect(() => {
    if (mode === "docked" && openMobile) {
      setOpenMobile(false);
    }
  }, [mode, openMobile, setOpenMobile]);

  const modalOpen = mode === "modal" && openMobile;
  const { mainId, takeOpener } = root;
  React.useLayoutEffect(() => {
    if (!modalOpen || !element) {
      return;
    }
    const ownerDocument = element.ownerDocument;
    // Safari does not focus buttons on click, so the trigger is remembered explicitly.
    const opener = takeOpener(id) ?? ownerDocument.activeElement;
    const overlays = [...ownerDocument.querySelectorAll(`[${OVERLAY_ATTRIBUTE}="${CSS.escape(id)}"]`)];
    const restoreInert = makeOthersInert([element, ...overlays]);
    const unlockScroll = lockScroll(ownerDocument);
    focusFirst(element);
    return () => {
      restoreInert();
      unlockScroll();
      const canReturn = opener instanceof HTMLElement && opener !== ownerDocument.body && opener.isConnected && !opener.closest("[inert]");
      const returnTarget = canReturn ? opener : ownerDocument.getElementById(mainId);
      returnTarget?.focus({ preventScroll: true });
    };
  }, [modalOpen, element, id, mainId, takeOpener]);

  React.useEffect(() => {
    if (!shortcut || !element || collapsible === "none") {
      return;
    }
    const parsed = parseShortcut(shortcut);
    const ownerWindow = getOwnerWindow(element);
    const apple = isApplePlatform(ownerWindow.navigator);
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.isComposing || event.repeat || isEditableTarget(event.target)) {
        return;
      }
      if (matchesShortcut(event, parsed, apple)) {
        event.preventDefault();
        toggle();
      }
    };
    ownerWindow.addEventListener("keydown", handleKeyDown);
    return () => ownerWindow.removeEventListener("keydown", handleKeyDown);
  }, [shortcut, element, collapsible, toggle]);

  const hiddenAway = (mode === "modal" && !openMobile) || (mode === "docked" && !expanded && collapsible === "offcanvas");

  const sidebarContext = React.useMemo((): SidebarContextValue => ({
    api,
    limits,
    widthPixels,
    applyWidth,
    lengthContext,
  }), [api, limits, widthPixels, applyWidth, lengthContext]);

  return (
    <SidebarContext value={sidebarContext}>
      <Primitive.div
        id={id}
        data-side={side}
        data-state={state}
        data-mode={mode}
        data-collapsible={collapsible}
        data-resizing={resizing ? "" : undefined}
        role={modalOpen ? "dialog" : undefined}
        aria-modal={modalOpen || undefined}
        aria-label={modalOpen ? ariaLabel : undefined}
        aria-labelledby={modalOpen ? ariaLabelledby : undefined}
        tabIndex={modalOpen ? -1 : undefined}
        inert={hiddenAway || undefined}
        {...sidebarProps}
        ref={composedRef}
        style={{
          "--xlayout-shell-sidebar-width": widthCss,
          "--xlayout-shell-sidebar-collapsed-width": collapsedCss,
          "--xlayout-shell-sidebar-offset": offset,
          ...style,
        }}
        onKeyDown={composeEventHandlers(onKeyDown, (event) => {
          if (!modalOpen || !element) {
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setOpenMobile(false);
            return;
          }
          if (event.key !== "Tab") {
            return;
          }
          // Focus moves through the drawer's own list and wraps at both ends; browsers that
          // skip links on Tab would otherwise send focus out of the drawer.
          event.preventDefault();
          const tabbable = getTabbableElements(element);
          if (tabbable.length === 0) {
            return;
          }
          const index = tabbable.indexOf(element.ownerDocument.activeElement as HTMLElement);
          const step = event.shiftKey ? -1 : 1;
          const next = index === -1
            ? (event.shiftKey ? tabbable.at(-1) : tabbable[0])
            : tabbable[(index + step + tabbable.length) % tabbable.length];
          next?.focus();
        })}
        onClick={composeEventHandlers(onClick, (event) => {
          if (modalOpen && closeOnNavigate && event.target instanceof Element && event.target.closest("a[href]")) {
            setOpenMobile(false);
          }
        })}
      />
    </SidebarContext>
  );
}

export interface ShellSidebarTriggerProps extends PrimitiveProps<"button"> {
  /** Id of the sidebar the trigger toggles. @default "start" */
  sidebar?: string;
}

function ShellSidebarTrigger(props: ShellSidebarTriggerProps): React.ReactNode {
  const { sidebar: sidebarId = "start", onClick, ...triggerProps } = props;
  const root = useShellContext(TRIGGER_NAME);
  const sidebar = root.sidebars.get(sidebarId);
  const ariaShortcut = sidebar?.shortcut ? formatAriaShortcut(parseShortcut(sidebar.shortcut)) : undefined;
  return (
    <Primitive.button
      type="button"
      aria-controls={sidebarId}
      aria-expanded={sidebar ? sidebar.state === "expanded" : undefined}
      aria-keyshortcuts={ariaShortcut}
      data-state={sidebar?.state}
      {...triggerProps}
      onClick={composeEventHandlers(onClick, (event) => {
        if (!sidebar) {
          throw new Error(`${TRIGGER_NAME} controls "${sidebarId}", which is not a sidebar of this ${ROOT_NAME}.`);
        }
        if (sidebar.mode === "modal" && !sidebar.openMobile) {
          root.rememberOpener(sidebarId, event.currentTarget);
        }
        sidebar.toggle();
      })}
    />
  );
}

export interface ShellSidebarOverlayProps extends PrimitiveProps<"div"> {
  /** Id of the sidebar the overlay belongs to. @default "start" */
  sidebar?: string;
  /** Keeps the overlay mounted while closed, for exit animations. */
  forceMount?: boolean;
}

/** The backdrop behind an open drawer; clicking it closes the drawer. */
function ShellSidebarOverlay(props: ShellSidebarOverlayProps): React.ReactNode {
  const { sidebar: sidebarId = "start", forceMount = false, onClick, ...overlayProps } = props;
  const root = useShellContext(OVERLAY_NAME);
  const sidebar = root.sidebars.get(sidebarId);
  const open = sidebar !== undefined && sidebar.mode === "modal" && sidebar.openMobile;
  if (!open && !forceMount) {
    return null;
  }
  return (
    <Primitive.div
      aria-hidden
      data-state={open ? "open" : "closed"}
      {...{ [OVERLAY_ATTRIBUTE]: sidebarId }}
      {...overlayProps}
      onClick={composeEventHandlers(onClick, () => {
        sidebar?.setOpenMobile(false);
      })}
    />
  );
}

export interface ShellSidebarResizerProps extends PrimitiveProps<"div"> {
  /** Toggles the sidebar when the resizer is clicked without dragging. */
  toggleOnClick?: boolean;
}

/** The edge of a sidebar that resizes it; place it inside `Shell.Sidebar`. */
function ShellSidebarResizer(props: ShellSidebarResizerProps): React.ReactNode {
  const { toggleOnClick = false, onPointerDown, onKeyDown, onDoubleClick, onClick, style, ...resizerProps } = props;
  const root = useShellContext(RESIZER_NAME);
  const sidebar = useSidebarContext(RESIZER_NAME);
  const { api, limits, widthPixels, applyWidth } = sidebar;
  const draggedRef = React.useRef(false);
  const growSign = (api.side === "start") === (root.direction === "ltr") ? 1 : -1;
  const expanded = api.state === "expanded";
  const hidden = api.mode === "modal" || (!expanded && api.collapsible === "offcanvas");
  const currentSize = limits && widthPixels !== null ? (expanded ? widthPixels : limits.collapsed) : null;

  /** Resizes to `size`, collapsing past the threshold; returns the state it applied. */
  const resizeTo = (size: number, previous: number, persist: boolean): { open: boolean; width: number } | null => {
    if (!limits) {
      return null;
    }
    const clamped = clampPanelSize(size, previous, {
      minSize: limits.min,
      maxSize: limits.max,
      collapsible: limits.collapsible,
      collapsedSize: limits.collapsed,
      collapseThreshold: limits.threshold,
      disabled: false,
    });
    const collapses = limits.collapsible && fuzzyEqual(clamped, limits.collapsed, 3) && fuzzyCompare(clamped, limits.min, 3) < 0;
    applyWidth(!collapses, clamped, persist);
    return { open: !collapses, width: clamped };
  };

  return (
    <Primitive.div
      role="separator"
      aria-orientation="vertical"
      aria-controls={api.id}
      aria-valuenow={currentSize === null ? undefined : Math.round(currentSize)}
      aria-valuemin={limits ? Math.round(limits.collapsible ? limits.collapsed : limits.min) : undefined}
      aria-valuemax={limits ? Math.round(limits.max) : undefined}
      aria-valuetext={currentSize === null ? undefined : `${Math.round(currentSize)}px`}
      tabIndex={hidden ? undefined : 0}
      hidden={hidden}
      data-state={api.resizing ? "dragging" : "idle"}
      {...resizerProps}
      style={{ touchAction: "none", userSelect: "none", ...style }}
      onPointerDown={composeEventHandlers(onPointerDown, (event) => {
        if (!limits || currentSize === null || !isPrimaryPointerDown(event)) {
          return;
        }
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        draggedRef.current = false;
        const startSize = currentSize;
        const startOpen = api.open;
        const startWidth = widthPixels ?? startSize;
        const originX = event.clientX;
        let latest: { open: boolean; width: number } | null = null;
        const finish = (): void => {
          renderSynchronously(() => {
            root.setResizingId(null);
            if (latest) {
              applyWidth(latest.open, latest.width, true);
            }
          });
        };
        startDragSession(event.nativeEvent, {
          threshold: toggleOnClick ? 3 : 0,
          cursor: "col-resize",
          captureElement: event.currentTarget,
        }, {
          onStart: () => {
            draggedRef.current = true;
            root.setResizingId(api.id);
          },
          onMove: (moveEvent) => {
            renderSynchronously(() => {
              latest = resizeTo(startSize + (moveEvent.clientX - originX) * growSign, startSize, false);
            });
          },
          onEnd: finish,
          onCancel: () => {
            renderSynchronously(() => {
              root.setResizingId(null);
              applyWidth(startOpen, startWidth, false);
            });
          },
          // When the browser takes the pointer away, what the user did so far is kept.
          onInterrupt: finish,
        });
      })}
      onClick={composeEventHandlers(onClick, () => {
        if (draggedRef.current) {
          draggedRef.current = false;
          return;
        }
        if (toggleOnClick) {
          api.setOpen(!api.open);
        }
      })}
      onDoubleClick={composeEventHandlers(onDoubleClick, () => {
        api.resetWidth();
      })}
      onKeyDown={composeEventHandlers(onKeyDown, (event) => {
        if (!limits || currentSize === null) {
          return;
        }
        const growKey = growSign > 0 ? "ArrowRight" : "ArrowLeft";
        const shrinkKey = growSign > 0 ? "ArrowLeft" : "ArrowRight";
        const step = event.shiftKey ? KEYBOARD_LARGE_STEP : KEYBOARD_STEP;
        switch (event.key) {
          case growKey: {
            resizeTo(expanded ? currentSize + step : Math.max(limits.min, currentSize + step), currentSize, true);
            break;
          }
          case shrinkKey: {
            const target = currentSize - step;
            resizeTo(limits.collapsible && target < limits.min ? limits.collapsed : target, currentSize, true);
            break;
          }
          case "Home": {
            resizeTo(limits.collapsible ? limits.collapsed : limits.min, currentSize, true);
            break;
          }
          case "End": {
            resizeTo(limits.max, currentSize, true);
            break;
          }
          case "Enter": {
            if (!limits.collapsible) {
              return;
            }
            applyWidth(!expanded, widthPixels ?? limits.min, true);
            break;
          }
          default: {
            return;
          }
        }
        event.preventDefault();
      })}
    />
  );
}

export {
  ShellFooter as Footer,
  ShellHeader as Header,
  ShellMain as Main,
  Shell as Root,
  Shell,
  ShellFooter,
  ShellHeader,
  ShellMain,
  ShellSidebar,
  ShellSidebarOverlay,
  ShellSidebarResizer,
  ShellSidebarTrigger,
  ShellSkipLink,
  ShellSidebar as Sidebar,
  ShellSidebarOverlay as SidebarOverlay,
  ShellSidebarResizer as SidebarResizer,
  ShellSidebarTrigger as SidebarTrigger,
  ShellSkipLink as SkipLink,
};
