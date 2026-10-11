"use client";

import type { PrimitiveProps } from "../shared/primitive";
import type { GroupMember, StickyContextValue, StickyGroupContextValue } from "./context";
import type { PhysicalSide, StickySide } from "./types";
import * as React from "react";
import { useComposedRefs } from "../shared/compose-refs";
import { getOwnerWindow } from "../shared/dom";
import { renderSynchronously } from "../shared/flush";
import { Primitive } from "../shared/primitive";
import { measureElementSize, observeElementSize } from "../shared/resize-observer";
import { onScrollFrame } from "../shared/scroll";
import { useStableCallback } from "../shared/use-stable-callback";
import { PHYSICAL_SIDES, ROOT_NAME } from "./constants";
import { StickyContext, StickyGroupContext } from "./context";
import { measureStaticOffset, offsetWithin, referenceOf, resolvedInset } from "./measure";
import { resolveSides, stuckSides } from "./sides";
import { stackLayers } from "./stack";

const NOT_STUCK: readonly StickySide[] = [];

/** Below this, placements differ only by how browsers round lengths. */
const PLACEMENT_TOLERANCE = 0.1;

const INSET_PROPERTIES = {
  "top": "top",
  "right": "right",
  "bottom": "bottom",
  "left": "left",
  "inline-start": "insetInlineStart",
  "inline-end": "insetInlineEnd",
} as const satisfies Record<StickySide, keyof React.CSSProperties>;

function sameSides(a: readonly StickySide[], b: readonly StickySide[]): boolean {
  return a.length === b.length && a.every((side, index) => side === b[index]);
}

function directionOf(element: Element): "ltr" | "rtl" {
  return getOwnerWindow(element).getComputedStyle(element).direction === "rtl" ? "rtl" : "ltr";
}

export interface StickyProps extends PrimitiveProps<"div"> {
  /** The sides the element sticks to; inline sides follow the element's direction. @default "top" */
  side?: StickySide | readonly StickySide[];
  /** Distance from the edge it sticks to, in pixels or as a CSS length. @default 0 */
  offset?: number | string;
  /** Inside a `Sticky.Group`, the element sticks past every lower layer. @default 0 */
  layer?: number;
  /** Called with the sides the element is stuck to whenever they change. */
  onStuckChange?: (sides: StickySide[]) => void;
}

