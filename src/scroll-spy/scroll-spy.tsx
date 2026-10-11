"use client";

import type { PrimitiveProps } from "../shared/primitive";
import type { Store } from "../shared/store";
import type { Rect } from "../shared/types";
import type { ItemContextValue, ItemEntry, NavContextValue, ScrollSpyContextValue, SectionEntry, SpyState } from "./context";
import type { PreparedPositions } from "./select";
import type { ScrollSpyFallback, ScrollSpyNavigation, SectionGeometry } from "./types";
import * as React from "react";
import { useComposedRefs } from "../shared/compose-refs";
import { getOwnerWindow, isEditableTarget, sortByDocumentPosition } from "../shared/dom";
import { composeEventHandlers } from "../shared/events";
import { renderSynchronously } from "../shared/flush";
import { Primitive } from "../shared/primitive";
import { useRegistry } from "../shared/registry";
import { observeElementSize } from "../shared/resize-observer";
import { onScrollFrame, revealWithin } from "../shared/scroll";
import { createStore, useStoreSelector } from "../shared/store";
import { useControllableState } from "../shared/use-controllable-state";
import { useStableCallback } from "../shared/use-stable-callback";
import {
  HASH_SYNC_DELAY,
  ITEM_NAME,
  LINK_NAME,
  LIST_NAME,
  NAV_NAME,
  NAVIGATION_SETTLE_TIME,
  ROOT_NAME,
  SCROLL_KEYS,
  SECTION_NAME,
} from "./constants";
import { ItemContext, NavContext, ScrollSpyContext, useScrollSpyContext } from "./context";
import { boxWithin, measureSections, scrollerOf, sectionsStayed } from "./measure";
import { countUpTo, preparePositions, redistributePositions, selectPrepared } from "./select";

interface SectionView {
  visible: ReadonlySet<string>;
  passed: ReadonlySet<string>;
}

const EMPTY_VIEW: SectionView = { visible: new Set(), passed: new Set() };

/** The sections' places put in order once, so a scroll position needs only searching them. */
interface SectionOrder {
  positions: PreparedPositions;
  /** Where the sections start, and where they end, each ascending. */
  tops: Float64Array;
  bottoms: Float64Array;
}

function orderOf(geometry: SectionGeometry): SectionOrder {
  return {
    positions: preparePositions(redistributePositions(geometry.positions, geometry.scrollportSize, geometry.scrollRange)),
    tops: Float64Array.from(geometry.tops).sort(),
    bottoms: Float64Array.from(geometry.bottoms).sort(),
  };
}

const ACTIVE = 1;
const VISIBLE = 2;
const PASSED = 4;
const IN_TRAIL = 8;

/** What the state says of the section with `value`, as the flags above. */
function flagsOf(state: SpyState, value: string): number {
  return (state.active === value ? ACTIVE : 0)
    | (state.visible.has(value) ? VISIBLE : 0)
    | (state.passed.has(value) ? PASSED : 0)
    | (state.trail.has(value) ? IN_TRAIL : 0);
}

/** The flags in `mask` of the section with `value`; the part renders again only when they change. */
function useFlags(state: Store<SpyState>, value: string, mask: number): number {
  const select = React.useCallback((current: SpyState) => flagsOf(current, value) & mask, [value, mask]);
  return useStoreSelector(state, select);
}

/** The section a link click keeps active until the reader scrolls on their own. */
interface Hold {
  value: string;
  /** When the navigation last scrolled. */
  lastScroll: number;
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every(value => b.has(value));
}

function sameView(a: SectionView, b: SectionView): boolean {
  return sameSet(a.visible, b.visible) && sameSet(a.passed, b.passed);
}

