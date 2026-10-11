"use client";

import type { PrimitiveProps } from "../shared/primitive";
import type { ItemEntry, MasonryContextValue, VirtualItemValue } from "./context";
import type { MasonryAssignment, MasonryHeightEstimate, MasonryLayoutInfo, MasonryNative, MasonryPlacement, MasonryTolerance } from "./types";
import type { VirtualAnchor, VirtualConfig, VirtualRange } from "./virtual";
import * as React from "react";
import { useComposedRefs } from "../shared/compose-refs";
import { getOwnerWindow, getScrollParent, isScrollContainer, sortByDocumentPosition } from "../shared/dom";
import { renderSynchronously } from "../shared/flush";
import { Primitive } from "../shared/primitive";
import { useRegistry } from "../shared/registry";
import { measureElementSize, observeElementSize } from "../shared/resize-observer";
import { onScrollFrame } from "../shared/scroll";
import { useStableCallback } from "../shared/use-stable-callback";
import { DEFAULT_INITIAL_COUNT, DEFAULT_MIN_COLUMN_WIDTH, DEFAULT_OVERSCAN, ITEM_NAME, NATIVE_TOLERANCE_PROPERTIES, ROOT_NAME } from "./constants";
import { MasonryContext, useMasonryContext, VirtualItemContext } from "./context";
import { computeMasonryLayout, countColumns } from "./place";
import { VirtualPlacement } from "./virtual";

interface Layout {
  columns: number;
  native: boolean;
  /** Placements by element; `null` until the items were measured at their column width. */
  placements: ReadonlyMap<HTMLElement, MasonryPlacement> | null;
  height: number;
}

