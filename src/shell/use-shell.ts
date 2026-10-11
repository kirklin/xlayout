"use client";

import type { SidebarApi } from "./types";
import { useShellContext } from "./context";

export interface ShellApi {
  /** Whether sidebars open as drawers. Always `false` on the server and during hydration. */
  isMobile: boolean;
  sidebars: ReadonlyMap<string, SidebarApi>;
}

export function useShell(): ShellApi {
  const { isMobile, sidebars } = useShellContext("useShell");
  return { isMobile, sidebars };
}

/**
 * State and actions of one sidebar, for custom triggers and menus. Sidebars register when
 * they mount, so the first render returns `undefined`.
 */
export function useShellSidebar(id = "start"): SidebarApi | undefined {
  const { sidebars } = useShellContext("useShellSidebar");
  return sidebars.get(id);
}
