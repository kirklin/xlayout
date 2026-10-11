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

export interface GridStyleOptions {
  scope: string;
  breakpoints: readonly Breakpoint[];
  layouts: ReadonlyMap<string, readonly GridItemLayout[]>;
  rowHeight: number;
  gap: number;
}

/**
 * Style rules that lay the grid out and place every item at every breakpoint. The narrowest
 * breakpoint applies always and each wider one in a container query on the root, so the layout
 * is right before any script has run, and the markup needs no style attributes.
 */
export function gridStyles({ scope, breakpoints, layouts, rowHeight, gap }: GridStyleOptions): string {
  const root = `[data-xlayout-grid=${cssString(scope)}]`;
  const canvas = `[data-xlayout-grid-canvas=${cssString(scope)}]`;
  const base = `${root}{container-type:inline-size;container-name:${containerName(scope)}}`
    + `${canvas}{display:grid;grid-template-columns:repeat(var(--xlayout-grid-columns),minmax(0,1fr));grid-auto-rows:${rowHeight}px;gap:${gap}px;position:relative}`
    + `${canvas}>[data-xlayout-grid-item]{grid-column:calc(var(--xlayout-grid-x) + 1)/span var(--xlayout-grid-w);grid-row:calc(var(--xlayout-grid-y) + 1)/span var(--xlayout-grid-h)}`;
  return base + breakpoints.map((breakpoint, index) => {
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
