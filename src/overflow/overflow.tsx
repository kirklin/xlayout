import type { PrimitiveProps } from "../shared/primitive";
import type { Direction, Orientation } from "../shared/types";
import type { DividerEntry, ItemEntry, OverflowContextValue } from "./context";
import type { PartBox } from "./measure";
import type { FitResult, OverflowDirection, OverflowGroupState, OverflowState } from "./types";
import { useDirection } from "@radix-ui/react-direction";
import * as React from "react";
import { useComposedRefs } from "../shared/compose-refs";
import { reorderByDocumentPosition, sortByDocumentPosition } from "../shared/dom";
import { renderSynchronously } from "../shared/flush";
import { Primitive } from "../shared/primitive";
import { observeElementSize } from "../shared/resize-observer";
import { useStableCallback } from "../shared/use-stable-callback";
import { DIVIDER_NAME, HIDDEN_STYLES, INDICATOR_NAME, ITEM_NAME, LAYOUT_TOLERANCE, ROOT_NAME } from "./constants";
import { OverflowContext, useOverflowContext } from "./context";
import { describeOverflow, fitItems } from "./fit";
import { assertLineHoldsOnlyParts, assertSizeIndependentOfContent, contentSize, measurePart, readGap } from "./measure";

const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]";

interface MeasuredPart {
  element: HTMLElement;
  box: PartBox;
  /** Whether the part is on the line in the current layout. */
  onLine: boolean;
}

function sameResult(a: FitResult, b: FitResult | null): boolean {
  return b !== null
    && a.indicatorVisible === b.indicatorVisible
    && a.visible.size === b.visible.size
    && [...a.visible].every(value => b.visible.has(value));
}

