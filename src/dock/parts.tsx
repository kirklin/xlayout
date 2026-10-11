"use client";

import type { DockAutoHide, DockFloating, DockGroup, DockGroupPlace, DockNode, DockPopout, DockSide, DockSplit } from "./types";
import * as React from "react";
import { createPortal } from "react-dom";
import { getOwnerWindow } from "../shared/dom";
import { isPrimaryPointerDown } from "../shared/drag";
import { clamp } from "../shared/math";
import { Primitive } from "../shared/primitive";
import { measureElementSize, observeElementSize } from "../shared/resize-observer";
import { registerTouchReach } from "../shared/touch-reach";
import { FLOATING_LAYER, FLYOUT_LAYER, MIN_AUTO_HIDE_SIZE, ROOT_NAME } from "./constants";
import { useDockContext } from "./context";
import { elementId, flyoutId, stripTabId } from "./hosts";
import { runsVertically } from "./model";

/** Keeps a tab that does not fit, or an overflow button with nothing to list, measurable but out of the way. */
const OUT_OF_THE_WAY: React.CSSProperties = { position: "absolute", insetInlineStart: 0, top: 0, visibility: "hidden", pointerEvents: "none" };

/**
 * Tabs and strip buttons let touches scroll the page up and down; a touch across them drags at
 * once, and a held one drags in any direction. Holding never brings up text selection or the
 * callout menu.
 */
const TOUCH_TAB_STYLE: React.CSSProperties = { touchAction: "pan-y pinch-zoom", WebkitTouchCallout: "none", userSelect: "none", WebkitUserSelect: "none" };

function isRightToLeft(element: Element): boolean {
  return getOwnerWindow(element).getComputedStyle(element).direction === "rtl";
}