function Sticky(props: StickyProps): React.ReactNode {
  const { side = "top", offset = 0, layer = 0, onStuckChange, ref, style, ...stickyProps } = props;
  // A key keeps an array written inline from counting as a change on every render.
  const sideNames = (typeof side === "string" ? [side] : side).join(" ");
  const sides = React.useMemo(() => sideNames.split(" ") as StickySide[], [sideNames]);
  const length = typeof offset === "number" ? `${offset}px` : offset;
  const group = React.use(StickyGroupContext);
  const joinGroup = group?.register;
  const [element, setElement] = React.useState<HTMLElement | null>(null);
  // Joining from the ref puts the element into the group's next render.
  const join = React.useCallback(
    (node: HTMLElement | null) => (node && joinGroup ? joinGroup({ element: node, layer, sides, offset: length }) : undefined),
    [joinGroup, layer, sides, length],
  );
  const composedRef = useComposedRefs(ref, setElement, join);

  const insets: React.CSSProperties = {};
  for (const name of sides) {
    const stacked = group ? group.offsetOf(element, name) : 0;
    insets[INSET_PROPERTIES[name]] = stacked === 0 ? length : `calc(${length} + ${stacked}px)`;
  }
  const insetKey = sides.map(name => insets[INSET_PROPERTIES[name]]).join(" ");

  const [stuck, setStuck] = React.useState(NOT_STUCK);
  const stuckRef = React.useRef(NOT_STUCK);

  React.useLayoutEffect(() => {
    if (element && typeof offset === "string" && !getOwnerWindow(element).CSS.supports("top", offset)) {
      throw new Error(`${ROOT_NAME} offset "${offset}" is not a CSS length.`);
    }
  }, [element, offset]);

  React.useLayoutEffect(() => {
    if (!element) {
      return;
    }
    resolveSides(sides, directionOf(element));
    const reference = referenceOf(element);
    let staticOffset = measureStaticOffset(element, reference);
    let tracking = true;
    const read = (): readonly StickySide[] => {
      const current = offsetWithin(element, reference);
      const displacement = { x: current.x - staticOffset.x, y: current.y - staticOffset.y };
      return stuckSides(displacement, resolveSides(sides, directionOf(element)));
    };
    const update = (): void => {
      const next = read();
      if (!sameSides(next, stuckRef.current)) {
        stuckRef.current = next;
        renderSynchronously(() => setStuck(next));
      }
    };

    let pending = false;
    const remeasure = (): void => {
      if (pending) {
        return;
      }
      pending = true;
      // One measurement for every size reported in the same callback.
      queueMicrotask(() => {
        pending = false;
        if (tracking) {
          staticOffset = measureStaticOffset(element, reference);
          update();
        }
      });
    };
    // Where the element sits in normal flow changes when anything beside it resizes, or
    // when siblings come and go.
    let stopObserving: (() => void)[] = [];
    const observeSiblings = (): void => {
      stopObserving.forEach(stop => stop());
      stopObserving = [reference, ...reference.children].map(node => observeElementSize(node, remeasure));
    };
    observeSiblings();
    const mutationObserver = new MutationObserver(() => {
      observeSiblings();
      remeasure();
    });
    mutationObserver.observe(reference, { childList: true });
    const stopScrolling = onScrollFrame(element.ownerDocument, update);

    const initial = read();
    stuckRef.current = initial;
    // Measuring in a layout effect shows the stuck state before the first paint.
    // eslint-disable-next-line react/set-state-in-effect
    setStuck(initial);
    return () => {
      tracking = false;
      stopScrolling();
      mutationObserver.disconnect();
      stopObserving.forEach(stop => stop());
    };
  }, [element, sides, insetKey]);

  const handleStuckChange = useStableCallback(onStuckChange);
  const reportedRef = React.useRef("");
  React.useEffect(() => {
    const key = stuck.join(" ");
    if (key !== reportedRef.current) {
      reportedRef.current = key;
      handleStuckChange([...stuck]);
    }
  }, [stuck, handleStuckChange]);

  const contextValue = React.useMemo((): StickyContextValue => ({ stuckSides: stuck }), [stuck]);

  return (
    <StickyContext value={contextValue}>
      <Primitive.div
        data-side={sideNames}
        data-stuck={stuck.length > 0 ? stuck.join(" ") : undefined}
        {...stickyProps}
        ref={composedRef}
        style={{ position: "sticky", overflowAnchor: "none", ...insets, ...style }}
      />
    </StickyContext>
  );
}

interface Placement {
  /** Each member's distance from the lower layers, by the side names it was given. */
  offsets: ReadonlyMap<HTMLElement, Partial<Record<StickySide, number>>>;
  extents: Record<PhysicalSide, number>;
}

const EMPTY_PLACEMENT: Placement = { offsets: new Map(), extents: { top: 0, right: 0, bottom: 0, left: 0 } };

function placeMembers(members: readonly GroupMember[], current: Placement): Placement {
  const offsets = new Map<HTMLElement, Partial<Record<StickySide, number>>>();
  const extents = { ...EMPTY_PLACEMENT.extents };
  const resolved = members.map(member => ({
    member,
    sides: resolveSides(member.sides, directionOf(member.element)),
    size: measureElementSize(member.element),
  }));
  for (const physical of PHYSICAL_SIDES) {
    const along = resolved.flatMap(({ member, sides, size }) => {
      const side = sides.find(entry => entry.physical === physical)?.side;
      return side === undefined ? [] : [{ member, side, size }];
    });
    const stack = stackLayers(along.map(({ member, side, size }) => ({
      key: member.element,
      layer: member.layer,
      // The inset on screen includes the distance the group added the last time.
      offset: resolvedInset(member.element, physical) - (current.offsets.get(member.element)?.[side] ?? 0),
      size: physical === "top" || physical === "bottom" ? size.height : size.width,
    })));
    for (const { member, side } of along) {
      offsets.set(member.element, { ...offsets.get(member.element), [side]: stack.offsets.get(member.element) });
    }
    extents[physical] = stack.extent;
  }
  return { offsets, extents };
}

