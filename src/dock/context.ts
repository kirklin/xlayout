import type * as React from "react";
import type { DockAction, DockFloating, DockGroup, DockGroupPlace, DockLayout, DockRect, DockSplit, DockTarget } from "./types";
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
  /** Brings a floating or popout group back to the main surface. */
  dock: (group: string) => void;
}

export interface DockTabRenderProps {
  panel: string;
  title: string;
  active: boolean;
  closable: boolean;
  close: () => void;
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

export type DragState = PanelDrag | GroupDrag | FloatResize | SplitResize;

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
  handleLabel: string;
  renderTab: (tab: DockTabRenderProps) => React.ReactNode;
  renderGroupControls: ((group: DockGroupRenderProps) => React.ReactNode) | undefined;
  registerGroup: (group: string, elements: GroupElements | null) => void;
  splitSizes: (split: DockSplit) => number[];
  floatingRect: (entry: DockFloating) => DockRect;
  beginTabDrag: (group: DockGroup, panel: string, event: React.PointerEvent<HTMLElement>) => void;
  beginGroupDrag: (group: DockGroup, event: React.PointerEvent<HTMLElement>) => void;
  beginFloatResize: (group: DockGroup, event: React.PointerEvent<HTMLElement>) => void;
  beginSplitResize: (split: DockSplit, index: number, event: React.PointerEvent<HTMLElement>) => void;
  handleTabKey: (group: DockGroup, panel: string, event: React.KeyboardEvent<HTMLElement>) => void;
  handleTabBlur: (panel: string) => void;
  /** Whether a click on a tab only ends a drag that started on it. */
  consumeDragClick: (panel: string) => boolean;
  handleSplitKey: (split: DockSplit, index: number, event: React.KeyboardEvent<HTMLElement>) => void;
}

export const [DockContext, useDockContext] = createRequiredContext<DockContextValue>(ROOT_NAME);
