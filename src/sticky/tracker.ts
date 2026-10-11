// @env browser
import type { Point } from "../shared/types";
import { renderSynchronously } from "../shared/flush";
import { observeElementSize } from "../shared/resize-observer";
import { onScrollFrame } from "../shared/scroll";
import { contentOrigin, holdInFlow, offsetFrom } from "./measure";

interface Tracked {
  element: HTMLElement;
  reference: HTMLElement;
  /** Where the element sits in normal flow, in the reference's content; `null` until measured. */
  inFlow: Point | null;
  /** Hears how far sticking moved the element from where it sits in normal flow. */
  onMove: (displacement: Point) => void;
}

interface DocumentTracker {
  tracked: Set<Tracked>;
  /** The elements whose place in normal flow is measured again next. */
  stale: Set<Tracked>;
  queued: boolean;
  stopScrolling: () => void;
}

/** A reference whose children are watched once for every sticky element in it. */
interface ContainerWatch {
  tracked: Set<Tracked>;
  stop: () => void;
}

const trackers = new WeakMap<Document, DocumentTracker>();
const containers = new WeakMap<Element, ContainerWatch>();

/**
 * Tells every element how far sticking moved it. Every position is read before any element
 * hears of it, since what an element does with it may change the page and lay it out again.
 */
function follow(tracker: DocumentTracker): void {
  const origins = new Map<Element, Point>();
  const moves: { entry: Tracked; displacement: Point }[] = [];
  for (const entry of tracker.tracked) {
    if (!entry.inFlow) {
      continue;
    }
    let origin = origins.get(entry.reference);
    if (!origin) {
      origin = contentOrigin(entry.reference);
      origins.set(entry.reference, origin);
    }
    const current = offsetFrom(entry.element, origin);
    moves.push({ entry, displacement: { x: current.x - entry.inFlow.x, y: current.y - entry.inFlow.y } });
  }
  renderSynchronously(() => {
    for (const { entry, displacement } of moves) {
      entry.onMove(displacement);
    }
  });
}

/** Measures where the stale elements sit in normal flow, all of them in one layout. */
function measure(tracker: DocumentTracker): void {
  const stale = [...tracker.stale];
  tracker.stale.clear();
  const restores = stale.map(entry => holdInFlow(entry.element));
  const places = stale.map(entry => offsetFrom(entry.element, contentOrigin(entry.reference)));
  restores.forEach(restore => restore());
  stale.forEach((entry, index) => {
    entry.inFlow = places[index]!;
  });
  follow(tracker);
}

function markStale(tracker: DocumentTracker, entry: Tracked): void {
  tracker.stale.add(entry);
  if (tracker.queued) {
    return;
  }
  tracker.queued = true;
  // One measurement for every change reported together, before the next paint.
  queueMicrotask(() => {
    tracker.queued = false;
    if (tracker.stale.size > 0) {
      measure(tracker);
    }
  });
}

/**
 * Where an element sits in normal flow changes when anything beside it resizes, or when
 * siblings come and go. The reference and its children are watched once, however many sticky
 * elements it holds, and only the children that come and go are watched anew.
 */
function watch(reference: HTMLElement, tracker: DocumentTracker): ContainerWatch {
  const existing = containers.get(reference);
  if (existing) {
    return existing;
  }
  const tracked = new Set<Tracked>();
  const changed = (): void => {
    for (const entry of tracked) {
      markStale(tracker, entry);
    }
  };
  const stops = new Map<Node, () => void>();
  const observe = (node: Element): void => {
    if (!stops.has(node)) {
      stops.set(node, observeElementSize(node, changed));
    }
  };
  observe(reference);
  for (const child of reference.children) {
    observe(child);
  }
  const mutations = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.removedNodes) {
        stops.get(node)?.();
        stops.delete(node);
      }
      for (const node of record.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE && node.parentNode === reference) {
          observe(node as Element);
        }
      }
    }
    changed();
  });
  mutations.observe(reference, { childList: true });
  const container: ContainerWatch = {
    tracked,
    stop: () => {
      mutations.disconnect();
      stops.forEach(stop => stop());
    },
  };
  containers.set(reference, container);
  return container;
}

/**
 * Follows how far sticking moves `element` from where it sits in normal flow within
 * `reference`, together with every other sticky element of the document: one scroll listener
 * reads them all, and the ones whose place changed are measured again together.
 */
export function trackSticky(element: HTMLElement, reference: HTMLElement, onMove: (displacement: Point) => void): () => void {
  const ownerDocument = element.ownerDocument;
  let tracker = trackers.get(ownerDocument);
  if (!tracker) {
    const created: DocumentTracker = { tracked: new Set(), stale: new Set(), queued: false, stopScrolling: () => {} };
    created.stopScrolling = onScrollFrame(ownerDocument, () => follow(created));
    trackers.set(ownerDocument, created);
    tracker = created;
  }
  const entry: Tracked = { element, reference, inFlow: null, onMove };
  tracker.tracked.add(entry);
  const container = watch(reference, tracker);
  container.tracked.add(entry);
  markStale(tracker, entry);
  const current = tracker;
  return () => {
    current.tracked.delete(entry);
    current.stale.delete(entry);
    container.tracked.delete(entry);
    if (container.tracked.size === 0) {
      container.stop();
      containers.delete(reference);
    }
    if (current.tracked.size === 0) {
      current.stopScrolling();
      trackers.delete(ownerDocument);
    }
  };
}
