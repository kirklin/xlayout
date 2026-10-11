import type { PrimitiveProps } from "../shared/primitive";
import type { ItemEntry, MasonryContextValue } from "./context";
import type { MasonryAssignment, MasonryLayoutInfo, MasonryNative, MasonryPlacement, MasonryTolerance } from "./types";
import * as React from "react";
import { useComposedRefs } from "../shared/compose-refs";
import { getOwnerWindow, reorderByDocumentPosition, sortByDocumentPosition } from "../shared/dom";
import { renderSynchronously } from "../shared/flush";
import { Primitive } from "../shared/primitive";
import { measureElementSize, observeElementSize } from "../shared/resize-observer";
import { useStableCallback } from "../shared/use-stable-callback";
import { DEFAULT_MIN_COLUMN_WIDTH, ITEM_NAME, NATIVE_TOLERANCE_PROPERTIES, ROOT_NAME } from "./constants";
import { MasonryContext, useMasonryContext } from "./context";
import { computeMasonryLayout, countColumns } from "./place";

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

export interface MasonryProps extends PrimitiveProps<"div"> {
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
  /** @default "auto" */
  native?: MasonryNative;
  /** Called after each change to the column count, the column width or the height. */
  onLayout?: (layout: MasonryLayoutInfo) => void;
}

/**
 * Lays items out in columns, each item going to the column that ends highest. Gaps come from
 * the root's `column-gap` and `row-gap`. Where the browser has `display: grid-lanes` it does the
 * placing; elsewhere items are placed by script, horizontally by the grid and vertically with
 * `translate`. Before the first measurement, as on the server, the items form a plain grid.
 */
function Masonry(props: MasonryProps): React.ReactNode {
  const {
    columns: fixedColumns,
    minColumnWidth,
    maxColumns = Infinity,
    tolerance = "normal",
    assignment = "balanced",
    layoutKey,
    native = "auto",
    onLayout,
    ref,
    style,
    ...rootProps
  } = props;
  if (fixedColumns !== undefined && minColumnWidth !== undefined) {
    throw new Error(`${ROOT_NAME} takes columns or minColumnWidth; give only one of them.`);
  }
  if (fixedColumns !== undefined && (!Number.isInteger(fixedColumns) || fixedColumns < 1)) {
    throw new RangeError(`${ROOT_NAME} columns must be a whole number of at least 1, not ${fixedColumns}.`);
  }
  const minWidth = minColumnWidth ?? DEFAULT_MIN_COLUMN_WIDTH;
  if (!(minWidth > 0) || !(maxColumns >= 1)) {
    throw new RangeError(`${ROOT_NAME} needs a minColumnWidth above 0 and maxColumns of at least 1.`);
  }
  if (typeof tolerance === "number" && !(tolerance >= 0)) {
    throw new RangeError(`${ROOT_NAME} tolerance cannot be negative, not ${tolerance}.`);
  }

  const [root, setRoot] = React.useState<HTMLDivElement | null>(null);
  const composedRef = useComposedRefs(ref, setRoot);
  const [items, setItems] = React.useState<readonly ItemEntry[]>([]);
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
      tolerance: tolerance === "infinite" ? Infinity : tolerance === "normal" ? pixels(rootStyle.fontSize) : tolerance,
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
          setItems(reorderByDocumentPosition);
          setResizeCount(count => count + 1);
        });
      }
    });
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class"] });
    return () => observer.disconnect();
  }, [root]);

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

  const registerItem = React.useCallback((entry: ItemEntry) => {
    setItems(current => sortByDocumentPosition([...current, entry]));
    return () => setItems(current => current.filter(existing => existing !== entry));
  }, []);

  const placements = layout?.placements ?? null;
  const placementOf = React.useCallback(
    (element: HTMLElement | null) => (element && placements ? placements.get(element) : undefined),
    [placements],
  );
  const contextValue = React.useMemo((): MasonryContextValue => ({
    columns: layout?.columns ?? null,
    native: layout?.native ?? false,
    placementOf,
    registerItem,
  }), [layout?.columns, layout?.native, placementOf, registerItem]);

  const staticTemplate = fixedColumns === undefined
    ? `repeat(auto-fill, minmax(min(${minWidth}px, 100%), 1fr))`
    : `repeat(${fixedColumns}, minmax(0, 1fr))`;
  return (
    <MasonryContext value={contextValue}>
      <Primitive.div
        data-layout={layout === null ? undefined : layout.native ? "native" : "script"}
        {...rootProps}
        ref={composedRef}
        style={{
          "--xlayout-masonry-columns": layout?.columns,
          "display": layout?.native ? "grid-lanes" : "grid",
          "gridTemplateColumns": layout ? `repeat(${layout.columns}, minmax(0, 1fr))` : staticTemplate,
          // Every placed item sits in this one row, moved down by its placement.
          "gridTemplateRows": placements ? `${layout?.height}px` : undefined,
          ...style,
        }}
      />
    </MasonryContext>
  );
}

export interface MasonryItemProps extends PrimitiveProps<"div"> {
  /** Columns the item spans. @default 1 */
  span?: number;
}

/**
 * One item of the layout. It is marked `data-placed` one frame after it first got its place,
 * so a transition on `translate` animates later moves without animating the first one.
 */
function MasonryItem(props: MasonryItemProps): React.ReactNode {
  const { span = 1, ref, style, ...itemProps } = props;
  if (!Number.isInteger(span) || span < 1) {
    throw new RangeError(`${ITEM_NAME} span must be a whole number of at least 1, not ${span}.`);
  }
  const context = useMasonryContext(ITEM_NAME);
  const [element, setElement] = React.useState<HTMLDivElement | null>(null);
  const { registerItem } = context;
  // Registering from the ref puts the item into the root's next render.
  const register = React.useCallback(
    (node: HTMLDivElement | null) => (node ? registerItem({ element: node, span }) : undefined),
    [registerItem, span],
  );
  const composedRef = useComposedRefs(ref, setElement, register);
  const placement = context.placementOf(element);
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
