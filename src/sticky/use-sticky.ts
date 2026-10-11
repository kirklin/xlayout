"use client";

import type { StickySide } from "./types";
import { useStickyContext } from "./context";

export interface StickyApi {
  isStuck: boolean;
  /** The sides the element is stuck to right now, named as they were asked for. */
  stuckSides: readonly StickySide[];
}

/** The stuck state of the nearest `Sticky.Root`, for content that changes while it sticks. */
export function useSticky(): StickyApi {
  const { stuckSides } = useStickyContext("useSticky");
  return { isStuck: stuckSides.length > 0, stuckSides };
}
