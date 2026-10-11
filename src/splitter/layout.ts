import type {
  PanelConstraints,
  PanelResizeBehavior,
  PanelSize,
  ResizeTrigger,
  ResolvedPanel,
  SizeContext,
  SplitterLayout,
} from "./types";
import { clamp, fuzzyCompare, fuzzyEqual, roundTo } from "../shared/math";

type SizeUnit = "%" | "px" | "rem" | "em" | "vw" | "vh";

const SIZE_PATTERN = /^(-?(?:\d+(?:\.\d+)?|\.\d+))(%|px|rem|em|vw|vh)$/;

export function parsePanelSize(size: PanelSize): { value: number; unit: SizeUnit } {
  if (typeof size === "number") {
    if (!Number.isFinite(size)) {
      throw new TypeError(`Invalid panel size: ${size}`);
    }
    return { value: size, unit: "%" };
  }
  const match = SIZE_PATTERN.exec(size.trim());
  if (!match) {
    throw new TypeError(`Invalid panel size "${size}". Use a number (percent) or a string ending in %, px, rem, em, vw or vh.`);
  }
  return { value: Number(match[1]), unit: match[2] as SizeUnit };
}

export function isPercentageSize(size: PanelSize | undefined): boolean {
  return size === undefined || parsePanelSize(size).unit === "%";
}

/** Converts a panel size to a percentage of the panel space. */
export function toPercentage(size: PanelSize, context: SizeContext): number {
  const { value, unit } = parsePanelSize(size);
  if (unit === "%") {
    return value;
  }
  if (context.panelSpace <= 0) {
    return 0;
  }
  const pixels = {
    px: value,
    rem: value * context.rootFontSize,
    em: value * context.groupFontSize,
    vw: (value * context.viewportWidth) / 100,
    vh: (value * context.viewportHeight) / 100,
  }[unit];
  return (pixels / context.panelSpace) * 100;
}

export interface PanelSizeProps {
  id: string;
  defaultSize: PanelSize | undefined;
  minSize: PanelSize | undefined;
  maxSize: PanelSize | undefined;
  collapsible: boolean;
  collapsedSize: PanelSize | undefined;
  collapseThreshold: PanelSize | undefined;
  disabled: boolean;
  resizeBehavior: PanelResizeBehavior;
}

export function usesAbsoluteSizes(props: PanelSizeProps): boolean {
  return [props.defaultSize, props.minSize, props.maxSize, props.collapsedSize, props.collapseThreshold]
    .some(size => !isPercentageSize(size));
}

export function resolvePanel(props: PanelSizeProps, context: SizeContext): ResolvedPanel {
  const toPercent = (size: PanelSize | undefined, fallback: number): number => (
    size === undefined ? fallback : clamp(toPercentage(size, context), 0, 100)
  );
  const percentagesOnly = !usesAbsoluteSizes(props);
  const minSize = toPercent(props.minSize, 0);
  const maxSize = toPercent(props.maxSize, 100);
  const collapsedSize = toPercent(props.collapsedSize, 0);
  if (percentagesOnly && minSize > maxSize) {
    throw new RangeError(`Panel "${props.id}" has a minSize (${props.minSize}) larger than its maxSize (${props.maxSize}).`);
  }
  if (percentagesOnly && props.collapsible && collapsedSize > minSize) {
    throw new RangeError(`Panel "${props.id}" has a collapsedSize (${props.collapsedSize}) larger than its minSize (${props.minSize}).`);
  }
  // Absolute lengths can contradict each other once converted in a small group; the
  // maximum wins, then the minimum.
  const effectiveMin = Math.min(minSize, maxSize);
  const effectiveCollapsed = props.collapsible ? Math.min(collapsedSize, effectiveMin) : 0;
  const collapseDistance = effectiveMin - effectiveCollapsed;
  const collapseThreshold = props.collapseThreshold === undefined
    ? collapseDistance / 2
    : clamp(toPercentage(props.collapseThreshold, context), 0, collapseDistance);
  return {
    id: props.id,
    defaultSize: props.defaultSize === undefined ? undefined : clamp(toPercentage(props.defaultSize, context), 0, 100),
    resizeBehavior: props.resizeBehavior,
    constraints: {
      minSize: effectiveMin,
      maxSize,
      collapsible: props.collapsible,
      collapsedSize: effectiveCollapsed,
      collapseThreshold,
      disabled: props.disabled,
    },
  };
}