function pixels(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** The width an element takes on its line, margins included. */
function outerWidth(element: HTMLElement): number {
  const style = getOwnerWindow(element).getComputedStyle(element);
  return measureElementSize(element).width + pixels(style.marginLeft) + pixels(style.marginRight);
}

function contentWidth(element: HTMLElement): number {
  const style = getOwnerWindow(element).getComputedStyle(element);
  return measureElementSize(element).width
    - pixels(style.paddingLeft) - pixels(style.paddingRight) - pixels(style.borderLeftWidth) - pixels(style.borderRightWidth);
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * The panels whose tabs do not fit in `space`, which holds the tabs and the overflow button. The
 * selected tab always shows; the others show in order while they fit, beside the button once any
 * of them is left out.
 */
function overflowingPanels(panels: readonly string[], active: string, widths: ReadonlyMap<string, number>, gap: number, space: number, buttonWidth: number): string[] {
  const width = (panel: string): number => widths.get(panel) ?? 0;
  const total = panels.reduce((sum, panel) => sum + width(panel), 0) + gap * Math.max(0, panels.length - 1);
  if (total <= space + 0.5) {
    return [];
  }
  const available = space - buttonWidth - gap;
  let used = width(active);
  const shown = new Set([active]);
  for (const panel of panels) {
    if (panel === active) {
      continue;
    }
    if (used + gap + width(panel) > available + 0.5) {
      break;
    }
    used += gap + width(panel);
    shown.add(panel);
  }
  return panels.filter(panel => !shown.has(panel));
}

/** Places an open popover menu under its button, its inline end at the button's, inside the window. */
function placeMenu(menu: HTMLElement, button: HTMLElement): void {
  const ownerWindow = getOwnerWindow(button);
  const anchor = button.getBoundingClientRect();
  menu.style.setProperty("margin", "0");
  menu.style.setProperty("inset", "auto");
  const { width, height } = menu.getBoundingClientRect();
  const left = isRightToLeft(button) ? anchor.left : anchor.right - width;
  const fitsBelow = anchor.bottom + height <= ownerWindow.innerHeight || anchor.top - height < 0;
  menu.style.setProperty("left", `${clamp(left, 0, Math.max(0, ownerWindow.innerWidth - width))}px`);
  menu.style.setProperty("top", `${fitsBelow ? anchor.bottom : anchor.top - height}px`);
}

export function NodeView({ node }: { node: DockNode }): React.ReactNode {
  return node.type === "group" ? <GroupView group={node} place="main" /> : <SplitView split={node} />;
}

function SplitView({ split }: { split: DockSplit }): React.ReactNode {
  const context = useDockContext(ROOT_NAME);
  const sizes = context.splitSizes(split);
  const horizontal = split.orientation === "horizontal";
  return (
    <Primitive.div
      data-dock-split=""
      data-orientation={split.orientation}
      style={{ display: "flex", flexDirection: horizontal ? "row" : "column", flex: "1 1 0px", minWidth: 0, minHeight: 0 }}
    >
      {split.children.map((child, index) => (
        <React.Fragment key={child.id}>
          {index > 0 && <SplitHandle split={split} index={index - 1} sizes={sizes} />}
          <Primitive.div data-dock-pane="" style={{ display: "flex", flex: `${sizes[index]} 1 0px`, minWidth: 0, minHeight: 0, overflow: "clip" }}>
            <NodeView node={child} />
          </Primitive.div>
        </React.Fragment>
      ))}
    </Primitive.div>
  );
}

/** Lets touches that land beside a thin handle take it, with the dock's touch margin. */
function useTouchReach(ref: React.RefObject<HTMLElement | null>, press: (event: PointerEvent, element: HTMLElement) => void): void {
  const { touchMargin } = useDockContext(ROOT_NAME);
  React.useLayoutEffect(() => {
    const element = ref.current;
    if (!element || touchMargin <= 0) {
      return;
    }
    return registerTouchReach({ element, margin: touchMargin, press: event => press(event, element) });
  }, [ref, touchMargin, press]);
}

function SplitHandle({ split, index, sizes }: { split: DockSplit; index: number; sizes: number[] }): React.ReactNode {
  const context = useDockContext(ROOT_NAME);
  const ref = React.useRef<HTMLDivElement>(null);
  const horizontal = split.orientation === "horizontal";
  const before = sizes[index]!;
  const pair = before + sizes[index + 1]!;
  const dragging = context.drag?.kind === "split" && context.drag.split === split.id;
  const { beginSplitResize } = context;
  const press = React.useCallback((event: PointerEvent, element: HTMLElement) => beginSplitResize(split, index, event, element), [beginSplitResize, split, index]);
  useTouchReach(ref, press);
  return (
    <Primitive.div
      ref={ref}
      role="separator"
      tabIndex={0}
      aria-label={context.handleLabel}
      aria-orientation={horizontal ? "vertical" : "horizontal"}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round((before / pair) * 100)}
      data-dock-handle=""
      data-orientation={split.orientation}
      data-state={dragging ? "dragging" : "idle"}
      onPointerDown={(event) => {
        if (isPrimaryPointerDown(event)) {
          press(event.nativeEvent, event.currentTarget);
        }
      }}
      onKeyDown={event => context.handleSplitKey(split, index, event)}
      style={{
        flex: "0 0 var(--xlayout-dock-handle-size, 4px)",
        touchAction: "none",
        cursor: horizontal ? "col-resize" : "row-resize",
      }}
    />
  );
}

export function GroupView({ group, place }: { group: DockGroup; place: DockGroupPlace }): React.ReactNode {
  const context = useDockContext(ROOT_NAME);
  const groupRef = React.useRef<HTMLDivElement>(null);
  const headerRef = React.useRef<HTMLDivElement>(null);
  const tabBarRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const controlsRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const { registerGroup } = context;
  React.useLayoutEffect(() => {
    registerGroup(group.id, { group: groupRef.current!, tabBar: tabBarRef.current!, content: contentRef.current! });
    return () => registerGroup(group.id, null);
  }, [registerGroup, group.id]);

  // A revealed hidden group shows the tab of its selected panel; the buttons on its edge stand for all of them.
  const tabs = React.useMemo(() => (place === "autoHide" ? [group.active] : group.panels), [place, group.active, group.panels]);

  // Tabs that do not fit move into a menu behind the overflow button; the selected one stays.
  const [overflow, setOverflow] = React.useState<readonly string[]>([]);
  const [sizeCount, sizeChanged] = React.useReducer((count: number) => count + 1, 0);
  React.useLayoutEffect(() => {
    const header = headerRef.current!;
    const tabBar = tabBarRef.current!;
    const trigger = triggerRef.current!;
    const controls = controlsRef.current;
    const widths = new Map([...tabBar.querySelectorAll<HTMLElement>(":scope > [data-dock-tab]")].map(tab => [tab.dataset.panel!, outerWidth(tab)]));
    const headerGap = pixels(getOwnerWindow(header).getComputedStyle(header).columnGap);
    const tabGap = pixels(getOwnerWindow(tabBar).getComputedStyle(tabBar).columnGap);
    const space = contentWidth(header) - (controls ? outerWidth(controls) + headerGap : 0);
    const next = overflowingPanels(tabs, group.active, widths, tabGap, space, outerWidth(trigger) + headerGap);
    if (!sameList(next, overflow)) {
      // Measured before the first paint, so the tab bar never shows tabs running under the controls.
      setOverflow(next);
    }
  }, [tabs, group.active, overflow, sizeCount]);
  React.useLayoutEffect(() => {
    const header = headerRef.current!;
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
          sizeChanged();
        }
      });
    };
    const stops = [header, ...header.querySelectorAll<HTMLElement>("[data-dock-tab], [data-dock-overflow-trigger], [data-dock-controls]")]
      .map(element => observeElementSize(element, schedule));
    return () => {
      observing = false;
      stops.forEach(stop => stop());
    };
  }, [tabs]);

  const [menuOpen, setMenuOpen] = React.useState(false);
  React.useLayoutEffect(() => {
    const menu = menuRef.current!;
    const handleToggle = (event: Event): void => {
      const open = (event as ToggleEvent).newState === "open";
      setMenuOpen(open);
      const active = menu.ownerDocument.activeElement;
      // Escape or a click elsewhere closed the menu; focus goes back to its button unless it went on.
      if (!open && (active === null || active === menu.ownerDocument.body || menu.contains(active))) {
        triggerRef.current?.focus();
      }
    };
    menu.addEventListener("toggle", handleToggle);
    return () => menu.removeEventListener("toggle", handleToggle);
  }, []);
  const menuItems = (): HTMLElement[] => [...menuRef.current!.querySelectorAll<HTMLElement>("[role=menuitem]")];
  const openMenu = (focus: "first" | "last"): void => {
    const menu = menuRef.current!;
    if (!menu.matches(":popover-open")) {
      menu.showPopover();
    }
    placeMenu(menu, triggerRef.current!);
    const items = menuItems();
    (focus === "first" ? items[0] : items.at(-1))?.focus();
  };
  const choose = (panel: string): void => {
    context.focusRef.current = panel;
    menuRef.current!.hidePopover();
    context.api.activate(panel);
  };

  const maximized = context.layout.maximized === group.id;
  const headerDrag = place === "floating"
    ? (event: React.PointerEvent<HTMLDivElement>) => {
        // Only the free space of the header moves the group; tabs and controls do their own thing.
        if (isPrimaryPointerDown(event) && (event.target === event.currentTarget || event.target === tabBarRef.current)) {
          context.beginGroupDrag(group, event.nativeEvent, event.currentTarget);
        }
      }
    : undefined;
  const menuId = elementId(`${context.dockId}-overflow`, group.id);
  const overflowing = new Set(overflow);
  return (
    <Primitive.div
      ref={groupRef}
      data-dock-group=""
      data-group={group.id}
      data-place={place}
      data-maximized={maximized ? "" : undefined}
      style={{ display: "flex", flexDirection: "column", flex: "1 1 0px", minWidth: 0, minHeight: 0 }}
    >
      <Primitive.div
        ref={headerRef}
        data-dock-header=""
        onPointerDown={headerDrag}
        style={{ display: "flex", flex: "none", position: "relative", touchAction: place === "floating" ? "none" : undefined }}
      >
        <Primitive.div
          ref={tabBarRef}
          role="tablist"
          aria-orientation="horizontal"
          data-dock-tablist=""
          data-overflowing={overflow.length > 0 ? "" : undefined}
          style={{ display: "flex", flex: "1 1 auto", minWidth: 0, position: "relative", overflow: "clip" }}
        >
          {tabs.map(panel => <Tab key={panel} group={group} panel={panel} overflowed={overflowing.has(panel)} />)}
        </Primitive.div>
        <Primitive.button
          ref={triggerRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          aria-label={context.tabOverflowLabel}
          inert={overflow.length === 0 || undefined}
          data-dock-overflow-trigger=""
          data-state={menuOpen ? "open" : "closed"}
          onClick={() => {
            if (menuOpen) {
              menuRef.current!.hidePopover();
            } else {
              openMenu("first");
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              openMenu(event.key === "ArrowDown" ? "first" : "last");
            }
          }}
          style={{ flex: "none", ...(overflow.length === 0 ? OUT_OF_THE_WAY : null) }}
        >
          {context.renderTabOverflow({ panels: overflow, open: menuOpen })}
        </Primitive.button>
        <Primitive.div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={context.tabOverflowLabel}
          popover="auto"
          data-dock-overflow-menu=""
          onKeyDown={(event) => {
            const items = menuItems();
            const index = items.indexOf(event.target as HTMLElement);
            const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
            if (step !== 0) {
              event.preventDefault();
              items[(index + step + items.length) % items.length]?.focus();
            } else if (event.key === "Home" || event.key === "End") {
              event.preventDefault();
              (event.key === "Home" ? items[0] : items.at(-1))?.focus();
            } else if (event.key === "Escape") {
              // Not every engine closes a popover on Escape by itself.
              event.preventDefault();
              menuRef.current!.hidePopover();
            } else if (event.key === "Tab") {
              menuRef.current!.hidePopover();
            }
          }}
        >
          {overflow.map(panel => (
            <Primitive.button
              key={panel}
              type="button"
              role="menuitem"
              tabIndex={-1}
              data-dock-overflow-item=""
              data-panel={panel}
              onClick={() => choose(panel)}
            >
              {context.panels[panel]?.title ?? panel}
            </Primitive.button>
          ))}
        </Primitive.div>
        {context.renderGroupControls && (
          <Primitive.div ref={controlsRef} data-dock-controls="" style={{ display: "flex", flex: "none" }}>
            {context.renderGroupControls({ group: group.id, place, panels: group.panels, active: group.active, maximized, api: context.api })}
          </Primitive.div>
        )}
      </Primitive.div>
      <Primitive.div ref={contentRef} data-dock-content="" style={{ position: "relative", flex: "1 1 0px", minHeight: 0 }} />
    </Primitive.div>
  );
}

