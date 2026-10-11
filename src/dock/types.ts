/** `"horizontal"` lays children side by side, `"vertical"` stacks them. */
export type DockOrientation = "horizontal" | "vertical";

/** A side of a group or of the main surface; the inline sides follow the reading direction. */
export type DockSide = "top" | "bottom" | "start" | "end";

/** Panels shown as tabs, one at a time. */
export interface DockGroup {
  type: "group";
  id: string;
  /** Panel ids in tab order. */
  panels: string[];
  /** The panel whose tab is selected. */
  active: string;
  /** Panel ids from the most recently selected, to pick the next tab when the selected one leaves. */
  history: string[];
}

/** Groups or further splits side by side or stacked. */
export interface DockSplit {
  type: "split";
  id: string;
  orientation: DockOrientation;
  children: DockNode[];
  /** Each child's share of the split, adding up to 1. */
  sizes: number[];
}

export type DockNode = DockSplit | DockGroup;

export interface DockRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A group floating above the main surface; its rect is relative to the dock. */
export interface DockFloating {
  group: DockGroup;
  rect: DockRect;
}

/** A group in a window of its own; its rect is on the screen. */
export interface DockPopout {
  group: DockGroup;
  rect: DockRect;
  /** The group its panels came from, to return to when the window closes. */
  origin: string | null;
}

export interface DockLayout {
  /** The main surface; `null` when no panel is docked there. */
  root: DockNode | null;
  floating: DockFloating[];
  popouts: DockPopout[];
  /** A group of the main surface shown alone over all of it. */
  maximized: string | null;
}

/** Among the tabs of a group, before the tab at `index`, or last. */
export interface DockGroupTarget {
  type: "group";
  group: string;
  index?: number;
}

/** Into a new group beside a group of the main surface, taking half of its room. */
export interface DockSplitTarget {
  type: "split";
  group: string;
  side: DockSide;
}

/** Into a new group along an edge of the main surface. */
export interface DockEdgeTarget {
  type: "edge";
  side: DockSide;
}

/** Into a new floating group. */
export interface DockFloatTarget {
  type: "float";
  rect: DockRect;
}

/** Into a new window. */
export interface DockPopoutTarget {
  type: "popout";
  rect: DockRect;
}

/** Where a moved panel or group goes. */
export type DockTarget = DockGroupTarget | DockSplitTarget | DockEdgeTarget | DockFloatTarget | DockPopoutTarget;

export interface DockActivateAction {
  type: "activate";
  panel: string;
}

export interface DockCloseAction {
  type: "close";
  panel: string;
}

export interface DockAddAction {
  type: "add";
  panel: string;
  to: DockTarget;
}

export interface DockMoveAction {
  type: "move";
  panel: string;
  to: DockTarget;
}

/** Moves every panel of a group, keeping their order and the selected one. */
export interface DockMoveGroupAction {
  type: "moveGroup";
  group: string;
  to: DockTarget;
}

export interface DockResizeAction {
  type: "resize";
  split: string;
  sizes: number[];
}

export interface DockMaximizeAction {
  type: "maximize";
  group: string | null;
}

/** Moves or resizes a floating group or a popout window. */
export interface DockPlaceAction {
  type: "place";
  group: string;
  rect: DockRect;
}

/** Puts the panels of a closed popout window back where they came from. */
export interface DockReturnAction {
  type: "return";
  group: string;
}

/** Brings a floating group in front of the other floating groups. */
export interface DockRaiseAction {
  type: "raise";
  group: string;
}

export type DockAction = DockActivateAction | DockCloseAction | DockAddAction | DockMoveAction | DockMoveGroupAction | DockResizeAction | DockMaximizeAction | DockPlaceAction | DockReturnAction | DockRaiseAction;
