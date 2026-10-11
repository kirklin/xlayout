/** A side an element sticks to; the inline sides follow the reading direction. */
export type StickySide = "top" | "right" | "bottom" | "left" | "inline-start" | "inline-end";

export type PhysicalSide = "top" | "right" | "bottom" | "left";

export interface ResolvedSide {
  /** The side as it was asked for. */
  side: StickySide;
  physical: PhysicalSide;
}

/** One element of a stack along a side, in the order its layer gives it. */
export interface StackEntry<Key> {
  key: Key;
  layer: number;
  /** The element's own distance from the edge, in pixels. */
  offset: number;
  /** The element's size across the side: its height for top and bottom, its width otherwise. */
  size: number;
}

export interface Stack<Key> {
  /** The distance each element moves away from the edge to clear the layers below its own. */
  offsets: Map<Key, number>;
  /** How far from the edge the whole stack reaches. */
  extent: number;
}