function Tab({ group, panel, overflowed }: { group: DockGroup; panel: string; overflowed: boolean }): React.ReactNode {
  const context = useDockContext(ROOT_NAME);
  const tabRef = React.useRef<HTMLDivElement>(null);
  const definition = context.panels[panel]!;
  const active = group.active === panel;
  const closable = definition.closable ?? true;
  const dragging = context.drag?.kind === "panel" && context.drag.panel === panel;
  const { focusRef } = context;
  // A tab the keyboard selected from the overflow menu takes focus once it shows.
  React.useLayoutEffect(() => {
    const element = tabRef.current!;
    if (!overflowed && focusRef.current === panel) {
      element.focus();
      if (element.ownerDocument.activeElement === element) {
        focusRef.current = null;
      }
    }
  }, [overflowed, focusRef, panel]);
  return (
    <Primitive.div
      ref={tabRef}
      role="tab"
      id={elementId(`${context.dockId}-tab`, panel)}
      aria-selected={active}
      aria-controls={elementId(`${context.dockId}-panel`, panel)}
      aria-keyshortcuts="Alt+Shift+M Control+Shift+ArrowLeft Control+Shift+ArrowRight Delete"
      tabIndex={active ? 0 : -1}
      data-dock-tab=""
      data-panel={panel}
      data-state={active ? "active" : "inactive"}
      data-overflow={overflowed ? "" : undefined}
      data-dragging={dragging ? "" : undefined}
      data-docking={context.docking === panel ? "" : undefined}
      onPointerDown={(event) => {
        if (isPrimaryPointerDown(event)) {
          context.beginTabDrag(group, panel, event.nativeEvent, event.currentTarget);
        }
      }}
      onClick={() => {
        if (!context.consumeDragClick(panel)) {
          context.api.activate(panel);
        }
      }}
      onKeyDown={event => context.handleTabKey(group, panel, event)}
      onBlur={() => context.handleTabBlur(panel)}
      style={{ flex: "none", ...TOUCH_TAB_STYLE, ...(overflowed ? OUT_OF_THE_WAY : null) }}
    >
      {context.renderTab({ panel, title: definition.title, active, closable, close: () => context.api.close(panel) })}
    </Primitive.div>
  );
}

