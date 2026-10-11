import type { StickySide } from "./types";
import * as React from "react";
import { createRequiredContext } from "../shared/context";
import { GROUP_NAME, ROOT_NAME } from "./constants";

export interface StickyContextValue {
  stuckSides: readonly StickySide[];
}

export const [StickyContext, useStickyContext] = createRequiredContext<StickyContextValue>(ROOT_NAME);

export interface GroupMember {
  element: HTMLElement;
  layer: number;
  sides: readonly StickySide[];
  /** The member's own offset; the group measures again when it changes. */
  offset: string;
}

export interface StickyGroupContextValue {
  register: (member: GroupMember) => () => void;
  /** How far the member moves away from `side` to clear the lower layers. */
  offsetOf: (element: HTMLElement | null, side: StickySide) => number;
}

/** Optional: elements outside a group stick on their own. */
export const StickyGroupContext = React.createContext<StickyGroupContextValue | null>(null);
StickyGroupContext.displayName = `${GROUP_NAME}Context`;
