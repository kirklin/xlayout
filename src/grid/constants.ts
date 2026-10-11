export const ROOT_NAME = "Grid";
export const ITEM_NAME = "Grid.Item";
export const DRAG_HANDLE_NAME = "Grid.DragHandle";
export const RESIZE_HANDLE_NAME = "Grid.ResizeHandle";
export const PLACEHOLDER_NAME = "Grid.Placeholder";

/** The breakpoint a grid without breakpoints has, covering every width. */
export const DEFAULT_BREAKPOINT = "base";
export const DEFAULT_COLUMNS = 12;
export const DEFAULT_ROW_HEIGHT = 150;
export const DEFAULT_GAP = 10;

/** The fastest a drag near an edge scrolls, in pixels per second. */
export const AUTO_SCROLL_SPEED = 900;
/** How near an edge a drag scrolls: a quarter of the scrollport, at most this many pixels. */
export const AUTO_SCROLL_EDGE = 180;
export const AUTO_SCROLL_EDGE_SHARE = 0.25;

export const SLIDE_DURATION = 200;
export const SLIDE_EASING = "cubic-bezier(0.2, 0, 0, 1)";
export const SLIDE_ANIMATION_ID = "xlayout-grid-slide";

/** The value of the item a drag from outside would drop, which no real item can have. */
export const DROP_VALUE = "\u0000drop";