function pixels(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function toleranceValue(tolerance: MasonryTolerance): string {
  return typeof tolerance === "number" ? `${tolerance}px` : tolerance;
}

/** The grid lanes tolerance property this browser takes the value in, or `null` without grid lanes. */
function nativeToleranceProperty(ownerWindow: Window & typeof globalThis, value: string): string | null {
  const { CSS } = ownerWindow;
  if (!CSS.supports("display", "grid-lanes")) {
    return null;
  }
  return NATIVE_TOLERANCE_PROPERTIES.find(property => CSS.supports(property, value)) ?? null;
}

function contentBox(element: HTMLElement): { width: number; height: number } {
  const size = measureElementSize(element);
  const style = getOwnerWindow(element).getComputedStyle(element);
  return {
    width: size.width - pixels(style.paddingLeft) - pixels(style.paddingRight) - pixels(style.borderLeftWidth) - pixels(style.borderRightWidth),
    height: size.height - pixels(style.paddingTop) - pixels(style.paddingBottom) - pixels(style.borderTopWidth) - pixels(style.borderBottomWidth),
  };
}

function orderOf(element: Element): number {
  return Number.parseInt(getOwnerWindow(element).getComputedStyle(element).order, 10) || 0;
}

function outerHeight(element: HTMLElement): number {
  const style = getOwnerWindow(element).getComputedStyle(element);
  return measureElementSize(element).height + pixels(style.marginTop) + pixels(style.marginBottom);
}

function samePlacements(a: ReadonlyMap<HTMLElement, MasonryPlacement>, b: ReadonlyMap<HTMLElement, MasonryPlacement> | null): boolean {
  return b !== null && a.size === b.size && [...a].every(([element, placement]) => {
    const other = b.get(element);
    return other !== undefined && other.column === placement.column && other.span === placement.span && other.y === placement.y;
  });
}

function toleranceIn(tolerance: MasonryTolerance, style: CSSStyleDeclaration): number {
  return tolerance === "infinite" ? Infinity : tolerance === "normal" ? pixels(style.fontSize) : tolerance;
}

interface MasonryOptions {
  /** A fixed number of columns. */
  columns?: number;
  /** Without `columns`, as many columns at least this many pixels wide as fit. @default 240 */
  minColumnWidth?: number;
  /** Without `columns`, at most this many columns. */
  maxColumns?: number;
  /** @default "normal" */
  tolerance?: MasonryTolerance;
  /** @default "balanced" */
  assignment?: MasonryAssignment;
  /** With `"stable"` assignment, a new key places every item afresh, for example after sorting. */
  layoutKey?: string | number;
  /** Called after each change to the column count, the column width or the height. */
  onLayout?: (layout: MasonryLayoutInfo) => void;
}

/** Checks the options and returns the minimum column width they come to. */
function checkOptions(options: MasonryOptions): number {
  const { columns, minColumnWidth, maxColumns = Infinity, tolerance = "normal" } = options;
  if (columns !== undefined && minColumnWidth !== undefined) {
    throw new Error(`${ROOT_NAME} takes columns or minColumnWidth; give only one of them.`);
  }
  if (columns !== undefined && (!Number.isInteger(columns) || columns < 1)) {
    throw new RangeError(`${ROOT_NAME} columns must be a whole number of at least 1, not ${columns}.`);
  }
  const minWidth = minColumnWidth ?? DEFAULT_MIN_COLUMN_WIDTH;
  if (!(minWidth > 0) || !(maxColumns >= 1)) {
    throw new RangeError(`${ROOT_NAME} needs a minColumnWidth above 0 and maxColumns of at least 1.`);
  }
  if (typeof tolerance === "number" && !(tolerance >= 0)) {
    throw new RangeError(`${ROOT_NAME} tolerance cannot be negative, not ${tolerance}.`);
  }
  return minWidth;
}

/** The plain grid the items form before the first measurement, as on the server. */
function staticTemplate(columns: number | undefined, minWidth: number): string {
  return columns === undefined ? `repeat(auto-fill, minmax(min(${minWidth}px, 100%), 1fr))` : `repeat(${columns}, minmax(0, 1fr))`;
}

function unmeasured(): never {
  throw new Error(`Only a virtual ${ROOT_NAME}, one given a count, measures items by key.`);
}

function unregistered(): never {
  throw new Error(`Items of a virtual ${ROOT_NAME} come from its children function.`);
}

function unplaced(): undefined {
  return undefined;
}

export interface MasonryProps extends PrimitiveProps<"div">, MasonryOptions {
  /** @default "auto" */
  native?: MasonryNative;
  count?: undefined;
}

export interface MasonryVirtualProps extends Omit<PrimitiveProps<"div">, "children" | "asChild">, MasonryOptions {
  /** How many items there are; only those near the scrollport are rendered. */
  count: number;
  /** Renders the item at `index`, a `Masonry.Item`. */
  children: (index: number) => React.ReactNode;
  /**
   * Names the item at `index` across changes, so it keeps its state and its measured height.
   * A new function places the items again, so pass one that changes with the items only.
   * @default its index
   */
  getItemKey?: (index: number) => React.Key;
  /** Columns the item at `index` spans. @default 1 */
  getItemSpan?: (index: number) => number;
  /** How high items not measured yet are taken to be, including their margins. @default the column width */
  estimateHeight?: MasonryHeightEstimate;
  /** Pixels beyond each end of the scrollport in which items are rendered too. @default 800 */
  overscan?: number;
  /** Items rendered before the root knows its columns, as on the server. @default 12 */
  initialCount?: number;
}

/**
 * Lays items out in columns, each item going to the column that ends highest. Gaps come from
 * the root's `column-gap` and `row-gap`. Where the browser has `display: grid-lanes` it does the
 * placing; elsewhere items are placed by script, horizontally by the grid and vertically with
 * `translate`. Before the first measurement, as on the server, the items form a plain grid.
 * Given a `count`, the root renders only the items near the scrollport, from its children function.
 */
function Masonry(props: MasonryProps | MasonryVirtualProps): React.ReactNode {
  return props.count === undefined ? <MasonryList {...props} /> : <MasonryVirtual {...props} />;
}

function MasonryList(props: MasonryProps): React.ReactNode {
  const {
    columns: fixedColumns,
    minColumnWidth: _minColumnWidth,
    maxColumns = Infinity,
    tolerance = "normal",
    assignment = "balanced",
    layoutKey,
    native = "auto",
    onLayout,
    count: _count,
    ref,
    style,
    ...rootProps
  } = props;
  const minWidth = checkOptions(props);

  const [root, setRoot] = React.useState<HTMLDivElement | null>(null);
  const composedRef = useComposedRefs(ref, setRoot);
  const [items, registerItem, refreshItems] = useRegistry<ItemEntry>(sortByDocumentPosition);
  const [layout, setLayout] = React.useState<Layout | null>(null);
  // Counts size changes of the root and the items; each one places the items again.
  const [resizeCount, setResizeCount] = React.useState(0);
  const layoutKeyRef = React.useRef(layoutKey);
  // The `order` each item was placed with, to notice when it changes.
  const ordersRef = React.useRef(new WeakMap<Element, number>());

  React.useLayoutEffect(() => {
    if (!root) {
      return;
    }
    const ownerWindow = getOwnerWindow(root);
    const rootStyle = ownerWindow.getComputedStyle(root);
    const columns = fixedColumns ?? countColumns(contentBox(root).width, pixels(rootStyle.columnGap), minWidth, maxColumns);
    const useNative = native === "auto"
      && assignment === "balanced"
      && nativeToleranceProperty(ownerWindow, toleranceValue(tolerance)) !== null;
    if (layout === null || layout.columns !== columns || layout.native !== useNative) {
      // Items are measured at their column width, so the column count comes first.
      // eslint-disable-next-line react/set-state-in-effect
      setLayout({ columns, native: useNative, placements: null, height: 0 });
      return;
    }
    if (useNative) {
      return;
    }
    const keyChanged = layoutKeyRef.current !== layoutKey;
    layoutKeyRef.current = layoutKey;
    const kept = assignment === "stable" && !keyChanged ? layout.placements : null;
    // Items are placed in order-modified document order.
    const ordered = items
      .map((entry, index) => {
        const order = orderOf(entry.element);
        ordersRef.current.set(entry.element, order);
        return { entry, index, order };
      })
      .sort((a, b) => a.order - b.order || a.index - b.index)
      .map(({ entry }) => entry);
    const result = computeMasonryLayout({
      columns,
      gap: pixels(rootStyle.rowGap),
      tolerance: toleranceIn(tolerance, rootStyle),
      items: ordered.map(entry => ({ span: entry.span, height: outerHeight(entry.element), column: kept?.get(entry.element)?.column })),
    });
    const placements = new Map(ordered.map((entry, index) => [entry.element, result.placements[index]!]));
    if (result.height !== layout.height || !samePlacements(placements, layout.placements)) {
      // Placing in a layout effect moves the items before the first paint.
      // eslint-disable-next-line react/set-state-in-effect
      setLayout({ ...layout, placements, height: result.height });
    }
  }, [root, items, layout, resizeCount, fixedColumns, minWidth, maxColumns, tolerance, assignment, layoutKey, native]);

  React.useLayoutEffect(() => {
    if (!root || !layout?.native) {
      return;
    }
    const value = toleranceValue(tolerance);
    const property = nativeToleranceProperty(getOwnerWindow(root), value)!;
    root.style.setProperty(property, value);
    return () => {
      root.style.removeProperty(property);
    };
  }, [root, layout?.native, tolerance]);

  React.useLayoutEffect(() => {
    if (!root) {
      return;
    }
    let pending = false;
    let observing = true;
    const relayout = (): void => {
      if (pending) {
        return;
      }
      pending = true;
      // One placement for every size reported in the same callback, rendered before paint.
      queueMicrotask(() => {
        pending = false;
        if (observing) {
          renderSynchronously(() => setResizeCount(count => count + 1));
        }
      });
    };
    // The root's own height follows the placement; only its width changes the columns.
    let rootWidth = measureElementSize(root).width;
    const stops = [
      observeElementSize(root, (size) => {
        if (size.width !== rootWidth) {
          rootWidth = size.width;
          relayout();
        }
      }),
      ...items.map(entry => observeElementSize(entry.element, relayout)),
    ];
    return () => {
      observing = false;
      stops.forEach(stop => stop());
    };
  }, [root, items]);

  // Items keep their order when React moves their elements or their `order` changes.
  React.useEffect(() => {
    if (!root) {
      return;
    }
    const observer = new MutationObserver((mutations) => {
      const moved = mutations.some(mutation => mutation.type === "childList" && mutation.target === root);
      const reordered = mutations.some(({ type, target }) => (
        type === "attributes"
        && target.parentNode === root
        && target.nodeType === Node.ELEMENT_NODE
        && orderOf(target as Element) !== ordersRef.current.get(target as Element)
      ));
      if (moved || reordered) {
        renderSynchronously(() => {
          refreshItems();
          setResizeCount(count => count + 1);
        });
      }
    });
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class"] });
    return () => observer.disconnect();
  }, [root, refreshItems]);

  const handleLayout = useStableCallback(onLayout);
  const reportedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!root || !layout || (!layout.native && layout.placements === null)) {
      return;
    }
    const box = contentBox(root);
    const gap = pixels(getOwnerWindow(root).getComputedStyle(root).columnGap);
    const info: MasonryLayoutInfo = {
      columns: layout.columns,
      columnWidth: (box.width - gap * (layout.columns - 1)) / layout.columns,
      height: layout.native ? box.height : layout.height,
      native: layout.native,
    };
    const key = JSON.stringify(info);
    if (key !== reportedRef.current) {
      reportedRef.current = key;
      handleLayout(info);
    }
  }, [root, layout, resizeCount, handleLayout]);

  const placements = layout?.placements ?? null;
  const placementOf = React.useCallback(
    (element: HTMLElement | null) => (element && placements ? placements.get(element) : undefined),
    [placements],
  );
  const contextValue = React.useMemo((): MasonryContextValue => ({
    columns: layout?.columns ?? null,
    native: layout?.native ?? false,
    virtual: false,
    placementOf,
    registerItem,
    measureItem: unmeasured,
  }), [layout?.columns, layout?.native, placementOf, registerItem]);

  return (
    <MasonryContext value={contextValue}>
      <Primitive.div
        data-layout={layout === null ? undefined : layout.native ? "native" : "script"}
        {...rootProps}
        ref={composedRef}
        style={{
          "--xlayout-masonry-columns": layout?.columns,
          "display": layout?.native ? "grid-lanes" : "grid",
          "gridTemplateColumns": layout ? `repeat(${layout.columns}, minmax(0, 1fr))` : staticTemplate(fixedColumns, minWidth),
          // Every placed item sits in this one row, moved down by its placement.
          "gridTemplateRows": placements ? `${layout?.height}px` : undefined,
          ...style,
        }}
      />
    </MasonryContext>
  );
}