export function FloatingView({ entry, index }: { entry: DockFloating; index: number }): React.ReactNode {
  const context = useDockContext(ROOT_NAME);
  const resizeRef = React.useRef<HTMLDivElement>(null);
  const rect = context.floatingRect(entry);
  const { beginFloatResize } = context;
  const press = React.useCallback((event: PointerEvent, element: HTMLElement) => beginFloatResize(entry.group, event, element), [beginFloatResize, entry.group]);
  useTouchReach(resizeRef, press);
  const raise = (): void => {
    if (index < context.layout.floating.length - 1) {
      context.api.dispatch({ type: "raise", group: entry.group.id });
    }
  };
  return (
    <Primitive.div
      data-dock-floating=""
      data-group={entry.group.id}
      data-state={context.drag && "group" in context.drag && context.drag.group === entry.group.id ? "moving" : "idle"}
      onPointerDownCapture={raise}
      style={{ position: "absolute", left: rect.x, top: rect.y, width: rect.width, height: rect.height, zIndex: FLOATING_LAYER + index * 2, display: "flex" }}
    >
      <GroupView group={entry.group} place="floating" />
      <Primitive.div
        ref={resizeRef}
        data-dock-float-resize=""
        aria-hidden
        onPointerDown={(event) => {
          if (isPrimaryPointerDown(event)) {
            press(event.nativeEvent, event.currentTarget);
          }
        }}
        style={{ position: "absolute", insetInlineEnd: 0, bottom: 0, width: 12, height: 12, touchAction: "none" }}
      />
    </Primitive.div>
  );
}

