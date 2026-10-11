import type { PhysicalSide } from "./types";

export const ROOT_NAME = "Sticky";
export const GROUP_NAME = "Sticky.Group";

export const PHYSICAL_SIDES: readonly PhysicalSide[] = ["top", "right", "bottom", "left"];

/** Displacements smaller than this come from sub-pixel rounding. */
export const STUCK_TOLERANCE = 0.5;
