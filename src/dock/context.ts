import type * as React from "react";
import type { DockAction, DockAutoHide, DockFloating, DockGroup, DockGroupPlace, DockLayout, DockRect, DockSide, DockSplit, DockTarget } from "./types";
import type { DropZone } from "./zones";
import { createRequiredContext } from "../shared/context";
import { ROOT_NAME } from "./constants";

/** How a panel's content lives while another tab of its group is selected. */
export type DockRenderMode = "whenVisible" | "keepAlive" | "overlay";

export interface DockPanelDefinition {
  title: string;
  content: React.ReactNode;
  /** Whether the panel can be closed. @default true */
  closable?: boolean;
  /**
   * `"keepAlive"` keeps hidden content mounted with its state and its effects paused.
   * `"whenVisible"` mounts the content only while its tab is selected. `"overlay"` keeps it
   * mounted and never moves it in the document, drawing it over its group instead, so frames
   * and media inside keep running when the panel moves. @default "keepAlive"
   */
  render?: DockRenderMode;
}

export interface DockApi {
  layout: DockLayout;
  dispatch: (action: DockAction) => void;
  activate: (panel: string) => void;
  close: (panel: string) => void;
  move: (panel: string, to: DockTarget) => void;
  moveGroup: (group: string, to: DockTarget) => void;
  maximize: (group: string | null) => void;
  /** Floats a panel in the middle of the dock. */
  float: (panel: string) => void;
  /** Opens a group in a window of its own; call it from a click, which browsers require for new windows. */
  popout: (group: string) => void;
  /** Brings a floating, popout or hidden group back to the main surface. */
  dock: (group: string) => void;
  /**
   * Hides a group along an edge of the dock, keeping its size; without `side`, along the edge
   * nearest to it.
   */
  autoHide: (group: string, side?: DockSide) => void;
  /** The group hidden along an edge that is revealed over the main surface, if any. */
  revealed: string | null;
  /** Reveals a group hidden along an edge, or with `null` hides it again. */
  reveal: (group: string | null) => void;
}

export interface DockTabRenderProps {
  panel: string;
  title: string;
  active: boolean;
  closable: boolean;
  close: () => void;
}

export interface DockStripTabRenderProps {
  panel: string;
  title: string;
  side: DockSide;
  /** Whether the panel shows in its revealed group. */
  revealed: boolean;
}

export interface DockTabOverflowRenderProps {
  /** The panels whose tabs do not fit, in order. */
  panels: readonly string[];
  /** Whether the menu listing them is open. */
  open: boolean;
}

export interface DockGroupRenderProps {
  group: string;
  place: DockGroupPlace;
  panels: readonly string[];
  active: string;
  maximized: boolean;
  api: DockApi;
}

export interface PanelDrag {
  kind: "panel";
  panel: string;
  group: string;
  zone: DropZone | null;
}

export interface GroupDrag {
  kind: "group";
  group: string;
  zone: DropZone | null;
  rect: DockRect;
}

export interface FloatResize {
  kind: "resize";
  group: string;
  rect: DockRect;
}

export interface SplitResize {
  kind: "split";
  split: string;
  sizes: number[];
}

export interface FlyoutResize {
  kind: "flyout";
  group: string;
  size: number;
}

export type DragState = PanelDrag | GroupDrag | FloatResize | SplitResize | FlyoutResize;

export interface GroupElements {
  group: HTMLElement;
  tabBar: HTMLElement;
  content: HTMLElement;
}

export interface DockContextValue {
  dockId: string;
  layout: DockLayout;
  panels: Readonly<Record<string, DockPanelDefinition>>;
  api: DockApi;
  drag: DragState | null;
  /** The panel being docked with the keyboard. */
  docking: string | null;
  /** The panel whose tab takes focus once it shows. */
  focusRef: React.RefObject<string | null>;
  handleLabel: string;
  stripLabel: string;
  tabOverflowLabel: string;
  touchMargin: number;
  renderTab: (tab: DockTabRenderProps) => React.ReactNode;
  renderStripTab: (tab: DockStripTabRenderProps) => React.ReactNode;
  renderTabOverflow: (overflow: DockTabOverflowRenderProps) => React.ReactNode;
  renderGroupControls: ((group: DockGroupRenderProps) => React.ReactNode) | undefined;
  registerGroup: (group: string, elements: GroupElements | null) => void;
  registerStrip: (side: DockSide, element: HTMLElement | null) => void;
  splitSizes: (split: DockSplit) => number[];
  floatingRect: (entry: DockFloating) => DockRect;
  flyoutSize: (entry: DockAutoHide) => number;
  beginTabDrag: (group: DockGroup, panel: string, event: PointerEvent, element: HTMLElement) => void;
  beginGroupDrag: (group: DockGroup, event: PointerEvent, element: HTMLElement) => void;
  beginFloatResize: (group: DockGroup, event: PointerEvent, element: HTMLElement) => void;
  beginSplitResize: (split: DockSplit, index: number, event: PointerEvent, element: HTMLElement) => void;
  beginFlyoutResize: (entry: DockAutoHide, event: PointerEvent, element: HTMLElement) => void;
  handleTabKey: (group: DockGroup, panel: string, event: React.KeyboardEvent<HTMLElement>) => void;
  handleTabBlur: (panel: string) => void;
  /** Whether a click on a tab only ends a drag that started on it. */
  consumeDragClick: (panel: string) => boolean;
  handleSplitKey: (split: DockSplit, index: number, event: React.KeyboardEvent<HTMLElement>) => void;
  handleFlyoutKey: (entry: DockAutoHide, event: React.KeyboardEvent<HTMLElement>) => void;
  /** Reveals the group of a strip button with its panel selected, or hides it when it shows that panel already. */
  toggleStripTab: (group: DockGroup, panel: string, moveFocus: boolean) => void;
}

export const [DockContext, useDockContext] = createRequiredContext<DockContextValue>(ROOT_NAME);
