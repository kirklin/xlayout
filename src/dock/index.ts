"use client";

export type {
  DockApi,
  DockGroupRenderProps,
  DockPanelDefinition,
  DockRenderMode,
  DockTabRenderProps,
} from "./context";
export { Dock, Root } from "./dock";
export type { DockProps } from "./dock";
export { createDockLayout, dockReducer, EMPTY_LAYOUT, normalizeLayout, pruneLayout } from "./model";
export type { DockGroupInput, DockLayoutInput, DockSplitInput, DockTreeInput, GroupPlace } from "./model";
export type {
  DockAction,
  DockFloating,
  DockGroup,
  DockLayout,
  DockNode,
  DockOrientation,
  DockPopout,
  DockRect,
  DockSide,
  DockSplit,
  DockTarget,
} from "./types";
export { useDock } from "./use-dock";
