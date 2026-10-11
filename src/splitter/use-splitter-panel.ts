"use client";

import type { PanelSize } from "./types";
import * as React from "react";
import { useSplitterContext, useSplitterPanelContext } from "./context";

export interface SplitterPanelApi {
  id: string;
  /** Size in percent, or `undefined` before the group has measured its panels. */
  size: number | undefined;
  collapsed: boolean;
  collapsible: boolean;
  collapse: () => void;
  expand: () => void;
  resize: (size: PanelSize) => void;
}

/** State and actions of the panel this hook is called in. */
export function useSplitterPanel(): SplitterPanelApi {
  const { id } = useSplitterPanelContext("useSplitterPanel");
  const context = useSplitterContext("useSplitterPanel");
  const state = context.panelStates.get(id);
  const { actions } = context;
  return React.useMemo(() => ({
    id,
    size: state?.size,
    collapsed: state?.collapsed ?? false,
    collapsible: state?.constraints.collapsible ?? false,
    collapse: () => actions.collapse(id),
    expand: () => actions.expand(id),
    resize: (size: PanelSize) => actions.resize(id, size),
  }), [id, state, actions]);
}
