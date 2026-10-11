/**
 * A panel size. Numbers and `%` strings are percentages of the space the panels share;
 * `px`, `rem`, `em`, `vw` and `vh` strings are converted against the current group size.
 */
export type PanelSize = number | `${number}%` | `${number}px` | `${number}rem` | `${number}em` | `${number}vw` | `${number}vh`;

/** Panel sizes in percent keyed by panel id. The values add up to 100. */
export type SplitterLayout = Record<string, number>;

/**
 * How a panel reacts when the group itself changes size: `"proportional"` panels keep their
 * percentage, `"fixed"` panels keep their pixel size while proportional panels absorb the
 * difference.
 */
export type PanelResizeBehavior = "proportional" | "fixed";

export interface PanelConstraints {
  minSize: number;
  maxSize: number;
  collapsible: boolean;
  collapsedSize: number;
  /**
   * How far past the minimum a drag must go before the panel collapses, and how far past
   * the collapsed size before it expands again.
   */
  collapseThreshold: number;
  /** Disabled panels keep their size while handles are dragged or moved with the keyboard. */
  disabled: boolean;
}

export interface ResolvedPanel {
  id: string;
  constraints: PanelConstraints;
  /** Percentage from the panel's own `defaultSize`, if it has one. */
  defaultSize: number | undefined;
  resizeBehavior: PanelResizeBehavior;
}

export type ResizeTrigger = "pointer" | "keyboard";

/** What finished a layout change. */
export type LayoutChangeSource = "pointer" | "keyboard" | "imperative";

export interface LayoutCommitDetails {
  source: LayoutChangeSource;
}

/** Values needed to turn absolute lengths into percentages of the shared panel space. */
export interface SizeContext {
  /** Pixels shared by all panels along the group's axis. */
  panelSpace: number;
  rootFontSize: number;
  groupFontSize: number;
  viewportWidth: number;
  viewportHeight: number;
}

export interface PanelMeasurement {
  /** Percent of the space the panels share. */
  percentage: number;
  pixels: number;
}

export interface SplitterActions {
  /** The layout currently rendered. */
  getLayout: () => SplitterLayout;
  /** Applies a layout after fitting it to the panel constraints. */
  setLayout: (layout: SplitterLayout) => void;
  /** Returns every panel to its default size. */
  reset: () => void;
  /** Resizes a panel, taking or giving space from the panels after it, then before it. */
  resize: (panelId: string, size: PanelSize) => void;
  collapse: (panelId: string) => void;
  /** Expands a collapsed panel to the size it had before collapsing. */
  expand: (panelId: string) => void;
  isCollapsed: (panelId: string) => boolean;
  getPanelSize: (panelId: string) => PanelMeasurement;
}

/** Persists layouts across page loads. `localStorage` and `sessionStorage` satisfy it. */
export interface LayoutStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

/** What is persisted for one set of panels. */
export interface StoredLayout {
  layout: SplitterLayout;
  /** Pixels the panels shared when the layout was requested, so fixed panels restore exactly. */
  panelSpace: number;
  /** Sizes collapsed panels return to when expanded. */
  expandSizes: Record<string, number>;
}
