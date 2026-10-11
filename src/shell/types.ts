/** A CSS length. Numbers are pixels. */
export type ShellLength = number | `${number}px` | `${number}rem` | `${number}em` | `${number}vw`;

/** Which inline edge a sidebar sits on; `"start"` is the left edge in left-to-right layouts. */
export type SidebarSide = "start" | "end";

/**
 * What a sidebar does when it collapses on wide screens: `"offcanvas"` moves it away
 * entirely, `"icon"` narrows it to `collapsedWidth`, `"none"` keeps it open.
 */
export type SidebarCollapsible = "offcanvas" | "icon" | "none";

/** `"docked"` sidebars sit beside the content; `"modal"` sidebars open over it as drawers. */
export type SidebarMode = "docked" | "modal";

export type SidebarState = "expanded" | "collapsed";

/** The state of one sidebar that survives page loads. */
export interface PersistedSidebar {
  open: boolean;
  /** Width in pixels, when the user resized the sidebar. */
  width?: number;
}

/** Persisted state of every sidebar, keyed by sidebar id. */
export type ShellState = Record<string, PersistedSidebar>;

/** Persists sidebar state. `localStorage` and `sessionStorage` satisfy it. */
export interface ShellStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export interface SidebarApi {
  id: string;
  side: SidebarSide;
  mode: SidebarMode;
  state: SidebarState;
  collapsible: SidebarCollapsible;
  /** Open on wide screens. */
  open: boolean;
  /** Open as a drawer on narrow screens. */
  openMobile: boolean;
  /** Current expanded width as a CSS length. */
  width: string;
  /** Width the sidebar occupies beside the content right now, as a CSS length. */
  offset: string;
  resizing: boolean;
  /**
   * How far a touch has swiped the drawer from where it rests open, as a share of its width:
   * `0` open, `1` closed. `null` while no touch swipes it.
   */
  swipe: number | null;
  shortcut: string | undefined;
  setOpen: (open: boolean) => void;
  setOpenMobile: (open: boolean) => void;
  /** Toggles the state of the current mode. */
  toggle: () => void;
  setWidth: (width: ShellLength) => void;
  resetWidth: () => void;
}
