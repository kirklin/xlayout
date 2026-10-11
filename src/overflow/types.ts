/** `"visible"`: every item shows; `"overflow"`: some are hidden; `"hidden"`: all are hidden. */
export type OverflowGroupState = "visible" | "overflow" | "hidden";

/** Which end loses items first when their priorities are equal. */
export type OverflowDirection = "end" | "start";

export interface OverflowState {
  /** Values of hidden items in document order. */
  hidden: string[];
  /** Values of visible items in document order. */
  visible: string[];
  groups: Record<string, OverflowGroupState>;
}

export interface MeasuredItem {
  value: string;
  /** Size along the axis including margins. */
  size: number;
  priority: number;
  pinned: boolean;
  group: string | undefined;
}

export interface MeasuredDivider {
  group: string;
  size: number;
}

export interface FitInput {
  /** Space along the axis inside the root's padding. */
  available: number;
  gap: number;
  /** Items in document order. */
  items: MeasuredItem[];
  dividers: MeasuredDivider[];
  indicatorSize: number;
  minimumVisible: number;
  overflowDirection: OverflowDirection;
  reserveIndicator: boolean;
}

export interface FitResult {
  visible: Set<string>;
  indicatorVisible: boolean;
}