function samePlacement(a: Placement, b: Placement): boolean {
  const close = (x: number | undefined, y: number | undefined): boolean => (
    x === undefined || y === undefined ? x === y : Math.abs(x - y) < PLACEMENT_TOLERANCE
  );
  if (a.offsets.size !== b.offsets.size || PHYSICAL_SIDES.some(side => !close(a.extents[side], b.extents[side]))) {
    return false;
  }
  return [...a.offsets].every(([element, offsets]) => {
    const other = b.offsets.get(element);
    const names = new Set([...Object.keys(offsets), ...Object.keys(other ?? {})]) as Set<StickySide>;
    return other !== undefined && [...names].every(name => close(offsets[name], other[name]));
  });
}

export interface StickyGroupProps extends PrimitiveProps<"div"> {}

/**
 * Stacks the sticky elements inside it by layer, so a toolbar sticks below a header rather
 * than under it. How far each side's stack reaches is exposed as `--xlayout-sticky-top`,
 * `-right`, `-bottom` and `-left`, for example for `scroll-margin-top`.
 */
function StickyGroup(props: StickyGroupProps): React.ReactNode {
  const { ref, style, ...groupProps } = props;
  const [members, setMembers] = React.useState<readonly GroupMember[]>([]);
  const [placement, setPlacement] = React.useState(EMPTY_PLACEMENT);
  // Counts size changes of members; each one places them again.
  const [resizeCount, setResizeCount] = React.useState(0);

  const register = React.useCallback((member: GroupMember) => {
    setMembers(current => [...current, member]);
    return () => setMembers(current => current.filter(existing => existing !== member));
  }, []);

  React.useLayoutEffect(() => {
    const next = placeMembers(members, placement);
    if (!samePlacement(next, placement)) {
      // Placing in a layout effect stacks the members before the first paint.
      // eslint-disable-next-line react/set-state-in-effect
      setPlacement(next);
    }
  }, [members, placement, resizeCount]);

  React.useLayoutEffect(() => {
    let pending = false;
    let observing = true;
    const remeasure = (): void => {
      if (pending) {
        return;
      }
      pending = true;
      queueMicrotask(() => {
        pending = false;
        if (observing) {
          renderSynchronously(() => setResizeCount(count => count + 1));
        }
      });
    };
    const stops = members.map(member => observeElementSize(member.element, remeasure));
    return () => {
      observing = false;
      stops.forEach(stop => stop());
    };
  }, [members]);

  const offsetOf = React.useCallback(
    (element: HTMLElement | null, side: StickySide) => (element ? placement.offsets.get(element)?.[side] ?? 0 : 0),
    [placement],
  );
  const contextValue = React.useMemo((): StickyGroupContextValue => ({ register, offsetOf }), [register, offsetOf]);

  return (
    <StickyGroupContext value={contextValue}>
      <Primitive.div
        {...groupProps}
        ref={ref}
        style={{
          "--xlayout-sticky-top": `${placement.extents.top}px`,
          "--xlayout-sticky-right": `${placement.extents.right}px`,
          "--xlayout-sticky-bottom": `${placement.extents.bottom}px`,
          "--xlayout-sticky-left": `${placement.extents.left}px`,
          ...style,
        }}
      />
    </StickyGroupContext>
  );
}

export {
  StickyGroup as Group,
  Sticky as Root,
  Sticky,
  StickyGroup,
};
