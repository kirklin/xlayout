"use client";

import * as React from "react";
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

export function useScrollSpy(): ScrollSpyApi {
  const { active, visible, passed, navigate } = useScrollSpyContext("useScrollSpy");
  const navigateTo = React.useCallback((value: string) => navigate(value), [navigate]);
  return React.useMemo(() => ({
    value: active,
    visible: [...visible],
    passed: [...passed],
    navigate: navigateTo,
  }), [active, visible, passed, navigateTo]);
}
