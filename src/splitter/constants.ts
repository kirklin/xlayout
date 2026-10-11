import type { SizeContext } from "./types";

export const ROOT_NAME = "Splitter";
export const PANEL_NAME = "Splitter.Panel";
export const HANDLE_NAME = "Splitter.Handle";
export const TRIGGER_NAME = "Splitter.Trigger";

/** Percent the handle moves per arrow key press. */
export const DEFAULT_KEYBOARD_STEP = 5;

/** Percent the handle moves per arrow key press with Shift held. */
export const DEFAULT_KEYBOARD_LARGE_STEP = 20;

/** Pixels around a perpendicular handle in which a pointer down resizes both groups. */
export const INTERSECTION_MARGIN = 4;

export const EMPTY_SIZE_CONTEXT: SizeContext = {
  panelSpace: 0,
  rootFontSize: 16,
  groupFontSize: 16,
  viewportWidth: 0,
  viewportHeight: 0,
};
