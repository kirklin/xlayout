import type { Updater } from "./types";

export type PartialKeys<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type RequiredKeys<T, K extends keyof T> = Omit<T, K> &
Required<Pick<T, K>>;
export type Overwrite<T, U extends { [TKey in keyof T]?: any }> = Omit<
  T,
  keyof U
> &
U;

export type UnionToIntersection<T> = (
  T extends any ? (x: T) => any : never
) extends (x: infer R) => any
  ? R
  : never;

export type IsAny<T, Y, N> = 1 extends 0 & T ? Y : N;
export type IsKnown<T, Y, N> = unknown extends T ? N : Y;
export function functionalUpdate<T>(updater: Updater<T>, input: T): T {
  return typeof updater === "function"
    ? (updater as (input: T) => T)(input)
    : updater;
}
