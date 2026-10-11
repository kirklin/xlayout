import type * as React from "react";
import type { Direction } from "../shared/types";
import type { LengthContext } from "./length";
import type { PersistedSidebar, ShellState, SidebarApi } from "./types";
import { createRequiredContext } from "../shared/context";
import { ROOT_NAME, SIDEBAR_NAME } from "./constants";

/** Marks the overlay of a sidebar, so an open drawer leaves it interactive. */
export const OVERLAY_ATTRIBUTE = "data-xlayout-shell-overlay";

/** Starts a touch swipe of a drawer from a pointer that went down on `target`. */
export type SwipeStarter = (event: PointerEvent, target: HTMLElement) => void;

export interface ShellContextValue {
  /** The root element, once mounted. */
  element: HTMLElement | null;
  isMobile: boolean;
  hydrated: boolean;
  direction: Direction;
  mainId: string;
  mainRef: React.RefObject<HTMLElement | null>;
  /** Persisted state from storage, or the state passed in from the server. */
  persisted: ShellState | undefined;
  sidebars: ReadonlyMap<string, SidebarApi>;
  resizingId: string | null;
  publishSidebar: (api: SidebarApi, element: HTMLElement) => () => void;
  persist: (id: string, value: PersistedSidebar) => void;
  /** Remembers the trigger that opened a drawer, so closing it returns focus there. */
  rememberOpener: (sidebarId: string, element: HTMLElement) => void;
  takeOpener: (sidebarId: string) => HTMLElement | undefined;
  setResizingId: (id: string | null) => void;
  registerLandmark: (element: HTMLElement) => () => void;
  setRegionHeight: (region: "header" | "footer", height: number | null) => void;
  /** Lets an overlay swipe its drawer. */
  registerSwipe: (sidebarId: string, start: SwipeStarter) => () => void;
  startSwipe: (sidebarId: string, event: PointerEvent, target: HTMLElement) => void;
}

export const [ShellContext, useShellContext] = createRequiredContext<ShellContextValue>(ROOT_NAME);

export interface SidebarLimits {
  min: number;
  max: number;
  collapsed: number;
  threshold: number;
  collapsible: boolean;
}

export interface SidebarContextValue {
  api: SidebarApi;
  /** Width constraints in pixels, once the sidebar has been measured. */
  limits: SidebarLimits | null;
  /** Expanded width in pixels, once the sidebar has been measured. */
  widthPixels: number | null;
  /**
   * Opens or collapses the sidebar at a width. `persist` stores the result, which only
   * happens once a change is finished.
   */
  applyWidth: (open: boolean, width: number, persist: boolean) => void;
  lengthContext: LengthContext | null;
}

export const [SidebarContext, useSidebarContext] = createRequiredContext<SidebarContextValue>(SIDEBAR_NAME);
