import type { GridDerivation, GridItemLayout, GridLayouts, GridRules } from "./types";
import { deriveLayout, normalizeLayout, placeMissing, validateLayout } from "./layout";

export interface Breakpoint {
  name: string;
  /** The narrowest container width it applies to, in pixels. */
  minWidth: number;
  columns: number;
}

/** Breakpoints from the narrowest up. */
export function resolveBreakpoints(minWidths: Readonly<Record<string, number>>, columns: number | Readonly<Record<string, number>>): Breakpoint[] {
  const entries = Object.entries(minWidths);
  if (entries.length === 0) {
    throw new Error("A grid needs at least one breakpoint.");
  }
  return entries
    .map(([name, minWidth]) => {
      const count = typeof columns === "number" ? columns : columns[name];
      if (count === undefined || !Number.isInteger(count) || count < 1) {
        throw new RangeError(`The ${name} breakpoint needs a whole number of columns of at least 1, not ${count}.`);
      }
      return { name, minWidth, columns: count };
    })
    .sort((a, b) => a.minWidth - b.minWidth);
}

/** The widest breakpoint whose minimum width the container reaches, or the narrowest. */
export function breakpointFor(width: number, breakpoints: readonly Breakpoint[]): Breakpoint {
  return breakpoints.findLast(breakpoint => breakpoint.minWidth <= width) ?? breakpoints[0]!;
}

/** The breakpoint whose layout another one starts from: the nearest wider one, or else the nearest narrower one. */
function sourceFor(target: Breakpoint, breakpoints: readonly Breakpoint[], layouts: GridLayouts): Breakpoint | undefined {
  const index = breakpoints.indexOf(target);
  const authored = (breakpoint: Breakpoint): boolean => layouts[breakpoint.name] !== undefined;
  return breakpoints.slice(index + 1).find(authored) ?? breakpoints.slice(0, index).reverse().find(authored);
}

export interface LayoutOptions {
  breakpoints: readonly Breakpoint[];
  layouts: GridLayouts;
  derivation: GridDerivation;
  rules: Omit<GridRules, "columns">;
  /** Items to place: entries for other values are left out, and missing ones are added. */
  values: readonly string[] | null;
}

/** The layout shown at every breakpoint, from the ones given and the ones derived from them. */
export function resolveLayouts(options: LayoutOptions): Map<string, GridItemLayout[]> {
  const { breakpoints, layouts, derivation, rules, values } = options;
  for (const [name, layout] of Object.entries(layouts)) {
    if (!breakpoints.some(breakpoint => breakpoint.name === name)) {
      throw new Error(`The grid has a layout for "${name}", which is not one of its breakpoints.`);
    }
    validateLayout(layout, name);
  }
  return new Map(breakpoints.map((breakpoint) => {
    const own = layouts[breakpoint.name];
    const source = own ? undefined : sourceFor(breakpoint, breakpoints, layouts);
    let layout: GridItemLayout[] = own
      ? [...own]
      : source
        ? deriveLayout(layouts[source.name]!, source.columns, breakpoint.columns, derivation)
        : [];
    if (values) {
      const shown = new Set(values);
      layout = placeMissing(layout.filter(item => shown.has(item.value)), values, breakpoint.columns);
    }
    return [breakpoint.name, normalizeLayout(layout, { ...rules, columns: breakpoint.columns })];
  }));
}
