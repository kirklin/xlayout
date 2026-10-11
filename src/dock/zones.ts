import type { Point } from "../shared/types";
import type { GroupPlace } from "./model";
import type { DockRect, DockSide, DockTarget } from "./types";
import { CONTENT_EDGE_SHARE, EDGE_SHARE, SURFACE_EDGE_INSIDE, SURFACE_EDGE_OUTSIDE } from "./constants";

export interface GroupGeometry {
  id: string;
  place: GroupPlace;
  rect: DockRect;
  tabBar: DockRect;
  content: DockRect;
  /** The group's tabs in order. */
  tabs: DockRect[];
}

export interface DockGeometry {
  /** The main surface. */
  surface: DockRect;
  /** Whether the main surface holds no group. */
  surfaceEmpty: boolean;
  /** Groups from the topmost: floating groups first, then those of the main surface. */
  groups: GroupGeometry[];
  /** The dock's own box; a group that starts floating stays inside it. */
  bounds: DockRect;
  rtl: boolean;
}

/** What is being dragged. */
export interface DragSource {
  group: string;
  /** The dragged panel, or `null` when its whole group is dragged. */
  panel: string | null;
  /** How many panels the source group holds. */
  count: number;
}

export interface DropZone {
  target: DockTarget;
  /** Where the dropped panel would show, for an indicator. */
  indicator: DockRect;
}

type Physical = "top" | "bottom" | "left" | "right";

function contains(rect: DockRect, point: Point): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function logical(side: Physical, rtl: boolean): DockSide {
  if (side === "left") {
    return rtl ? "end" : "start";
  }
  if (side === "right") {
    return rtl ? "start" : "end";
  }
  return side;
}

/** The part of `rect` along `side` that takes `share` of it. */
function band(rect: DockRect, side: Physical, share: number): DockRect {
  switch (side) {
    case "top":
      return { ...rect, height: rect.height * share };
    case "bottom":
      return { ...rect, y: rect.y + rect.height * (1 - share), height: rect.height * share };
    case "left":
      return { ...rect, width: rect.width * share };
    case "right":
      return { ...rect, x: rect.x + rect.width * (1 - share), width: rect.width * share };
  }
}

function nearest(distances: Record<Physical, number>): [Physical, number] {
  return (Object.entries(distances) as [Physical, number][]).reduce((best, entry) => (entry[1] < best[1] ? entry : best));
}

/** Among a group's tabs, before the first whose middle the pointer has not passed in reading order. */
function tabZone(group: GroupGeometry, point: Point, source: DragSource, rtl: boolean): DropZone | null {
  if (group.id === source.group && source.panel === null) {
    return null;
  }
  const index = group.tabs.findIndex(tab => (rtl ? point.x > tab.x + tab.width / 2 : point.x < tab.x + tab.width / 2));
  const before = index === -1 ? undefined : group.tabs[index];
  const last = group.tabs.at(-1);
  const line = before
    ? (rtl ? before.x + before.width : before.x)
    : last ? (rtl ? last.x : last.x + last.width) : (rtl ? group.tabBar.x + group.tabBar.width : group.tabBar.x);
  return {
    target: { type: "group", group: group.id, index: index === -1 ? group.tabs.length : index },
    indicator: { x: line - 1, y: group.tabBar.y, width: 2, height: group.tabBar.height },
  };
}

/** Near an edge of a group of the main surface the group splits; elsewhere the drop joins it. */
function contentZone(group: GroupGeometry, point: Point, source: DragSource, rtl: boolean): DropZone | null {
  const { content } = group;
  const itself = group.id === source.group;
  if (group.place === "main") {
    const [side, distance] = nearest({
      top: (point.y - content.y) / content.height,
      bottom: (content.y + content.height - point.y) / content.height,
      left: (point.x - content.x) / content.width,
      right: (content.x + content.width - point.x) / content.width,
    });
    if (distance < CONTENT_EDGE_SHARE) {
      if (itself && (source.panel === null || source.count === 1)) {
        return null;
      }
      return { target: { type: "split", group: group.id, side: logical(side, rtl) }, indicator: band(content, side, 0.5) };
    }
  }
  return itself ? null : { target: { type: "group", group: group.id }, indicator: content };
}

/**
 * Where a drop at `point` would put the dragged panel or group, or `null` for nowhere. Floating
 * groups come first since they lie on top, then the tab bars of the main surface, then its edges,
 * which a tab bar along an edge would otherwise hide, then the content of its groups.
 */
export function resolveDropZone(point: Point, geometry: DockGeometry, source: DragSource, floatSize: { width: number; height: number }): DropZone | null {
  const { surface, rtl } = geometry;
  for (const group of geometry.groups.filter(entry => entry.place !== "main")) {
    if (contains(group.rect, point)) {
      if (contains(group.tabBar, point)) {
        return tabZone(group, point, source, rtl);
      }
      return contains(group.content, point) ? contentZone(group, point, source, rtl) : null;
    }
  }
  if (geometry.surfaceEmpty && contains(surface, point)) {
    return { target: { type: "edge", side: "end" }, indicator: surface };
  }
  const main = geometry.groups.filter(entry => entry.place === "main");
  const tabBar = main.find(group => contains(group.tabBar, point));
  if (tabBar) {
    return tabZone(tabBar, point, source, rtl);
  }
  const reach = { x: surface.x - SURFACE_EDGE_OUTSIDE, y: surface.y - SURFACE_EDGE_OUTSIDE, width: surface.width + 2 * SURFACE_EDGE_OUTSIDE, height: surface.height + 2 * SURFACE_EDGE_OUTSIDE };
  if (!geometry.surfaceEmpty && contains(reach, point)) {
    const [side, distance] = nearest({
      top: point.y - surface.y,
      bottom: surface.y + surface.height - point.y,
      left: point.x - surface.x,
      right: surface.x + surface.width - point.x,
    });
    if (distance <= SURFACE_EDGE_INSIDE) {
      return { target: { type: "edge", side: logical(side, rtl) }, indicator: band(surface, side, EDGE_SHARE) };
    }
  }
  const owner = main.find(group => contains(group.rect, point));
  if (owner) {
    return contains(owner.content, point) ? contentZone(owner, point, source, rtl) : null;
  }
  const { bounds } = geometry;
  const width = Math.min(floatSize.width, bounds.width);
  const height = Math.min(floatSize.height, bounds.height);
  const rect = {
    x: Math.min(Math.max(point.x - width / 2, bounds.x), bounds.x + bounds.width - width),
    y: Math.min(Math.max(point.y - height / 2, bounds.y), bounds.y + bounds.height - height),
    width,
    height,
  };
  return { target: { type: "float", rect }, indicator: rect };
}
