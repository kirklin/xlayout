"use client";

import type { PrimitiveProps } from "../shared/primitive";
import type { Rect } from "../shared/types";
import type { ItemContextValue, ItemEntry, NavContextValue, ScrollSpyContextValue, SectionEntry } from "./context";
import type { ScrollSpyFallback, ScrollSpyNavigation } from "./types";
import * as React from "react";
import { useComposedRefs } from "../shared/compose-refs";
import { getOwnerWindow, isEditableTarget, sortByDocumentPosition } from "../shared/dom";
import { composeEventHandlers } from "../shared/events";
import { renderSynchronously } from "../shared/flush";
import { Primitive } from "../shared/primitive";
import { observeElementSize } from "../shared/resize-observer";
import { onScrollFrame, revealWithin } from "../shared/scroll";
import { useControllableState } from "../shared/use-controllable-state";
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
import { boxWithin, measureSections, scrollerOf } from "./measure";
import { redistributePositions, selectSection } from "./select";

interface SectionView {
  visible: ReadonlySet<string>;
  passed: ReadonlySet<string>;
}

const EMPTY_VIEW: SectionView = { visible: new Set(), passed: new Set() };

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
  const [sections, setSections] = React.useState<readonly SectionEntry[]>([]);
  const [items, setItems] = React.useState<readonly ItemEntry[]>([]);
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
    let tracking = true;

    const measure = (): { active: string | null; view: SectionView } => {
      const measurement = measureSections(scroller, elements);
      const hold = holdRef.current;
      let index = hold ? sections.findIndex(entry => entry.value === hold.value) : -1;
      if (index === -1) {
        holdRef.current = null;
        const positions = redistributePositions(measurement.positions, measurement.scrollportSize, measurement.scrollRange);
        index = selectSection(positions, measurement.scrollPosition, measurement.scrollportSize);
        if (index === -1 && fallback === "first") {
          index = 0;
        }
      }
      return {
        active: index === -1 ? null : sections[index]!.value,
        view: {
          visible: new Set(sections.filter((_, position) => measurement.visible[position]).map(entry => entry.value)),
          passed: new Set(sections.filter((_, position) => measurement.passed[position]).map(entry => entry.value)),
        },
      };
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

    // Measuring in a layout effect marks the active section before the first paint.
    apply(measure());
    return () => {
      tracking = false;
      clearTimeout(hashTimer);
      stopScrollFrames();
      stopObserving.forEach(stop => stop());
      scrollTarget.removeEventListener("scroll", onScroll);
      ownerDocument.removeEventListener("wheel", onWheelOrTouch, { capture: true });
      ownerDocument.removeEventListener("touchmove", onWheelOrTouch, { capture: true });
      ownerDocument.removeEventListener("keydown", onKeyDown, { capture: true });
      ownerDocument.removeEventListener("pointerdown", onPointerDown, { capture: true });
      ownerWindow.removeEventListener("hashchange", onHashChange);
    };
  }, [sections, fallback, syncHash, setActive]);

  const navigate = React.useCallback((value: string, event?: React.MouseEvent<HTMLAnchorElement>) => {
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
  }, [sections, navigation, setActive]);

  const registerSection = React.useCallback((entry: SectionEntry) => {
    setSections((current) => {
      if (current.some(existing => existing.value === entry.value)) {
        throw new Error(`${ROOT_NAME} already has a ${SECTION_NAME} with the value "${entry.value}".`);
      }
      return sortByDocumentPosition([...current, entry]);
    });
    return () => setSections(current => current.filter(existing => existing !== entry));
  }, []);

  const registerItem = React.useCallback((entry: ItemEntry) => {
    setItems(current => [...current, entry]);
    return () => setItems(current => current.filter(existing => existing !== entry));
  }, []);

  const trail = React.useMemo(() => {
    const parents = new Map<string, string | null>();
    for (const entry of items) {
      const known = parents.get(entry.value);
      if (known !== undefined && known !== entry.parent) {
        throw new Error(`${ROOT_NAME} has items with the value "${entry.value}" nested in different items.`);
      }
      parents.set(entry.value, entry.parent);
    }
    const ancestors = new Set<string>();
    let parent = active === null ? null : parents.get(active) ?? null;
    while (parent !== null && !ancestors.has(parent)) {
      ancestors.add(parent);
      parent = parents.get(parent) ?? null;
    }
    return ancestors;
  }, [items, active]);

  const contextValue = React.useMemo((): ScrollSpyContextValue => ({
    active,
    visible: view.visible,
    passed: view.passed,
    trail,
    ariaCurrent,
    registerSection,
    registerItem,
    navigate,
  }), [active, view, trail, ariaCurrent, registerSection, registerItem, navigate]);

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
  return (
    <ItemContext value={itemContext}>
      <Primitive.li
        data-state={context.active === value ? "active" : "inactive"}
        data-active-trail={context.trail.has(value) ? "" : undefined}
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
  const isActive = context.active === item.value;
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
      data-visible={context.visible.has(item.value) ? "" : undefined}
      data-passed={context.passed.has(item.value) ? "" : undefined}
      data-active-trail={context.trail.has(item.value) ? "" : undefined}
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
  return (
    <Primitive.section
      id={value}
      // Navigation moves focus here, so reading continues from the section.
      tabIndex={-1}
      data-state={context.active === value ? "active" : "inactive"}
      data-visible={context.visible.has(value) ? "" : undefined}
      data-passed={context.passed.has(value) ? "" : undefined}
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
