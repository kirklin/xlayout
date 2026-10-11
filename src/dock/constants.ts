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

/** Pointer travel before a press on a tab becomes a drag, so a click stays a click. */
export const DRAG_THRESHOLD = 4;

/** The smallest share a resized split child keeps. */
export const MIN_SHARE = 0.05;

/** Keyboard resizing moves a split handle by this share of the split. */
export const KEYBOARD_SHARE = 0.05;