export function PopoutView({ entry, container }: { entry: DockPopout; container: HTMLElement }): React.ReactNode {
  return createPortal(<GroupView group={entry.group} place="popout" />, container);
}

/** The buttons of the panels hidden along one edge of the dock. */
export function StripView({ side, entries }: { side: DockSide; entries: readonly DockAutoHide[] }): React.ReactNode {
  const context = useDockContext(ROOT_NAME);
  const ref = React.useRef<HTMLDivElement>(null);
  const { registerStrip } = context;
  React.useLayoutEffect(() => {
    registerStrip(side, ref.current);
    return () => registerStrip(side, null);
  }, [registerStrip, side]);
  const vertical = runsVertically(side);
  const items = entries.flatMap(entry => entry.group.panels.map(panel => ({ group: entry.group, panel })));
  const shownIndex = items.findIndex(item => context.api.revealed === item.group.id && item.group.active === item.panel);
  const [focused, setFocused] = React.useState(0);
  const tabStop = shownIndex === -1 ? Math.min(focused, items.length - 1) : shownIndex;
  return (
    <Primitive.div
      ref={ref}
      role="toolbar"
      aria-label={context.stripLabel}
      aria-orientation={vertical ? "vertical" : "horizontal"}
      data-dock-strip=""
      data-side={side}
      onKeyDown={(event) => {
        const buttons = [...event.currentTarget.querySelectorAll<HTMLElement>("[data-dock-strip-tab]")];
        const index = buttons.indexOf(event.target as HTMLElement);
        const rtl = isRightToLeft(event.currentTarget);
        const forward = vertical ? "ArrowDown" : rtl ? "ArrowLeft" : "ArrowRight";
        const backward = vertical ? "ArrowUp" : rtl ? "ArrowRight" : "ArrowLeft";
        const next = event.key === forward
          ? buttons[(index + 1) % buttons.length]
          : event.key === backward
            ? buttons[(index - 1 + buttons.length) % buttons.length]
            : event.key === "Home" ? buttons[0] : event.key === "End" ? buttons.at(-1) : undefined;
        if (next && index !== -1) {
          event.preventDefault();
          next.focus();
        }
      }}
      style={{ gridArea: side, display: "flex", flexDirection: vertical ? "column" : "row", minWidth: 0, minHeight: 0 }}
    >
      {items.map((item, index) => (
        <StripTab
          key={item.panel}
          group={item.group}
          panel={item.panel}
          side={side}
          tabIndex={index === tabStop ? 0 : -1}
          onFocus={() => setFocused(index)}
        />
      ))}
    </Primitive.div>
  );
}

interface StripTabProps {
  group: DockGroup;
  panel: string;
  side: DockSide;
  tabIndex: number;
  onFocus: () => void;
}