export interface ScrollSpyProps {
  /** The value of the active section, `null` when none is. */
  value?: string | null;
  defaultValue?: string | null;
  onValueChange?: (value: string | null) => void;
  /** What is active before scrolling reaches the first section. @default "first" */
  fallback?: ScrollSpyFallback;
  /** How a link click navigates. @default "native" */
  navigation?: ScrollSpyNavigation;
  /** Puts the active section in the URL's hash once scrolling rests. @default false */
  syncHash?: boolean;
  /** The `aria-current` value of the active link. @default "true" */
  ariaCurrent?: "true" | "location";
  children?: React.ReactNode;
}

/**
 * Follows which section of a scrolling document the reader is at and marks its links. The
 * active section is chosen the way CSS Overflow 5 chooses the active scroll marker.
 */
function ScrollSpy(props: ScrollSpyProps): React.ReactNode {
  const {
    value: valueProp,
    defaultValue = null,
    onValueChange,
    fallback = "first",
    navigation = "native",
    syncHash = false,
    ariaCurrent = "true",
    children,
  } = props;
  const [active, setActive] = useControllableState({
    prop: valueProp,
    defaultProp: defaultValue,
    onChange: onValueChange,
    caller: ROOT_NAME,
  });
  const [sections, registerSectionEntry] = useRegistry<SectionEntry>(sortByDocumentPosition);
  const [items, registerItem] = useRegistry<ItemEntry>();
  const [view, setView] = React.useState(EMPTY_VIEW);
  const viewRef = React.useRef(EMPTY_VIEW);
  const holdRef = React.useRef<Hold | null>(null);
  // The active section as measured last, so a controlled value the consumer keeps is reported once.
  const measuredRef = React.useRef<string | null | undefined>(undefined);
  const heldUrlTargetRef = React.useRef(false);

  React.useLayoutEffect(() => {
    if (sections.length === 0) {
      return;
    }
    const elements = sections.map(entry => entry.element);
    const scroller = scrollerOf(elements);
    const ownerDocument = scroller.ownerDocument;
    const ownerWindow = getOwnerWindow(scroller);
    const scrollsDocument = scroller === ownerDocument.scrollingElement;
    const indexOf = new Map(sections.map((entry, index) => [entry.value, index]));
    let tracking = true;

    // Where the sections are in the scroller's content, measured again only when they moved, so
    // a scroll reads the scroll position and searches.
    let geometry = measureSections(scroller, elements);
    let order = orderOf(geometry);
    let stale = false;
    let shown: { counts: readonly number[]; view: SectionView } | null = null;

    const viewAt = (scrollPosition: number): SectionView => {
      const { tops, bottoms, paddingTop, scrollportSize } = geometry;
      // The sections that show or were passed change only as a start or an end crosses the
      // scrollport's top or bottom, which these counts follow.
      const counts = [
        countUpTo(order.bottoms, scrollPosition + paddingTop, true),
        countUpTo(order.bottoms, scrollPosition, true),
        countUpTo(order.tops, scrollPosition + scrollportSize, false),
      ];
      if (shown && shown.counts.every((count, index) => count === counts[index])) {
        return shown.view;
      }
      const visible = new Set<string>();
      const passed = new Set<string>();
      sections.forEach((entry, index) => {
        if (bottoms[index]! > scrollPosition && tops[index]! < scrollPosition + scrollportSize) {
          visible.add(entry.value);
        }
        if (bottoms[index]! <= scrollPosition + paddingTop) {
          passed.add(entry.value);
        }
      });
      shown = { counts, view: { visible, passed } };
      return shown.view;
    };

    const measure = (): { active: string | null; view: SectionView } => {
      if (stale || !sectionsStayed(scroller, elements, geometry)) {
        stale = false;
        geometry = measureSections(scroller, elements);
        order = orderOf(geometry);
        shown = null;
      }
      const scrollPosition = scroller.scrollTop;
      const hold = holdRef.current;
      let index = hold ? indexOf.get(hold.value) ?? -1 : -1;
      if (index === -1) {
        holdRef.current = null;
        index = selectPrepared(order.positions, scrollPosition, geometry.scrollportSize);
        if (index === -1 && fallback === "first") {
          index = 0;
        }
      }
      return { active: index === -1 ? null : sections[index]!.value, view: viewAt(scrollPosition) };
    };
    const apply = (next: { active: string | null; view: SectionView }): void => {
      if (next.active !== measuredRef.current) {
        measuredRef.current = next.active;
        setActive(next.active);
      }
      if (!sameView(next.view, viewRef.current)) {
        viewRef.current = next.view;
        setView(next.view);
      }
    };
    const update = (): void => {
      if (!tracking) {
        return;
      }
      const next = measure();
      if (next.active !== measuredRef.current || !sameView(next.view, viewRef.current)) {
        renderSynchronously(() => apply(next));
      }
    };

    let hashTimer: ReturnType<typeof setTimeout> | undefined;
    const syncHashLater = (): void => {
      if (!syncHash) {
        return;
      }
      clearTimeout(hashTimer);
      hashTimer = setTimeout(() => {
        const value = measuredRef.current;
        if (value === null || value === undefined) {
          return;
        }
        const url = new URL(ownerWindow.location.href);
        url.hash = value;
        if (url.href !== ownerWindow.location.href) {
          ownerWindow.history.replaceState(ownerWindow.history.state, "", url);
        }
      }, HASH_SYNC_DELAY);
    };
    const stopScrollFrames = onScrollFrame(ownerDocument, () => {
      update();
      syncHashLater();
    });

    // Scrolling that resumes after the navigation came to rest is the reader's own.
    const scrollTarget: EventTarget = scrollsDocument ? ownerWindow : scroller;
    const onScroll = (): void => {
      const hold = holdRef.current;
      if (!hold) {
        return;
      }
      const now = ownerWindow.performance.now();
      if (now - hold.lastScroll > NAVIGATION_SETTLE_TIME) {
        holdRef.current = null;
      } else {
        hold.lastScroll = now;
      }
    };
    scrollTarget.addEventListener("scroll", onScroll, { passive: true });
    const release = (): void => {
      if (holdRef.current) {
        holdRef.current = null;
        update();
      }
    };
    const inScroller = (target: EventTarget | null): boolean => scrollsDocument || (target instanceof ownerWindow.Node && scroller.contains(target));
    const onWheelOrTouch = (event: Event): void => {
      if (inScroller(event.target)) {
        release();
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (SCROLL_KEYS.has(event.key) && !isEditableTarget(event.target)) {
        release();
      }
    };
    const onPointerDown = (event: PointerEvent): void => {
      // A press on the scroller itself is a press on its scrollbar.
      if (event.target === scroller) {
        release();
      }
    };
    ownerDocument.addEventListener("wheel", onWheelOrTouch, { capture: true, passive: true });
    ownerDocument.addEventListener("touchmove", onWheelOrTouch, { capture: true, passive: true });
    ownerDocument.addEventListener("keydown", onKeyDown, { capture: true });
    ownerDocument.addEventListener("pointerdown", onPointerDown, { capture: true });

    // A section the URL points at was navigated to, like one whose link was clicked.
    const holdUrlTarget = (): void => {
      const target = ownerDocument.querySelector(":target");
      const entry = sections.find(section => section.element === target);
      if (entry) {
        holdRef.current = { value: entry.value, lastScroll: ownerWindow.performance.now() };
      }
    };
    if (!heldUrlTargetRef.current) {
      heldUrlTargetRef.current = true;
      holdUrlTarget();
    }
    const onHashChange = (): void => {
      holdUrlTarget();
      update();
    };
    ownerWindow.addEventListener("hashchange", onHashChange);

    let pending = false;
    const updateLater = (): void => {
      stale = true;
      if (pending) {
        return;
      }
      pending = true;
      queueMicrotask(() => {
        pending = false;
        update();
      });
    };
    const containers = new Set<Element>([scroller, ...elements, ...elements.flatMap(element => (element.parentElement ? [element.parentElement] : []))]);
    const stopObserving = [...containers].map(element => observeElementSize(element, updateLater));
    // Scroll margins and scroll padding change where sections become active without moving anything.
    const styles = new MutationObserver(updateLater);
    for (const element of [scroller, ...elements]) {
      styles.observe(element, { attributes: true, attributeFilter: ["style", "class"] });
    }

    // Measuring in a layout effect marks the active section before the first paint.
    apply(measure());
    return () => {
      tracking = false;
      clearTimeout(hashTimer);
      stopScrollFrames();
      stopObserving.forEach(stop => stop());
      styles.disconnect();
      scrollTarget.removeEventListener("scroll", onScroll);
      ownerDocument.removeEventListener("wheel", onWheelOrTouch, { capture: true });
      ownerDocument.removeEventListener("touchmove", onWheelOrTouch, { capture: true });
      ownerDocument.removeEventListener("keydown", onKeyDown, { capture: true });
      ownerDocument.removeEventListener("pointerdown", onPointerDown, { capture: true });
      ownerWindow.removeEventListener("hashchange", onHashChange);
    };
  }, [sections, fallback, syncHash, setActive]);

  const navigate = useStableCallback((value: string, event?: React.MouseEvent<HTMLAnchorElement>) => {
    const section = sections.find(entry => entry.value === value);
    if (!section) {
      throw new Error(`${ROOT_NAME} has no ${SECTION_NAME} with the value "${value}".`);
    }
    const ownerWindow = getOwnerWindow(section.element);
    holdRef.current = { value, lastScroll: ownerWindow.performance.now() };
    measuredRef.current = value;
    setActive(value);
    if (event && navigation === "native") {
      return;
    }
    event?.preventDefault();
    section.element.scrollIntoView({ block: "start" });
    section.element.focus({ preventScroll: true });
    if (navigation !== "none") {
      const url = new URL(ownerWindow.location.href);
      url.hash = value;
      if (navigation === "replace") {
        ownerWindow.history.replaceState(ownerWindow.history.state, "", url);
      } else {
        ownerWindow.history.pushState(null, "", url);
      }
    }
  });

  const sectionValuesRef = React.useRef(new Set<string>());
  const registerSection = React.useCallback((entry: SectionEntry) => {
    const values = sectionValuesRef.current;
    if (values.has(entry.value)) {
      throw new Error(`${ROOT_NAME} already has a ${SECTION_NAME} with the value "${entry.value}".`);
    }
    values.add(entry.value);
    const unregister = registerSectionEntry(entry);
    return () => {
      unregister();
      values.delete(entry.value);
    };
  }, [registerSectionEntry]);

  const parents = React.useMemo(() => {
    const result = new Map<string, string | null>();
    for (const entry of items) {
      const known = result.get(entry.value);
      if (known !== undefined && known !== entry.parent) {
        throw new Error(`${ROOT_NAME} has items with the value "${entry.value}" nested in different items.`);
      }
      result.set(entry.value, entry.parent);
    }
    return result;
  }, [items]);
  const trail = React.useMemo(() => {
    const ancestors = new Set<string>();
    let parent = active === null ? null : parents.get(active) ?? null;
    while (parent !== null && !ancestors.has(parent)) {
      ancestors.add(parent);
      parent = parents.get(parent) ?? null;
    }
    return ancestors;
  }, [parents, active]);

  const state = React.useMemo((): SpyState => ({ active, visible: view.visible, passed: view.passed, trail }), [active, view, trail]);
  const [store] = React.useState(() => createStore(state));
  React.useLayoutEffect(() => {
    store.set(state);
  }, [store, state]);

  const contextValue = React.useMemo((): ScrollSpyContextValue => ({
    state: store,
    ariaCurrent,
    registerSection,
    registerItem,
    navigate,
  }), [store, ariaCurrent, registerSection, registerItem, navigate]);

  return <ScrollSpyContext value={contextValue}>{children}</ScrollSpyContext>;
}

function sameBox(a: Rect | null, b: Rect): boolean {
  return a !== null && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

export interface ScrollSpyNavProps extends PrimitiveProps<"nav"> {
  /** When the nav scrolls on its own, keeps the active link in view. @default true */
  autoScroll?: boolean;
}

/**
 * Navigation for the sections. While it holds the active link it is marked `data-active` and
 * places that link as `--xlayout-scroll-spy-indicator-top`, `-left`, `-width` and `-height`,
 * for an indicator positioned in the nav's content.
 */
function ScrollSpyNav(props: ScrollSpyNavProps): React.ReactNode {
  const { autoScroll = true, ref, style, ...navProps } = props;
  useScrollSpyContext(NAV_NAME);
  const [nav, setNav] = React.useState<HTMLElement | null>(null);
  const composedRef = useComposedRefs(ref, setNav);
  const [activeLink, setActiveLink] = React.useState<HTMLElement | null>(null);
  const [box, setBox] = React.useState<Rect | null>(null);

  const showActiveLink = React.useCallback((element: HTMLElement) => {
    setActiveLink(element);
    return () => setActiveLink(current => (current === element ? null : current));
  }, []);

  React.useLayoutEffect(() => {
    if (!nav || !activeLink) {
      // Without an active link in this nav the indicator goes before the next paint.
      // eslint-disable-next-line react/set-state-in-effect
      setBox(null);
      return;
    }
    let observing = true;
    const measure = (): void => {
      const next = boxWithin(activeLink, nav);
      // Measuring in a layout effect moves the indicator before the first paint.
      // eslint-disable-next-line react/set-state-in-effect
      setBox(current => (sameBox(current, next) ? current : next));
    };
    measure();
    if (autoScroll) {
      revealWithin(activeLink, nav);
    }
    let pending = false;
    const measureLater = (): void => {
      if (pending) {
        return;
      }
      pending = true;
      queueMicrotask(() => {
        pending = false;
        if (observing) {
          renderSynchronously(measure);
        }
      });
    };
    const stops = [observeElementSize(activeLink, measureLater), observeElementSize(nav, measureLater)];
    return () => {
      observing = false;
      stops.forEach(stop => stop());
    };
  }, [nav, activeLink, autoScroll]);

  const navContext = React.useMemo((): NavContextValue => ({ showActiveLink }), [showActiveLink]);

  return (
    <NavContext value={navContext}>
      <Primitive.nav
        data-active={box ? "" : undefined}
        {...navProps}
        ref={composedRef}
        style={{
          ...(box
            ? {
                "--xlayout-scroll-spy-indicator-top": `${box.y}px`,
                "--xlayout-scroll-spy-indicator-left": `${box.x}px`,
                "--xlayout-scroll-spy-indicator-width": `${box.width}px`,
                "--xlayout-scroll-spy-indicator-height": `${box.height}px`,
              }
            : null),
          ...style,
        }}
      />
    </NavContext>
  );
}

export interface ScrollSpyListProps extends PrimitiveProps<"ol"> {}

function ScrollSpyList(props: ScrollSpyListProps): React.ReactNode {
  useScrollSpyContext(LIST_NAME);
  const item = React.use(ItemContext);
  return <Primitive.ol data-depth={item ? item.depth + 1 : 0} {...props} />;
}

export interface ScrollSpyItemProps extends PrimitiveProps<"li"> {
  /** The value of the section this item links to. */
  value: string;
}

/** One entry of the navigation; items nested in its lists form the active trail. */
function ScrollSpyItem(props: ScrollSpyItemProps): React.ReactNode {
  const { value, ref, ...itemProps } = props;
  const context = useScrollSpyContext(ITEM_NAME);
  const parent = React.use(ItemContext);
  const parentValue = parent?.value ?? null;
  const depth = parent ? parent.depth + 1 : 0;
  const { registerItem } = context;
  const register = React.useCallback(
    (element: HTMLLIElement | null) => (element ? registerItem({ value, parent: parentValue }) : undefined),
    [registerItem, value, parentValue],
  );
  const composedRef = useComposedRefs(ref, register);
  const itemContext = React.useMemo((): ItemContextValue => ({ value, depth }), [value, depth]);
  const flags = useFlags(context.state, value, ACTIVE | IN_TRAIL);
  return (
    <ItemContext value={itemContext}>
      <Primitive.li
        data-state={flags & ACTIVE ? "active" : "inactive"}
        data-active-trail={flags & IN_TRAIL ? "" : undefined}
        data-depth={depth}
        {...itemProps}
        ref={composedRef}
      />
    </ItemContext>
  );
}

export interface ScrollSpyLinkProps extends PrimitiveProps<"a"> {}

/** Links to the section of its item and shows whether that section is active, in view or passed. */
function ScrollSpyLink(props: ScrollSpyLinkProps): React.ReactNode {
  const { onClick, ref, ...linkProps } = props;
  const context = useScrollSpyContext(LINK_NAME);
  const item = React.use(ItemContext);
  if (!item) {
    throw new Error(`\`${LINK_NAME}\` must be used within \`${ITEM_NAME}\``);
  }
  const nav = React.use(NavContext);
  const [element, setElement] = React.useState<HTMLAnchorElement | null>(null);
  const composedRef = useComposedRefs(ref, setElement);
  const flags = useFlags(context.state, item.value, ACTIVE | VISIBLE | PASSED | IN_TRAIL);
  const isActive = (flags & ACTIVE) !== 0;
  const showActiveLink = nav?.showActiveLink;
  React.useLayoutEffect(
    () => (isActive && element && showActiveLink ? showActiveLink(element) : undefined),
    [isActive, element, showActiveLink],
  );
  return (
    <Primitive.a
      href={`#${item.value}`}
      aria-current={isActive ? context.ariaCurrent : undefined}
      data-state={isActive ? "active" : "inactive"}
      data-visible={flags & VISIBLE ? "" : undefined}
      data-passed={flags & PASSED ? "" : undefined}
      data-active-trail={flags & IN_TRAIL ? "" : undefined}
      data-depth={item.depth}
      {...linkProps}
      ref={composedRef}
      onClick={composeEventHandlers(onClick, (event) => {
        // Modified clicks open the link elsewhere.
        if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
          context.navigate(item.value, event);
        }
      })}
    />
  );
}

export interface ScrollSpySectionProps extends PrimitiveProps<"section"> {
  /** Names the section; it is also the section's id, so links reach it without script. */
  value: string;
}

function ScrollSpySection(props: ScrollSpySectionProps): React.ReactNode {
  const { value, ref, ...sectionProps } = props;
  const context = useScrollSpyContext(SECTION_NAME);
  const { registerSection } = context;
  const register = React.useCallback(
    (element: HTMLElement | null) => (element ? registerSection({ value, element }) : undefined),
    [registerSection, value],
  );
  const composedRef = useComposedRefs(ref, register);
  const flags = useFlags(context.state, value, ACTIVE | VISIBLE | PASSED);
  return (
    <Primitive.section
      id={value}
      // Navigation moves focus here, so reading continues from the section.
      tabIndex={-1}
      data-state={flags & ACTIVE ? "active" : "inactive"}
      data-visible={flags & VISIBLE ? "" : undefined}
      data-passed={flags & PASSED ? "" : undefined}
      {...sectionProps}
      ref={composedRef}
    />
  );
}

export {
  ScrollSpyItem as Item,
  ScrollSpyLink as Link,
  ScrollSpyList as List,
  ScrollSpyNav as Nav,
  ScrollSpy as Root,
  ScrollSpy,
  ScrollSpyItem,
  ScrollSpyLink,
  ScrollSpyList,
  ScrollSpyNav,
  ScrollSpySection,
  ScrollSpySection as Section,
};