/** What the root measured of itself: everything placing the items needs but their heights. */
interface Frame {
  columns: number;
  columnWidth: number;
  rowGap: number;
  tolerance: number;
}

function sameFrame(a: Frame, b: Frame | null): boolean {
  return b !== null && a.columns === b.columns && a.columnWidth === b.columnWidth && a.rowGap === b.rowGap && a.tolerance === b.tolerance;
}

/** The items a virtual root renders, where they go, and how high its content is. */
interface Snapshot {
  indexes: readonly number[];
  placements: readonly MasonryPlacement[];
  height: number;
}

function sameSnapshot(a: Snapshot, b: Snapshot | null): boolean {
  return b !== null
    && a.height === b.height
    && a.indexes.length === b.indexes.length
    && a.indexes.every((index, position) => {
      const placement = a.placements[position]!;
      const other = b.placements[position]!;
      return index === b.indexes[position] && placement.column === other.column && placement.span === other.span && placement.y === other.y;
    });
}

function defaultKey(index: number): React.Key {
  return index;
}

function defaultSpan(): number {
  return 1;
}

function checkCount(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${ROOT_NAME} ${name} must be a whole number of at least 0, not ${value}.`);
  }
}

/** What scrolls the items: the root itself, a scrolling ancestor, or `null` for the page. */
function scrollerOf(root: HTMLElement): HTMLElement | null {
  return isScrollContainer(root) ? root : getScrollParent(root);
}

/** The part of the root's content box the scrollport shows, measured from the top of that box. */
function viewOf(root: HTMLElement): VirtualRange {
  const ownerWindow = getOwnerWindow(root);
  const style = ownerWindow.getComputedStyle(root);
  const scroller = scrollerOf(root);
  if (scroller === root) {
    const top = root.scrollTop - pixels(style.paddingTop);
    return { top, bottom: top + root.clientHeight };
  }
  const contentTop = root.getBoundingClientRect().top + pixels(style.borderTopWidth) + pixels(style.paddingTop);
  if (!scroller) {
    return { top: -contentTop, bottom: ownerWindow.innerHeight - contentTop };
  }
  const portTop = scroller.getBoundingClientRect().top + scroller.clientTop;
  return { top: portTop - contentTop, bottom: portTop + scroller.clientHeight - contentTop };
}

/**
 * The item the reader sees first and where it is, to keep it in place while the items before it
 * change; `null` while the top of the content shows, as nothing above it can move what shows.
 */
function anchorFor(root: HTMLElement, placement: VirtualPlacement<React.Key>): VirtualAnchor<React.Key> | null {
  const view = viewOf(root);
  return view.top > 0 ? placement.anchorIn(view) : null;
}

/** Scrolls as far as the anchor moved, so what the reader sees stays in place; returns whether it scrolled. */
function scrollWithAnchor(root: HTMLElement, placement: VirtualPlacement<React.Key>, anchor: VirtualAnchor<React.Key>): boolean {
  const index = placement.indexOf(anchor.key, anchor.index);
  const shift = index === -1 ? 0 : placement.placement(index).y - anchor.top;
  if (shift === 0) {
    return false;
  }
  (scrollerOf(root) ?? getOwnerWindow(root)).scrollBy({ top: shift, behavior: "instant" });
  return true;
}

/** The child of `root` that holds `target`. */
function itemOf(root: HTMLElement, target: Node | null): Node | null {
  let node = target;
  while (node && node.parentNode !== root) {
    node = node.parentNode;
  }
  return node;
}

function MasonryVirtual(props: MasonryVirtualProps): React.ReactNode {
  const {
    count,
    children,
    getItemKey = defaultKey,
    getItemSpan = defaultSpan,
    estimateHeight,
    overscan = DEFAULT_OVERSCAN,
    initialCount = DEFAULT_INITIAL_COUNT,
    columns: fixedColumns,
    minColumnWidth: _minColumnWidth,
    maxColumns = Infinity,
    tolerance = "normal",
    assignment = "balanced",
    layoutKey,
    onLayout,
    ref,
    style,
    ...rootProps
  } = props;
  const minWidth = checkOptions(props);
  checkCount(count, "count");
  checkCount(initialCount, "initialCount");
  if (!(overscan >= 0)) {
    throw new RangeError(`${ROOT_NAME} overscan cannot be negative, not ${overscan}.`);
  }

  const [root, setRoot] = React.useState<HTMLDivElement | null>(null);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const composedRef = useComposedRefs(ref, setRoot, rootRef);
  const [frame, setFrame] = React.useState<Frame | null>(null);
  const [snapshot, setSnapshot] = React.useState<Snapshot | null>(null);
  const placementRef = React.useRef<VirtualPlacement<React.Key> | null>(null);
  // The elements of the items rendered now, by key.
  const mountedRef = React.useRef(new Map<React.Key, HTMLElement>());
  // Where each rendered key is, for the items that measure themselves as they mount.
  const keyIndexRef = React.useRef(new Map<React.Key, number>());
  const anchorRef = React.useRef<VirtualAnchor<React.Key> | null>(null);
  // Whether heights were measured that no snapshot shows yet.
  const pendingRef = React.useRef(false);
  // Whether the items rendered need measuring again, at a new column width.
  const remeasureRef = React.useRef(false);

  React.useLayoutEffect(() => {
    if (!root) {
      return;
    }
    const measureFrame = (): void => {
      const rootStyle = getOwnerWindow(root).getComputedStyle(root);
      const width = contentBox(root).width;
      const columnGap = pixels(rootStyle.columnGap);
      const columns = fixedColumns ?? countColumns(width, columnGap, minWidth, maxColumns);
      const next: Frame = {
        columns,
        columnWidth: (width - columnGap * (columns - 1)) / columns,
        rowGap: pixels(rootStyle.rowGap),
        tolerance: toleranceIn(tolerance, rootStyle),
      };
      // The root's width is known only once it is in the document.
      // eslint-disable-next-line react/set-state-in-effect
      setFrame(current => (sameFrame(next, current) ? current : next));
    };
    measureFrame();
    let rootWidth = measureElementSize(root).width;
    return observeElementSize(root, (size) => {
      if (size.width !== rootWidth) {
        rootWidth = size.width;
        renderSynchronously(measureFrame);
      }
    });
  }, [root, fixedColumns, minWidth, maxColumns, tolerance]);

  const columnWidth = frame?.columnWidth ?? 0;
  const estimateOf = React.useMemo(
    () => (typeof estimateHeight === "function" ? (index: number) => estimateHeight(index, columnWidth) : () => estimateHeight ?? columnWidth),
    [estimateHeight, columnWidth],
  );

  // Renders the items near the scrollport, where they are placed now.
  const update = useStableCallback((): void => {
    const placement = placementRef.current;
    const element = rootRef.current;
    if (!placement || !element) {
      return;
    }
    // The item holding focus stays rendered, so focus never drops out of the list while it scrolls.
    let focused: number | null = null;
    const item = itemOf(element, element.ownerDocument.activeElement);
    for (const [key, mounted] of item ? mountedRef.current : []) {
      if (mounted === item) {
        const index = placement.indexOf(key, keyIndexRef.current.get(key) ?? -1);
        focused = index === -1 ? null : index;
        break;
      }
    }
    for (;;) {
      const view = viewOf(element);
      const indexes = placement.inRange({ top: view.top - overscan, bottom: view.bottom + overscan }, focused);
      const next: Snapshot = { indexes, placements: indexes.map(index => placement.placement(index)), height: placement.height() };
      if (!sameSnapshot(next, snapshot)) {
        setSnapshot(next);
        return;
      }
      // What is rendered shows these placements already, so the anchor holds right away, and
      // the items in view are looked for again after the scroll.
      const anchor = anchorRef.current;
      anchorRef.current = null;
      if (!anchor || !scrollWithAnchor(element, placement, anchor)) {
        return;
      }
    }
  });

  React.useLayoutEffect(() => {
    if (!root || !frame) {
      return;
    }
    const config: VirtualConfig<React.Key> = {
      columns: frame.columns,
      columnWidth: frame.columnWidth,
      gap: frame.rowGap,
      tolerance: frame.tolerance,
      count,
      keyOf: getItemKey,
      spanOf: getItemSpan,
      estimateOf,
      stable: assignment === "stable",
      layoutKey,
    };
    const placement = placementRef.current;
    if (placement) {
      anchorRef.current ??= anchorFor(root, placement);
      if (placement.configure(config)) {
        remeasureRef.current = true;
      }
    } else {
      placementRef.current = new VirtualPlacement(config);
      remeasureRef.current = true;
    }
    update();
  }, [root, frame, count, getItemKey, getItemSpan, estimateOf, assignment, layoutKey, update]);

  const record = React.useCallback((key: React.Key, element: HTMLElement): void => {
    const placement = placementRef.current;
    const current = rootRef.current;
    if (!placement || !current) {
      return;
    }
    const height = outerHeight(element);
    if (placement.heightOf(key) === height) {
      return;
    }
    anchorRef.current ??= anchorFor(current, placement);
    placement.measure(key, keyIndexRef.current.get(key) ?? -1, height);
    if (pendingRef.current) {
      return;
    }
    pendingRef.current = true;
    // One placement for every height measured together, rendered before paint.
    queueMicrotask(() => {
      pendingRef.current = false;
      renderSynchronously(update);
    });
  }, [update]);

  const measureItem = React.useCallback((key: React.Key, element: HTMLElement) => {
    mountedRef.current.set(key, element);
    record(key, element);
    const stop = observeElementSize(element, () => record(key, element));
    return () => {
      stop();
      if (mountedRef.current.get(key) === element) {
        mountedRef.current.delete(key);
      }
    };
  }, [record]);

  React.useLayoutEffect(() => {
    const placement = placementRef.current;
    if (!root || !placement || !snapshot) {
      return;
    }
    if (remeasureRef.current) {
      remeasureRef.current = false;
      for (const [key, element] of mountedRef.current) {
        record(key, element);
      }
    }
    // Heights measured since this snapshot render again first, and the anchor waits for them.
    if (pendingRef.current) {
      return;
    }
    const anchor = anchorRef.current;
    anchorRef.current = null;
    if (anchor && scrollWithAnchor(root, placement, anchor)) {
      update();
    }
    if (assignment === "stable") {
      for (const index of snapshot.indexes) {
        placement.keep(index);
      }
    }
  }, [root, snapshot, assignment, record, update]);

  React.useEffect(() => {
    if (!root) {
      return;
    }
    const follow = (): void => renderSynchronously(update);
    const stops = [onScrollFrame(root.ownerDocument, follow)];
    const scroller = scrollerOf(root);
    if (scroller) {
      stops.push(observeElementSize(scroller, follow));
    }
    return () => stops.forEach(stop => stop());
  }, [root, update]);

  // An item kept for focus that scrolled away goes once focus has moved on.
  React.useEffect(() => {
    if (!root) {
      return;
    }
    const ownerWindow = getOwnerWindow(root);
    let frame = 0;
    const handleFocusOut = (): void => {
      ownerWindow.cancelAnimationFrame(frame);
      frame = ownerWindow.requestAnimationFrame(() => renderSynchronously(update));
    };
    root.addEventListener("focusout", handleFocusOut);
    return () => {
      ownerWindow.cancelAnimationFrame(frame);
      root.removeEventListener("focusout", handleFocusOut);
    };
  }, [root, update]);

  const handleLayout = useStableCallback(onLayout);
  const reportedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!frame || !snapshot) {
      return;
    }
    const info: MasonryLayoutInfo = { columns: frame.columns, columnWidth: frame.columnWidth, height: snapshot.height, native: false };
    const key = JSON.stringify(info);
    if (key !== reportedRef.current) {
      reportedRef.current = key;
      handleLayout(info);
    }
  }, [frame, snapshot, handleLayout]);

  const items = React.useMemo((): readonly VirtualItemValue[] => {
    const rendered = snapshot
      // Until the next snapshot, a lower count leaves out the items that are gone.
      ? snapshot.indexes.flatMap((index, position) => (index < count ? [{ index, placement: snapshot.placements[position]! }] : []))
      : Array.from({ length: Math.min(count, initialCount) }, (_, index) => ({ index, placement: null }));
    return rendered.map(({ index, placement }) => ({ index, key: getItemKey(index), span: getItemSpan(index), placement }));
  }, [snapshot, count, initialCount, getItemKey, getItemSpan]);
  React.useInsertionEffect(() => {
    keyIndexRef.current = new Map(items.map(item => [item.key, item.index]));
  }, [items]);

  const contextValue = React.useMemo((): MasonryContextValue => ({
    columns: frame?.columns ?? null,
    native: false,
    virtual: true,
    placementOf: unplaced,
    registerItem: unregistered,
    measureItem,
  }), [frame?.columns, measureItem]);

  return (
    <MasonryContext value={contextValue}>
      <Primitive.div
        data-layout="virtual"
        {...rootProps}
        ref={composedRef}
        style={{
          "--xlayout-masonry-columns": frame?.columns,
          "display": "grid",
          "gridTemplateColumns": frame ? `repeat(${frame.columns}, minmax(0, 1fr))` : staticTemplate(fixedColumns, minWidth),
          // Every placed item sits in this one row, moved down by its placement.
          "gridTemplateRows": snapshot ? `${snapshot.height}px` : undefined,
          // The root holds what the reader sees in place itself; the browser's scroll anchoring would fight it.
          "overflowAnchor": "none",
          ...style,
        }}
      >
        {items.map(item => (
          <VirtualItemContext key={item.key} value={item}>{children(item.index)}</VirtualItemContext>
        ))}
      </Primitive.div>
    </MasonryContext>
  );
}

export interface MasonryItemProps extends PrimitiveProps<"div"> {
  /** Columns the item spans; in a virtual root, `getItemSpan` gives it instead. @default 1 */
  span?: number;
}

/**
 * One item of the layout. It is marked `data-placed` one frame after it first got its place,
 * so a transition on `translate` animates later moves without animating the first one.
 */
function MasonryItem(props: MasonryItemProps): React.ReactNode {
  const { span: spanProp, ref, style, ...itemProps } = props;
  const context = useMasonryContext(ITEM_NAME);
  const virtualItem = React.use(VirtualItemContext);
  // A list root inside a virtual item places its own items.
  const virtual = context.virtual ? virtualItem : null;
  if (virtual && spanProp !== undefined) {
    throw new Error(`${ITEM_NAME} in a virtual ${ROOT_NAME} takes its span from getItemSpan; give it no span.`);
  }
  const span = virtual ? virtual.span : spanProp ?? 1;
  if (!Number.isInteger(span) || span < 1) {
    throw new RangeError(`${ITEM_NAME} span must be a whole number of at least 1, not ${span}.`);
  }
  const [element, setElement] = React.useState<HTMLDivElement | null>(null);
  const { registerItem, measureItem } = context;
  const virtualKey = virtual?.key;
  // Registering from the ref puts the item into the root's next render.
  const register = React.useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) {
        return undefined;
      }
      return virtualKey === undefined ? registerItem({ element: node, span }) : measureItem(virtualKey, node);
    },
    [registerItem, measureItem, span, virtualKey],
  );
  const composedRef = useComposedRefs(ref, setElement, register);
  const placement = virtual ? virtual.placement ?? undefined : context.placementOf(element);
  const covered = context.columns === null ? span : Math.min(span, context.columns);
  const ready = context.native || placement !== undefined;
  const [placed, setPlaced] = React.useState(false);
  React.useEffect(() => {
    if (!ready || placed || !element) {
      return;
    }
    const ownerWindow = getOwnerWindow(element);
    const frame = ownerWindow.requestAnimationFrame(() => setPlaced(true));
    return () => ownerWindow.cancelAnimationFrame(frame);
  }, [ready, placed, element]);
  return (
    <Primitive.div
      data-placed={placed ? "" : undefined}
      data-index={virtual?.index}
      {...itemProps}
      ref={composedRef}
      style={{
        ...(placement
          ? { gridColumn: `${placement.column + 1} / span ${covered}`, gridRow: "1", alignSelf: "start", translate: `0 ${placement.y}px` }
          : { gridColumn: `span ${covered}` }),
        ...style,
      }}
    />
  );
}

export {
  MasonryItem as Item,
  Masonry,
  MasonryItem,
  Masonry as Root,
};
