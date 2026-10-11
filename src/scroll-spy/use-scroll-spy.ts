"use client";

import type { SpyState } from "./context";
import * as React from "react";
import { useStoreSelector } from "../shared/store";
import { useScrollSpyContext } from "./context";

export interface ScrollSpyApi {
  /** The value of the active section. */
  value: string | null;
  /** Sections that show in the scrollport, in document order. */
  visible: readonly string[];
  /** Sections the reader has scrolled past, in document order. */
  passed: readonly string[];
  /** Scrolls to a section and moves focus to it; the URL follows the root's `navigation`. */
  navigate: (value: string) => void;
}

function selectState(state: SpyState): SpyState {
  return state;
}

export function useScrollSpy(): ScrollSpyApi {
  const { state, navigate } = useScrollSpyContext("useScrollSpy");
  const { active, visible, passed } = useStoreSelector(state, selectState);
  const navigateTo = React.useCallback((value: string) => navigate(value), [navigate]);
  return React.useMemo(() => ({
    value: active,
    visible: [...visible],
    passed: [...passed],
    navigate: navigateTo,
  }), [active, visible, passed, navigateTo]);
}