/** Collapsible panels whose collapsed size equals their minimum never count as collapsed. */
export function isCollapsed(size: number, constraints: PanelConstraints): boolean {
  return constraints.collapsible
    && fuzzyEqual(size, constraints.collapsedSize)
    && fuzzyCompare(constraints.collapsedSize, constraints.minSize) < 0;
}

/**
 * Moves `size` into the range a panel allows. Below the minimum a collapsible panel
 * collapses or holds at its minimum depending on which side of the threshold the size
 * lies; the threshold is measured from the minimum while the panel was expanded and from
 * the collapsed size while it was collapsed.
 */
export function clampPanelSize(size: number, previous: number, constraints: PanelConstraints): number {
  const { minSize, maxSize, collapsible, collapsedSize, collapseThreshold } = constraints;
  if (fuzzyCompare(size, minSize) >= 0) {
    return Math.min(maxSize, size);
  }
  if (!collapsible) {
    return minSize;
  }
  const wasCollapsed = fuzzyCompare(previous, collapsedSize) <= 0;
  const boundary = wasCollapsed ? collapsedSize + collapseThreshold : minSize - collapseThreshold;
  return fuzzyCompare(size, collapsedSize) <= 0 || fuzzyCompare(size, boundary) < 0 ? collapsedSize : minSize;
}

