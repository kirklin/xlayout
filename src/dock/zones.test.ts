import type { DockGeometry, DragSource } from "./zones";
import { describe, expect, it } from "vitest";
import { resolveDropZone } from "./zones";

const FLOAT = { width: 360, height: 260 };

function geometry(rtl = false): DockGeometry {
  const main = (id: string, x: number) => ({
    id,
    place: "main" as const,
    rect: { x, y: 0, width: 500, height: 600 },
    tabBar: { x, y: 0, width: 500, height: 30 },
    content: { x, y: 30, width: 500, height: 570 },
    tabs: [{ rect: { x, y: 0, width: 100, height: 30 }, index: 0 }, { rect: { x: x + 100, y: 0, width: 100, height: 30 }, index: 1 }],
  });
  return {
    surface: { x: 0, y: 0, width: 1000, height: 600 },
    surfaceEmpty: false,
    groups: [
      {
        id: "floating",
        place: "floating",
        rect: { x: 300, y: 200, width: 200, height: 150 },
        tabBar: { x: 300, y: 200, width: 200, height: 30 },
        content: { x: 300, y: 230, width: 200, height: 120 },
        tabs: [{ rect: { x: 300, y: 200, width: 80, height: 30 }, index: 0 }],
      },
      main("a", 0),
      main("b", 500),
    ],
    strips: [],
    bounds: { x: 0, y: 0, width: 1000, height: 800 },
    rtl,
  };
}

const FROM_B: DragSource = { group: "b", panel: "panel", count: 2 };

describe("drop zones", () => {
  it("docks along the edges of the main surface, also just outside them", () => {
    expect(resolveDropZone({ x: 5, y: 300 }, geometry(), FROM_B, FLOAT)).toEqual({
      target: { type: "edge", side: "start" },
      indicator: { x: 0, y: 0, width: 250, height: 600 },
    });
    expect(resolveDropZone({ x: -20, y: 300 }, geometry(true), FROM_B, FLOAT)?.target).toEqual({ type: "edge", side: "end" });
    expect(resolveDropZone({ x: 500, y: 595 }, geometry(), FROM_B, FLOAT)?.target).toEqual({ type: "edge", side: "bottom" });
  });

  it("inserts among tabs before the first tab whose middle the pointer has not passed", () => {
    expect(resolveDropZone({ x: 140, y: 15 }, geometry(), FROM_B, FLOAT)).toEqual({
      target: { type: "group", group: "a", index: 1 },
      indicator: { x: 99, y: 0, width: 2, height: 30 },
    });
    expect(resolveDropZone({ x: 400, y: 15 }, geometry(), FROM_B, FLOAT)?.target).toEqual({ type: "group", group: "a", index: 2 });
  });

  it("prefers a tab bar along the edge of the main surface to the edge itself", () => {
    expect(resolveDropZone({ x: 140, y: 4 }, geometry(), FROM_B, FLOAT)?.target).toEqual({ type: "group", group: "a", index: 1 });
    expect(resolveDropZone({ x: 140, y: -20 }, geometry(), FROM_B, FLOAT)?.target).toEqual({ type: "edge", side: "top" });
  });

  it("splits a group near the edges of its content and joins it in the middle", () => {
    expect(resolveDropZone({ x: 480, y: 450 }, geometry(), FROM_B, FLOAT)).toEqual({
      target: { type: "split", group: "a", side: "end" },
      indicator: { x: 250, y: 30, width: 250, height: 570 },
    });
    expect(resolveDropZone({ x: 150, y: 450 }, geometry(), FROM_B, FLOAT)).toEqual({
      target: { type: "group", group: "a" },
      indicator: { x: 0, y: 30, width: 500, height: 570 },
    });
  });

  it("does nothing for drops that would leave the source as it is", () => {
    expect(resolveDropZone({ x: 750, y: 300 }, geometry(), FROM_B, FLOAT)).toBeNull();
    expect(resolveDropZone({ x: 980, y: 300 }, geometry(), FROM_B, FLOAT)?.target).toEqual({ type: "split", group: "b", side: "end" });
    expect(resolveDropZone({ x: 980, y: 300 }, geometry(), { ...FROM_B, count: 1 }, FLOAT)).toBeNull();
    expect(resolveDropZone({ x: 550, y: 15 }, geometry(), { group: "b", panel: null, count: 2 }, FLOAT)).toBeNull();
  });

  it("puts floating groups on top and never splits them", () => {
    expect(resolveDropZone({ x: 495, y: 300 }, geometry(), FROM_B, FLOAT)?.target).toEqual({ type: "group", group: "floating" });
  });

  it("floats a drop away from every group, within the dock", () => {
    expect(resolveDropZone({ x: 500, y: 750 }, geometry(), FROM_B, FLOAT)).toEqual({
      target: { type: "float", rect: { x: 320, y: 540, width: 360, height: 260 } },
      indicator: { x: 320, y: 540, width: 360, height: 260 },
    });
  });

  it("inserts by the panels' places when some tabs wait in the overflow menu", () => {
    const crowded = geometry();
    // Group a holds four panels; the second and third do not fit, so its tabs show the first and the last.
    crowded.groups[1] = {
      ...crowded.groups[1]!,
      tabs: [{ rect: { x: 0, y: 0, width: 100, height: 30 }, index: 0 }, { rect: { x: 100, y: 0, width: 100, height: 30 }, index: 3 }],
    };
    expect(resolveDropZone({ x: 140, y: 15 }, crowded, FROM_B, FLOAT)?.target).toEqual({ type: "group", group: "a", index: 3 });
    expect(resolveDropZone({ x: 400, y: 15 }, crowded, FROM_B, FLOAT)?.target).toEqual({ type: "group", group: "a", index: 4 });
  });

  it("hides along an edge when dropped on its strip", () => {
    const withStrip: DockGeometry = { ...geometry(), strips: [{ side: "start", rect: { x: -24, y: 0, width: 24, height: 600 } }] };
    expect(resolveDropZone({ x: -10, y: 300 }, withStrip, FROM_B, FLOAT)).toEqual({
      target: { type: "autoHide", side: "start" },
      indicator: { x: -24, y: 0, width: 24, height: 600 },
    });
  });

  it("docks anywhere on an empty main surface", () => {
    expect(resolveDropZone({ x: 500, y: 300 }, { ...geometry(), surfaceEmpty: true, groups: [] }, FROM_B, FLOAT)).toEqual({
      target: { type: "edge", side: "end" },
      indicator: { x: 0, y: 0, width: 1000, height: 600 },
    });
  });
});
