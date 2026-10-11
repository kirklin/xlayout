import type * as React from "react";
import type { Direction, Orientation, Point } from "../shared/types";
import type { ResizeLimit, ResizeSession } from "./handle-registry";
import type { PanelSizeProps } from "./layout";
import type { PanelConstraints, SplitterActions, SplitterLayout } from "./types";
import { createRequiredContext } from "../shared/context";
import { PANEL_NAME, ROOT_NAME } from "./constants";

export interface PanelEntry {
  id: string;
  element: HTMLElement;
  sizeProps: PanelSizeProps;
  onCollapsedChange: (collapsed: boolean) => void;
}

export interface HandleEntry {
  id: string;
  element: HTMLElement;
}

export interface PanelState {
  size: number;
  collapsed: boolean;
  constraints: PanelConstraints;
}

export interface HandleState {
  /** Index of the panel before the handle, the panel the handle's value describes. */
  primaryIndex: number;
  primaryId: string;
  valueNow: number;
  valueMin: number;
  valueMax: number;
}

export interface ResizeState {
  handleId: string;
  limit: ResizeLimit;
  /** Pixels the handle is shown away from its place while a deferred resize is previewed. */
  previewOffset: number;
}

export interface SplitterContextValue {
  orientation: Orientation;
  direction: Direction;
  disabled: boolean;
  resizeMode: "live" | "deferred";
  resizing: ResizeState | null;
  panelStates: ReadonlyMap<string, PanelState>;
  /** Sizes from the layout props, for panels the group has not measured yet, as on the server. */
  initialLayout: SplitterLayout | undefined;
  handleStates: ReadonlyMap<string, HandleState>;
  registerPanel: (entry: PanelEntry) => () => void;
  registerHandle: (entry: HandleEntry) => () => void;
  beginResize: (handleId: string, origin: Point) => ResizeSession;
  resizeWithKeyboard: (handleId: string, event: React.KeyboardEvent) => boolean;
  resetHandle: (handleId: string) => void;
  actions: SplitterActions;
}

export const [SplitterContext, useSplitterContext] = createRequiredContext<SplitterContextValue>(ROOT_NAME);

export const [SplitterPanelContext, useSplitterPanelContext] = createRequiredContext<{ id: string }>(PANEL_NAME);
