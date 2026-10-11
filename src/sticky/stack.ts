import type { Stack, StackEntry } from "./types";

/**
 * Stacks layers along one side: every element of a layer moves away from the edge past the
 * far edge of all lower layers, and elements of the same layer share that distance, since
 * they take turns sticking rather than stacking.
 */
export function stackLayers<Key>(entries: readonly StackEntry<Key>[]): Stack<Key> {
  const layers = [...new Set(entries.map(entry => entry.layer))].sort((a, b) => a - b);
  const offsets = new Map<Key, number>();
  let reach = 0;
  for (const layer of layers) {
    let layerReach = reach;
    for (const entry of entries) {
      if (entry.layer === layer) {
        offsets.set(entry.key, reach);
        layerReach = Math.max(layerReach, reach + entry.offset + entry.size);
      }
    }
    reach = layerReach;
  }
  return { offsets, extent: reach };
}
