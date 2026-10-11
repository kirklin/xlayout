export const PRECISION = 10;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Rounds away floating point noise such as `33.333333333333336`. */
export function roundTo(value: number, precision: number = PRECISION): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

/** Compares two numbers after rounding both to `precision` decimals. */
export function fuzzyCompare(a: number, b: number, precision: number = PRECISION): -1 | 0 | 1 {
  const difference = roundTo(a, precision) - roundTo(b, precision);
  if (difference === 0) {
    return 0;
  }
  return difference > 0 ? 1 : -1;
}

export function fuzzyEqual(a: number, b: number, precision: number = PRECISION): boolean {
  return fuzzyCompare(a, b, precision) === 0;
}
