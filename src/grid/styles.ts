import type { Breakpoint } from "./breakpoints";
import type { GridItemLayout } from "./types";

/** A value inside a CSS string: quotes and backslashes escaped, line breaks as escapes. */
function cssString(value: string): string {
  return `"${value.replace(/["\\]/g, "\\$&").replace(/\n/g, "\\a ")}"`;
}

/** A name every character of which a container name may hold. */
export function containerName(scope: string): string {
  return `xlayout-grid-${scope.replace(/[^\w-]/g, "-")}`;
}

/**
 * Style rules that place every item at every breakpoint. The narrowest breakpoint applies
 * always and each wider one in a container query on the root, so the layout is right before
 * any script has run.
 */
export function gridStyles(scope: string, breakpoints: readonly Breakpoint[], layouts: ReadonlyMap<string, readonly GridItemLayout[]>): string {
  const canvas = `[data-xlayout-grid-canvas=${cssString(scope)}]`;
  return breakpoints.map((breakpoint, index) => {
    const rules = [
      `${canvas}{--xlayout-grid-columns:${breakpoint.columns}}`,
      ...(layouts.get(breakpoint.name) ?? []).map(item => (
        `${canvas}>[data-xlayout-grid-item=${cssString(item.value)}]`
        + `{--xlayout-grid-x:${item.x};--xlayout-grid-y:${item.y};--xlayout-grid-w:${item.w};--xlayout-grid-h:${item.h}}`
      )),
    ].join("");
    return index === 0 ? rules : `@container ${containerName(scope)} (min-width: ${breakpoint.minWidth}px){${rules}}`;
  }).join("");
}