export function fitToConstraints(size: number, constraints: PanelConstraints): number {
  return clampPanelSize(size, size, constraints);
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/**
 * Spreads `difference` evenly over the panels in `indices` that still have room, until it
 * is used up or no panel has room left. Returns what is left over.
 */
function spread(sizes: number[], constraints: PanelConstraints[], indices: number[], difference: number): number {
  let remaining = difference;
  while (!fuzzyEqual(remaining, 0)) {
    const growing = remaining > 0;
    const open = indices.filter((index) => {
      const panel = constraints[index]!;
      const size = sizes[index]!;
      if (isCollapsed(size, panel)) {
        return false;
      }
      return growing ? fuzzyCompare(size, panel.maxSize) < 0 : fuzzyCompare(size, panel.minSize) > 0;
    });
    if (open.length === 0) {
      return remaining;
    }
    const share = remaining / open.length;
    for (const index of open) {
      const panel = constraints[index]!;
      const size = sizes[index]!;
      const resized = clamp(size + share, panel.minSize, panel.maxSize);
      remaining -= resized - size;
      sizes[index] = resized;
    }
  }
  return 0;
}

/**
 * Brings a layout in line with the constraints: every panel within its range and the total
 * at 100. The difference goes to enabled panels first, evenly, then to disabled ones. When
 * the constraints cannot all hold, for example absolute minimums in a group that is too
 * small, the sizes are scaled so the panels still fill the group.
 */
export function normalizeLayout(sizes: readonly number[], constraints: PanelConstraints[]): number[] {
  if (sizes.length !== constraints.length) {
    throw new RangeError(`Expected ${constraints.length} panel sizes but received ${sizes.length}.`);
  }
  if (sizes.length === 0) {
    return [];
  }
  const next = sizes.map((size, index) => fitToConstraints(size, constraints[index]!));
  const indices = next.map((_, index) => index);
  const enabled = indices.filter(index => !constraints[index]!.disabled);
  const disabled = indices.filter(index => constraints[index]!.disabled);
  let difference = spread(next, constraints, enabled, 100 - sum(next));
  difference = spread(next, constraints, disabled, difference);
  if (!fuzzyEqual(difference, 0)) {
    const total = sum(next);
    if (total <= 0) {
      return next.map(() => roundTo(100 / next.length));
    }
    return next.map(size => roundTo((size / total) * 100));
  }
  return next.map(size => roundTo(size));
}

/** Panels without a default size share the space the others leave. */
export function computeInitialLayout(panels: ResolvedPanel[], defaultLayout: SplitterLayout | undefined): number[] {
  const known = panels.map(panel => defaultLayout?.[panel.id] ?? panel.defaultSize);
  const assigned = sum(known.filter((size): size is number => size !== undefined));
  const unknownCount = known.filter(size => size === undefined).length;
  const share = unknownCount > 0 ? Math.max(0, 100 - assigned) / unknownCount : 0;
  return normalizeLayout(known.map(size => size ?? share), panels.map(panel => panel.constraints));
}

/** Constraints for changes made in code, which may move disabled panels. */
export function withoutDisabled(constraints: PanelConstraints[]): PanelConstraints[] {
  return constraints.map(panel => (panel.disabled ? { ...panel, disabled: false } : panel));
}

interface AdjustLayoutOptions {
  /** The layout when the interaction started. */
  layout: readonly number[];
  constraints: PanelConstraints[];
  /** Index of the panel before the handle. */
  handleIndex: number;
  /** Percent the handle moves; positive values grow the panel before the handle. */
  delta: number;
  trigger: ResizeTrigger;
}

/**
 * Moves the handle after panel `handleIndex` by `delta` percent.
 *
 * Panels on both sides take part, nearest first: the panel the handle moves towards gives
 * up space until it reaches its minimum, then the next one does, and the panels on the
 * other side grow in the same order until they reach their maximum. Disabled panels keep
 * their size and are skipped. A collapsible panel holds at its minimum until the pointer
 * passes its collapse threshold, then collapses; a collapsed panel next to the handle
 * expands to its minimum once the pointer passes the threshold. Keyboard steps collapse
 * and expand directly. Results are computed from the starting layout, so dragging back
 * restores it exactly.
 */
export function adjustLayoutByDelta(options: AdjustLayoutOptions): number[] {
  const { layout, constraints, handleIndex, delta, trigger } = options;
  if (handleIndex < 0 || handleIndex >= layout.length - 1) {
    throw new RangeError(`There is no handle after panel ${handleIndex}.`);
  }
  if (fuzzyEqual(delta, 0)) {
    return [...layout];
  }

  const inRange = (index: number): boolean => index >= 0 && index < layout.length;
  const growIndex = delta > 0 ? handleIndex : handleIndex + 1;
  const shrinkStart = delta > 0 ? handleIndex + 1 : handleIndex;
  const step = delta > 0 ? 1 : -1;
  const pivot = constraints[growIndex]!;
  const pivotExpands = !pivot.disabled && isCollapsed(layout[growIndex]!, pivot);
  const expandDistance = pivot.minSize - pivot.collapsedSize;
  let amount = Math.abs(delta);

  if (pivotExpands) {
    if (trigger === "pointer" && fuzzyCompare(amount, pivot.collapseThreshold) < 0) {
      return [...layout];
    }
    amount = Math.max(amount, expandDistance);
  }

  const canGrow = (index: number): boolean => {
    const panel = constraints[index]!;
    return !panel.disabled && (index === growIndex || !isCollapsed(layout[index]!, panel));
  };
  let growCapacity = 0;
  for (let index = growIndex; inRange(index); index -= step) {
    if (canGrow(index)) {
      growCapacity += Math.max(0, constraints[index]!.maxSize - layout[index]!);
    }
  }
  const requested = Math.min(growCapacity, amount);
  if (fuzzyCompare(requested, 0) <= 0) {
    return [...layout];
  }

  const next = [...layout];
  let freed = 0;
  for (let index = shrinkStart; inRange(index) && fuzzyCompare(freed, requested) < 0; index += step) {
    const panel = constraints[index]!;
    const size = layout[index]!;
    if (panel.disabled || isCollapsed(size, panel)) {
      continue;
    }
    const remaining = requested - freed;
    if (fuzzyCompare(size - remaining, panel.minSize) >= 0) {
      next[index] = size - remaining;
      freed = requested;
      break;
    }
    if (panel.collapsible) {
      const overshoot = remaining - (size - panel.minSize);
      const collapseFrees = size - panel.collapsedSize;
      const passedThreshold = trigger === "keyboard" || fuzzyCompare(overshoot, panel.collapseThreshold) >= 0;
      if (passedThreshold && fuzzyCompare(freed + collapseFrees, growCapacity) <= 0) {
        next[index] = panel.collapsedSize;
        freed += collapseFrees;
        continue;
      }
      const held = Math.min(size, panel.minSize);
      next[index] = held;
      freed += size - held;
      break;
    }
    const shrunk = Math.min(size, panel.minSize);
    next[index] = shrunk;
    freed += size - shrunk;
  }

  if (pivotExpands && fuzzyCompare(freed, expandDistance) < 0) {
    return [...layout];
  }

  let surplus = freed;
  for (let index = growIndex; inRange(index) && fuzzyCompare(surplus, 0) > 0; index -= step) {
    if (!canGrow(index)) {
      continue;
    }
    const size = next[index]!;
    const grown = Math.min(constraints[index]!.maxSize, size + surplus);
    surplus -= grown - size;
    next[index] = grown;
  }
  return next.map(size => roundTo(size));
}

/**
 * Resizes one panel towards `target` percent, moving the handle after it first and the
 * handle before it for whatever is left. Neighbours collapse only when the target lies past
 * their collapse threshold, as with a pointer drag.
 */
export function resizePanelTo(layout: readonly number[], constraints: PanelConstraints[], panelIndex: number, target: number): number[] {
  let next = [...layout];
  const tryHandle = (handleIndex: number, sign: 1 | -1): void => {
    const remaining = target - next[panelIndex]!;
    if (fuzzyEqual(remaining, 0) || handleIndex < 0 || handleIndex >= layout.length - 1) {
      return;
    }
    next = adjustLayoutByDelta({ layout: next, constraints, handleIndex, delta: remaining * sign, trigger: "pointer" });
  };
  tryHandle(panelIndex, 1);
  tryHandle(panelIndex - 1, -1);
  return next;
}

/**
 * Fits the last layout to a new set of panels. A removed panel's space goes to the panel
 * that shared its handle, the one before it or else the one after it. An added panel grows
 * to its default size through the handle it shares with the panel before it, or after it
 * when it comes first.
 */
export function reconcileLayout(previousIds: readonly string[], previousSizes: readonly number[], panels: ResolvedPanel[]): number[] {
  const ids = panels.map(panel => panel.id);
  const keptIds = [...previousIds];
  const keptSizes = [...previousSizes];
  for (let index = keptIds.length - 1; index >= 0; index--) {
    if (ids.includes(keptIds[index]!)) {
      continue;
    }
    const size = keptSizes[index]!;
    keptIds.splice(index, 1);
    keptSizes.splice(index, 1);
    if (keptIds.length > 0) {
      const neighbour = index > 0 ? index - 1 : 0;
      keptSizes[neighbour] = keptSizes[neighbour]! + size;
    }
  }
  if (keptIds.length === 0) {
    return computeInitialLayout(panels, undefined);
  }

  const constraints = withoutDisabled(panels.map(panel => panel.constraints));
  const kept = new Map(keptIds.map((id, index) => [id, keptSizes[index]!]));
  let layout = ids.map(id => kept.get(id) ?? 0);
  panels.forEach((panel, index) => {
    if (kept.has(panel.id) || panels.length < 2) {
      return;
    }
    const target = panel.defaultSize ?? 100 / panels.length;
    layout = index > 0
      ? adjustLayoutByDelta({ layout, constraints, handleIndex: index - 1, delta: -target, trigger: "pointer" })
      : adjustLayoutByDelta({ layout, constraints, handleIndex: 0, delta: target, trigger: "pointer" });
  });
  return normalizeLayout(layout, constraints);
}

/**
 * The layout to render for a requested layout. When the panel space changed since the
 * request, fixed panels keep their pixel size and proportional panels share the rest in
 * their requested proportions; the result is then fitted to the current constraints.
 */
export function deriveLayout(requested: readonly number[], panels: ResolvedPanel[], requestedSpace: number, currentSpace: number): number[] {
  const constraints = panels.map(panel => panel.constraints);
  const fixed = panels.map(panel => panel.resizeBehavior === "fixed");
  const spaceChanged = requestedSpace > 0 && currentSpace > 0 && !fuzzyEqual(requestedSpace, currentSpace, 3);
  if (!spaceChanged || !fixed.some(Boolean)) {
    return normalizeLayout(requested, constraints);
  }
  const fixedSizes = requested.map((size, index) => (fixed[index] ? (size * requestedSpace) / currentSpace : 0));
  const proportionalTotal = sum(requested.filter((_, index) => !fixed[index]));
  const proportionalCount = fixed.filter(isFixed => !isFixed).length;
  const remaining = Math.max(0, 100 - sum(fixedSizes));
  const sizes = requested.map((size, index) => {
    if (fixed[index]) {
      return fixedSizes[index]!;
    }
    return proportionalTotal > 0 ? (size / proportionalTotal) * remaining : remaining / proportionalCount;
  });
  return normalizeLayout(sizes, constraints);
}

/** The smallest and largest size the panel before a handle can reach through that handle. */
export function getHandleRange(layout: readonly number[], constraints: PanelConstraints[], handleIndex: number): { min: number; max: number } {
  const enabled = withoutDisabled(constraints);
  const smallest = adjustLayoutByDelta({ layout, constraints: enabled, handleIndex, delta: -100, trigger: "keyboard" });
  const largest = adjustLayoutByDelta({ layout, constraints: enabled, handleIndex, delta: 100, trigger: "keyboard" });
  return { min: smallest[handleIndex]!, max: largest[handleIndex]! };
}

export function layoutToRecord(ids: readonly string[], sizes: readonly number[]): SplitterLayout {
  return Object.fromEntries(ids.map((id, index) => [id, sizes[index]!]));
}

export function layoutsEqual(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((size, index) => fuzzyEqual(size, b[index]!));
}