function precedes(a: Element, b: Element): boolean {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

/** Focuses `element` or the first focusable element in it, and tells whether focus got there. */
function focusWithin(element: HTMLElement): boolean {
  const target = element.matches(FOCUSABLE) ? element : element.querySelector<HTMLElement>(FOCUSABLE);
  target?.focus({ preventScroll: true });
  return target !== null && element.ownerDocument.activeElement === target;
}

export interface OverflowProps extends Omit<PrimitiveProps<"div">, "dir"> {
  /** @default "horizontal" */
  orientation?: Orientation;
  /** Which end loses items first when their priorities are equal. @default "end" */
  overflowDirection?: OverflowDirection;
  /** Items that stay visible however little space there is. @default 0 */
  minimumVisible?: number;
  /** Keeps room for the indicator even while everything fits. @default false */
  reserveIndicator?: boolean;
  onOverflowChange?: (state: OverflowState) => void;
  /** Reading direction; inherits from a direction provider when omitted. */
  dir?: Direction;
}

function Overflow(props: OverflowProps): React.ReactNode {
  const {
    orientation = "horizontal",
    overflowDirection = "end",
    minimumVisible = 0,
    reserveIndicator = false,
    onOverflowChange,
    dir,
    ref,
    style,
    ...rootProps
  } = props;
  const direction = useDirection(dir);
  const [root, setRoot] = React.useState<HTMLDivElement | null>(null);
  const composedRef = useComposedRefs(ref, setRoot);
  const [items, setItems] = React.useState<readonly ItemEntry[]>([]);
  const [dividers, setDividers] = React.useState<readonly DividerEntry[]>([]);
  const [indicator, setIndicator] = React.useState<HTMLElement | null>(null);
  const [result, setResult] = React.useState<FitResult | null>(null);
  // Counts size changes of the root and its parts; each one measures the line again.
  const [resizeCount, setResizeCount] = React.useState(0);
  const explicitMarginsRef = React.useRef(new WeakMap<Element, number>());
  const focusLeavingRef = React.useRef<HTMLElement | null>(null);
  const horizontal = orientation === "horizontal";

  const visible = React.useMemo(() => result?.visible ?? new Set(items.map(entry => entry.value)), [result, items]);
  const state = React.useMemo(() => describeOverflow(items, visible), [items, visible]);
  const hiddenValues = React.useMemo(() => new Set(state.hidden), [state]);
  const indicatorVisible = result?.indicatorVisible ?? false;
  // A divider whose group has no items has nothing to separate.
  const groupState = React.useCallback((group: string): OverflowGroupState => state.groups[group] ?? "hidden", [state]);

  // Focus leaves a part that just hid for the indicator, which now holds the hidden items, or
  // for the nearest item that still shows.
  React.useLayoutEffect(() => {
    const leaving = focusLeavingRef.current;
    focusLeavingRef.current = null;
    if (!leaving) {
      return;
    }
    const shownItems = items.filter(entry => visible.has(entry.value)).map(entry => entry.element);
    const candidates = [
      ...(indicator && indicatorVisible && indicator !== leaving ? [indicator] : []),
      ...shownItems.filter(element => precedes(element, leaving)).reverse(),
      ...shownItems.filter(element => precedes(leaving, element)),
    ];
    for (const candidate of candidates) {
      if (focusWithin(candidate)) {
        return;
      }
    }
  }, [items, indicator, visible, indicatorVisible]);

  React.useLayoutEffect(() => {
    if (root && result) {
      assertSizeIndependentOfContent(root, horizontal);
    }
  }, [root, horizontal, result]);

  React.useLayoutEffect(() => {
    if (!root) {
      return;
    }
    assertLineHoldsOnlyParts(root, new Set<Element>([
      ...items.map(entry => entry.element),
      ...dividers.map(entry => entry.element),
      ...(indicator ? [indicator] : []),
    ]));
    const measure = (element: HTMLElement, partName: string, onLine: boolean): MeasuredPart => (
      { element, box: measurePart(element, horizontal, partName), onLine }
    );
    const itemParts = items.map(entry => ({ entry, part: measure(entry.element, ITEM_NAME, visible.has(entry.value)) }));
    const dividerParts = dividers.map(entry => ({ entry, part: measure(entry.element, DIVIDER_NAME, groupState(entry.group) !== "hidden") }));
    const indicatorPart = indicator ? measure(indicator, INDICATOR_NAME, indicatorVisible) : null;
    const parts = [...itemParts.map(({ part }) => part), ...dividerParts.map(({ part }) => part), ...(indicatorPart ? [indicatorPart] : [])];

    const available = contentSize(root, horizontal);
    const gap = readGap(root, horizontal);
    const onLine = parts.filter(part => part.onLine);
    const lineSize = onLine.reduce((total, part) => total + part.box.size + part.box.margins, 0) + gap * Math.max(0, onLine.length - 1);
    // Auto margins take the space a line leaves over, which no part needs. Used margins are the
    // explicit ones on hidden parts, on a line that overflows and on a line that leaves space
    // over; only a line that ends exactly at the root's end can hide auto margins in them.
    const explicitMargins = explicitMarginsRef.current;
    const marginsKnown = Math.abs(lineSize - available) > LAYOUT_TOLERANCE;
    for (const part of parts) {
      if (marginsKnown || !part.onLine) {
        explicitMargins.set(part.element, part.box.margins);
      }
    }
    const spaceOf = (part: MeasuredPart): number => part.box.size + (explicitMargins.get(part.element) ?? part.box.margins);

    const fit = fitItems({
      available,
      gap,
      items: itemParts.map(({ entry, part }) => ({
        value: entry.value,
        size: spaceOf(part),
        priority: entry.priority,
        pinned: entry.pinned,
        group: entry.group,
      })),
      dividers: dividerParts.map(({ entry, part }) => ({ group: entry.group, size: spaceOf(part) })),
      indicatorSize: indicatorPart ? spaceOf(indicatorPart) : 0,
      minimumVisible,
      overflowDirection,
      reserveIndicator,
    });
    if (sameResult(fit, result)) {
      return;
    }
    const active = root.ownerDocument.activeElement;
    if (active) {
      const leavingItem = items.find(entry => visible.has(entry.value) && !fit.visible.has(entry.value) && entry.element.contains(active));
      const leavingIndicator = indicator && indicatorVisible && !fit.indicatorVisible && indicator.contains(active) ? indicator : null;
      focusLeavingRef.current = leavingItem?.element ?? leavingIndicator;
    }
    // Measuring in a layout effect applies the fit before the first paint.
    // eslint-disable-next-line react/set-state-in-effect
    setResult(fit);
  }, [root, items, dividers, indicator, horizontal, overflowDirection, minimumVisible, reserveIndicator, result, visible, indicatorVisible, groupState, resizeCount]);

  React.useLayoutEffect(() => {
    if (!root) {
      return;
    }
    let pending = false;
    let subscribed = true;
    const remeasure = (): void => {
      if (pending) {
        return;
      }
      pending = true;
      // One measurement for every element reported in the same callback, rendered before paint.
      queueMicrotask(() => {
        pending = false;
        if (subscribed) {
          renderSynchronously(() => setResizeCount(count => count + 1));
        }
      });
    };
    const elements = [root, ...items.map(entry => entry.element), ...dividers.map(entry => entry.element), ...(indicator ? [indicator] : [])];
    const stops = elements.map(element => observeElementSize(element, remeasure));
    return () => {
      subscribed = false;
      stops.forEach(stop => stop());
    };
  }, [root, items, dividers, indicator]);

  // Parts keep their order when React moves their elements.
  React.useEffect(() => {
    if (!root) {
      return;
    }
    const observer = new MutationObserver(() => {
      renderSynchronously(() => {
        setItems(reorderByDocumentPosition);
        setDividers(reorderByDocumentPosition);
      });
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [root]);

  const registerItem = React.useCallback((entry: ItemEntry) => {
    setItems((current) => {
      if (current.some(existing => existing.value === entry.value)) {
        throw new Error(`${ROOT_NAME} already has an item with the value "${entry.value}".`);
      }
      return sortByDocumentPosition([...current, entry]);
    });
    return () => setItems(current => current.filter(existing => existing !== entry));
  }, []);

  const registerDivider = React.useCallback((entry: DividerEntry) => {
    setDividers(current => sortByDocumentPosition([...current, entry]));
    return () => setDividers(current => current.filter(existing => existing !== entry));
  }, []);

  const registerIndicator = React.useCallback((element: HTMLElement) => {
    setIndicator((current) => {
      if (current && current !== element) {
        throw new Error(`${ROOT_NAME} can only have one ${INDICATOR_NAME}.`);
      }
      return element;
    });
    return () => setIndicator(current => (current === element ? null : current));
  }, []);

  const handleOverflowChange = useStableCallback(onOverflowChange);
  const reportedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (result === null) {
      return;
    }
    const key = JSON.stringify(state);
    if (reportedRef.current !== key) {
      reportedRef.current = key;
      handleOverflowChange(state);
    }
  }, [result, state, handleOverflowChange]);

  const contextValue = React.useMemo((): OverflowContextValue => ({
    orientation,
    state,
    indicatorVisible,
    hiddenValues,
    registerItem,
    registerDivider,
    registerIndicator,
    groupState,
  }), [orientation, state, indicatorVisible, hiddenValues, registerItem, registerDivider, registerIndicator, groupState]);

  return (
    <OverflowContext value={contextValue}>
      <Primitive.div
        dir={direction}
        data-orientation={orientation}
        data-overflowing={state.hidden.length > 0 ? "" : undefined}
        {...rootProps}
        ref={composedRef}
        style={{
          "--xlayout-overflow-hidden-count": state.hidden.length,
          "display": "flex",
          "flexDirection": horizontal ? "row" : "column",
          "flexWrap": "nowrap",
          "position": "relative",
          // As a flex or grid item, the root would otherwise never shrink below its items.
          "minWidth": horizontal ? 0 : undefined,
          "minHeight": horizontal ? undefined : 0,
          // Items past the end, as on the server before anything is measured, must not make
          // ancestors scroll.
          "overflowX": horizontal ? "clip" : undefined,
          "overflowY": horizontal ? undefined : "clip",
          ...style,
        }}
      />
    </OverflowContext>
  );
}

export interface OverflowItemProps extends PrimitiveProps<"div"> {
  /** Identifies the item in overflow state. */
  value: string;
  /** Higher priorities stay visible longer. @default 0 */
  priority?: number;
  /** Never hides the item. */
  pinned?: boolean;
  /** Group the item belongs to, for `Overflow.Divider` and group state. */
  group?: string;
}

function OverflowItem(props: OverflowItemProps): React.ReactNode {
  const { value, priority = 0, pinned = false, group, ref, style, ...itemProps } = props;
  const context = useOverflowContext(ITEM_NAME);
  const { registerItem } = context;
  // Registering from the ref puts the item into the root's next render, so the first fit sees it.
  const register = React.useCallback(
    (element: HTMLDivElement | null) => (element ? registerItem({ value, element, priority, pinned, group }) : undefined),
    [registerItem, value, priority, pinned, group],
  );
  const composedRef = useComposedRefs(ref, register);
  const hidden = context.hiddenValues.has(value);
  return (
    <Primitive.div
      data-state={hidden ? "hidden" : "visible"}
      data-pinned={pinned ? "" : undefined}
      inert={hidden || undefined}
      {...itemProps}
      ref={composedRef}
      style={{ flexShrink: 0, ...style, ...(hidden ? HIDDEN_STYLES[context.orientation] : null) }}
    />
  );
}

export interface OverflowDividerProps extends PrimitiveProps<"div"> {
  /** The group this divider belongs to; it disappears with the group's last item. */
  group: string;
}

function OverflowDivider(props: OverflowDividerProps): React.ReactNode {
  const { group, ref, style, ...dividerProps } = props;
  const context = useOverflowContext(DIVIDER_NAME);
  const { registerDivider } = context;
  const register = React.useCallback(
    (element: HTMLDivElement | null) => (element ? registerDivider({ group, element }) : undefined),
    [registerDivider, group],
  );
  const composedRef = useComposedRefs(ref, register);
  const groupState = context.groupState(group);
  const hidden = groupState === "hidden";
  return (
    <Primitive.div
      data-state={hidden ? "hidden" : "visible"}
      data-group-state={groupState}
      inert={hidden || undefined}
      {...dividerProps}
      ref={composedRef}
      style={{ flexShrink: 0, ...style, ...(hidden ? HIDDEN_STYLES[context.orientation] : null) }}
    />
  );
}

export interface OverflowIndicatorProps extends PrimitiveProps<"div"> {}

/** Shown while items are hidden; usually the trigger of a menu that lists them. */
function OverflowIndicator(props: OverflowIndicatorProps): React.ReactNode {
  const { ref, style, ...indicatorProps } = props;
  const context = useOverflowContext(INDICATOR_NAME);
  const { registerIndicator } = context;
  const register = React.useCallback(
    (element: HTMLDivElement | null) => (element ? registerIndicator(element) : undefined),
    [registerIndicator],
  );
  const composedRef = useComposedRefs(ref, register);
  const hidden = !context.indicatorVisible;
  return (
    <Primitive.div
      data-state={hidden ? "hidden" : "visible"}
      inert={hidden || undefined}
      {...indicatorProps}
      ref={composedRef}
      style={{ flexShrink: 0, ...style, ...(hidden ? HIDDEN_STYLES[context.orientation] : null) }}
    />
  );
}

export {
  OverflowDivider as Divider,
  OverflowIndicator as Indicator,
  OverflowItem as Item,
  Overflow,
  OverflowDivider,
  OverflowIndicator,
  OverflowItem,
  Overflow as Root,
};