function StripTab({ group, panel, side, tabIndex, onFocus }: StripTabProps): React.ReactNode {
  const context = useDockContext(ROOT_NAME);
  const definition = context.panels[panel]!;
  const revealed = context.api.revealed === group.id && group.active === panel;
  const dragging = context.drag?.kind === "panel" && context.drag.panel === panel;
  return (
    <Primitive.button
      type="button"
      id={stripTabId(context.dockId, panel)}
      aria-expanded={revealed}
      aria-controls={revealed ? flyoutId(context.dockId, group.id) : undefined}
      tabIndex={tabIndex}
      data-dock-strip-tab=""
      data-panel={panel}
      data-state={revealed ? "active" : "inactive"}
      data-dragging={dragging ? "" : undefined}
      onFocus={onFocus}
      onPointerDown={(event) => {
        if (isPrimaryPointerDown(event)) {
          context.beginTabDrag(group, panel, event.nativeEvent, event.currentTarget);
        }
      }}
      onClick={(event) => {
        if (!context.consumeDragClick(panel)) {
          // A click from the keyboard has no detail; focus then follows into the revealed group.
          context.toggleStripTab(group, panel, event.detail === 0);
        }
      }}
      style={{ flex: "none", ...TOUCH_TAB_STYLE }}
    >
      {context.renderStripTab({ panel, title: definition.title, side, revealed })}
    </Primitive.button>
  );
}

/** A hidden group revealed over the main surface along its edge, with a handle on its inner edge. */
export function FlyoutView({ entry }: { entry: DockAutoHide }): React.ReactNode {
  const context = useDockContext(ROOT_NAME);
  const size = context.flyoutSize(entry);
  const { side } = entry;
  const placement: React.CSSProperties = side === "start"
    ? { insetBlock: 0, insetInlineStart: 0, width: size }
    : side === "end"
      ? { insetBlock: 0, insetInlineEnd: 0, width: size }
      : side === "top" ? { insetInline: 0, top: 0, height: size } : { insetInline: 0, bottom: 0, height: size };
  return (
    <Primitive.div
      id={flyoutId(context.dockId, entry.group.id)}
      data-dock-flyout=""
      data-side={side}
      data-group={entry.group.id}
      data-state={context.drag?.kind === "flyout" && context.drag.group === entry.group.id ? "resizing" : "idle"}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) {
          event.preventDefault();
          context.api.reveal(null);
          event.currentTarget.ownerDocument.getElementById(stripTabId(context.dockId, entry.group.active))?.focus();
        }
      }}
      style={{ position: "absolute", zIndex: FLYOUT_LAYER, display: "flex", ...placement }}
    >
      <GroupView group={entry.group} place="autoHide" />
      <FlyoutHandle entry={entry} size={size} />
    </Primitive.div>
  );
}

function FlyoutHandle({ entry, size }: { entry: DockAutoHide; size: number }): React.ReactNode {
  const context = useDockContext(ROOT_NAME);
  const ref = React.useRef<HTMLDivElement>(null);
  const vertical = runsVertically(entry.side);
  const { beginFlyoutResize } = context;
  const press = React.useCallback((event: PointerEvent, element: HTMLElement) => beginFlyoutResize(entry, event, element), [beginFlyoutResize, entry]);
  useTouchReach(ref, press);
  const thickness = "var(--xlayout-dock-handle-size, 4px)";
  const placement: React.CSSProperties = entry.side === "start"
    ? { insetBlock: 0, insetInlineEnd: 0, width: thickness }
    : entry.side === "end"
      ? { insetBlock: 0, insetInlineStart: 0, width: thickness }
      : entry.side === "top" ? { insetInline: 0, bottom: 0, height: thickness } : { insetInline: 0, top: 0, height: thickness };
  return (
    <Primitive.div
      ref={ref}
      role="separator"
      tabIndex={0}
      aria-label={context.handleLabel}
      aria-orientation={vertical ? "vertical" : "horizontal"}
      aria-valuemin={MIN_AUTO_HIDE_SIZE}
      aria-valuenow={Math.round(size)}
      data-dock-flyout-handle=""
      data-side={entry.side}
      onPointerDown={(event) => {
        if (isPrimaryPointerDown(event)) {
          press(event.nativeEvent, event.currentTarget);
        }
      }}
      onKeyDown={event => context.handleFlyoutKey(entry, event)}
      style={{ position: "absolute", touchAction: "none", cursor: vertical ? "col-resize" : "row-resize", ...placement }}
    />
  );
}
