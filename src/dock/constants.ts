export const ROOT_NAME = "Dock";

/** The share of the main surface a group docked along one of its edges takes. */
export const EDGE_SHARE = 0.25;

/** Shares of a split below this are rounding left over from resizing. */
export const SIZE_EPSILON = 1e-6;

/** Pointer distance in pixels inside the main surface's edge that docks along it. */
export const SURFACE_EDGE_INSIDE = 12;
/** And outside it, so a drag that overshoots the edge still docks there. */
export const SURFACE_EDGE_OUTSIDE = 40;
/** The share of a group's content near each edge that splits the group instead of joining it. */
export const CONTENT_EDGE_SHARE = 0.2;

/** The size of a group that starts floating, in pixels. */
export const FLOAT_SIZE = { width: 360, height: 260 };

/** The size in pixels of a group hidden along an edge, while revealed, unless it was given one. */
export const AUTO_HIDE_SIZE = 280;
/** The smallest size in pixels a group hidden along an edge can be resized to. */
export const MIN_AUTO_HIDE_SIZE = 120;
/** How much of the main surface a revealed hidden group leaves showing, at least, in pixels. */
export const FLYOUT_KEEP = 40;
/** A group this many pixels from an edge of the main surface, or closer, touches it. */
export const EDGE_CONTACT = 1;

/** Pointer travel before a press on a tab becomes a drag, so a click stays a click. */
export const DRAG_THRESHOLD = 4;

/**
 * A touch has to go further before it drags a tab, so a swipe up or down scrolls the page
 * before it could start one; held this many milliseconds, it drags right away.
 */
export const TOUCH_DRAG_THRESHOLD = 16;
export const TOUCH_HOLD_DELAY = 450;

/** Pixels a revealed group hidden along an edge grows or shrinks per arrow key press. */
export const KEYBOARD_STEP = 20;

/** The stacking layer of a revealed hidden group: above the main surface, below floating groups. */
export const FLYOUT_LAYER = 2;
/** The stacking layer of the first floating group; each one takes two layers, the second for its overlay panels. */
export const FLOATING_LAYER = 4;

/** The smallest share a resized split child keeps. */
export const MIN_SHARE = 0.05;

/** Keyboard resizing moves a split handle by this share of the split. */
export const KEYBOARD_SHARE = 0.05;
