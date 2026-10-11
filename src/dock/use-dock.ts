import type { DockApi } from "./context";
import { useDockContext } from "./context";

/** The layout of the nearest `Dock.Root` and ways to change it, for its panels and controls. */
export function useDock(): DockApi {
  return useDockContext("useDock").api;
}
