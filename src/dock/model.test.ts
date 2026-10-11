import type { DockLayout, DockNode } from "./types";
import { describe, expect, it } from "vitest";
import { createDockLayout, dockReducer, findGroup, normalizeLayout, pruneLayout, validateLayout } from "./model";

function shape(node: DockNode | null): string {
  if (!node) {
    return "empty";
  }
  if (node.type === "group") {
    return `(${node.panels.map(panel => (panel === node.active ? `${panel}*` : panel)).join(" ")})`;
  }
  const letter = node.orientation === "horizontal" ? "H" : "V";
  return `${letter}[${node.children.map((child, index) => `${Number(node.sizes[index]!.toFixed(3))} ${shape(child)}`).join(" | ")}]`;
}

function base(): DockLayout {
  return createDockLayout({
    root: {
      orientation: "horizontal",
      sizes: [0.25, 0.75],
      children: [
        { panels: ["explorer", "search"] },
        { orientation: "vertical", sizes: [0.7, 0.3], children: [{ panels: ["editor", "preview"], active: "preview" }, { panels: ["terminal"] }] },
      ],
    },
  });
}

describe("dock layout", () => {
  it("builds a layout with ids and histories", () => {
    const layout = base();
    expect(shape(layout.root)).toBe("H[0.25 (explorer* search) | 0.75 V[0.7 (editor preview*) | 0.3 (terminal*)]]");
    expect(findGroup(layout, "group-2")).toMatchObject({ panels: ["editor", "preview"], active: "preview", history: ["preview", "editor"] });
    expect(layout.root).toMatchObject({ id: "split-2", type: "split" });
  });

  it("selects tabs and remembers the order they were used in", () => {
    const layout = dockReducer(dockReducer(base(), { type: "activate", panel: "search" }), { type: "activate", panel: "explorer" });
    expect(findGroup(layout, "group-1")).toMatchObject({ active: "explorer", history: ["explorer", "search"] });
  });

  it("selects the most recently used tab when the selected one closes, and drops empty groups", () => {
    const opened = dockReducer(dockReducer(base(), { type: "add", panel: "outline", to: { type: "group", group: "group-2", index: 0 } }), { type: "activate", panel: "editor" });
    expect(shape(opened.root)).toContain("(outline editor* preview)");
    const closed = dockReducer(opened, { type: "close", panel: "editor" });
    expect(findGroup(closed, "group-2")).toMatchObject({ active: "outline", history: ["outline", "preview"] });
    const empty = dockReducer(closed, { type: "close", panel: "terminal" });
    expect(shape(empty.root)).toBe("H[0.25 (explorer* search) | 0.75 (outline* preview)]");
  });

  it("reorders tabs within a group and moves them between groups", () => {
    const reordered = dockReducer(base(), { type: "move", panel: "explorer", to: { type: "group", group: "group-1", index: 2 } });
    expect(shape(reordered.root)).toContain("(search explorer*)");
    const moved = dockReducer(base(), { type: "move", panel: "search", to: { type: "group", group: "group-3", index: 0 } });
    expect(shape(moved.root)).toBe("H[0.25 (explorer*) | 0.75 V[0.7 (editor preview*) | 0.3 (search* terminal)]]");
  });

  it("splits a group beside it, flattening splits of the same orientation", () => {
    const after = dockReducer(base(), { type: "move", panel: "search", to: { type: "split", group: "group-1", side: "end" } });
    expect(shape(after.root)).toBe("H[0.125 (explorer*) | 0.125 (search*) | 0.75 V[0.7 (editor preview*) | 0.3 (terminal*)]]");
    const above = dockReducer(base(), { type: "move", panel: "terminal", to: { type: "split", group: "group-1", side: "top" } });
    expect(shape(above.root)).toBe("H[0.25 V[0.5 (terminal*) | 0.5 (explorer* search)] | 0.75 (editor preview*)]");
    expect(dockReducer(above, { type: "move", panel: "terminal", to: { type: "split", group: findGroupOf(above, "terminal"), side: "bottom" } })).toBe(above);
  });

  it("docks along an edge of the main surface", () => {
    const top = dockReducer(base(), { type: "move", panel: "terminal", to: { type: "edge", side: "top" } });
    expect(shape(top.root)).toBe("V[0.25 (terminal*) | 0.75 H[0.25 (explorer* search) | 0.75 (editor preview*)]]");
    const start = dockReducer(base(), { type: "move", panel: "terminal", to: { type: "edge", side: "start" } });
    expect(shape(start.root)).toBe("H[0.25 (terminal*) | 0.188 (explorer* search) | 0.563 (editor preview*)]");
  });

  it("floats panels, pops them out and returns them where they came from", () => {
    const rect = { x: 10, y: 20, width: 300, height: 200 };
    const floating = dockReducer(base(), { type: "move", panel: "search", to: { type: "float", rect } });
    expect(floating.floating).toEqual([{ group: { type: "group", id: "group-4", panels: ["search"], active: "search", history: ["search"] }, rect }]);
    const placed = dockReducer(floating, { type: "place", group: "group-4", rect: { ...rect, x: 50 } });
    expect(placed.floating[0]!.rect.x).toBe(50);
    const popped = dockReducer(base(), { type: "move", panel: "preview", to: { type: "popout", rect } });
    expect(popped.popouts[0]).toMatchObject({ origin: "group-2", group: { panels: ["preview"] } });
    expect(shape(dockReducer(popped, { type: "return", group: popped.popouts[0]!.group.id }).root)).toContain("(editor preview*)");
    const orphaned = dockReducer(dockReducer(popped, { type: "close", panel: "editor" }), { type: "return", group: popped.popouts[0]!.group.id });
    expect(shape(orphaned.root)).toBe("H[0.188 (explorer* search) | 0.563 (terminal*) | 0.25 (preview*)]");
  });

  it("moves whole groups, keeping their tab order and selection", () => {
    const floating = dockReducer(base(), { type: "moveGroup", group: "group-2", to: { type: "float", rect: { x: 0, y: 0, width: 100, height: 100 } } });
    expect(floating.floating[0]!.group).toMatchObject({ panels: ["editor", "preview"], active: "preview" });
    const docked = dockReducer(floating, { type: "moveGroup", group: floating.floating[0]!.group.id, to: { type: "group", group: "group-1" } });
    expect(shape(docked.root)).toBe("H[0.25 (explorer search editor preview*) | 0.75 (terminal*)]");
    expect(dockReducer(base(), { type: "moveGroup", group: "group-1", to: { type: "group", group: "group-1" } })).toEqual(base());
  });

  it("resizes splits and maximizes groups of the main surface", () => {
    const resized = dockReducer(base(), { type: "resize", split: "split-2", sizes: [0.4, 0.6] });
    expect(shape(resized.root)).toMatch(/^H\[0\.4 .* \| 0\.6 /);
    expect(() => dockReducer(base(), { type: "resize", split: "split-2", sizes: [1] })).toThrow("needs 2 shares above 0");
    const maximized = dockReducer(base(), { type: "maximize", group: "group-3" });
    expect(maximized.maximized).toBe("group-3");
    expect(dockReducer(maximized, { type: "close", panel: "terminal" }).maximized).toBeNull();
    const floating = dockReducer(base(), { type: "move", panel: "search", to: { type: "float", rect: { x: 0, y: 0, width: 1, height: 1 } } });
    expect(() => dockReducer(floating, { type: "maximize", group: "group-4" })).toThrow("maximizes only groups of its main surface");
  });

  it("restores its rules and rejects malformed layouts", () => {
    const messy: DockLayout = {
      root: {
        type: "split",
        id: "s",
        orientation: "horizontal",
        sizes: [2, 2],
        children: [
          { type: "split", id: "t", orientation: "horizontal", sizes: [1, 3], children: [{ type: "group", id: "a", panels: ["one"], active: "gone", history: [] }, { type: "group", id: "b", panels: ["two"], active: "two", history: ["two"] }] },
          { type: "group", id: "c", panels: [], active: "", history: [] },
        ],
      },
      floating: [],
      popouts: [],
      maximized: "c",
    };
    const normalized = normalizeLayout(messy);
    expect(shape(normalized.root)).toBe("H[0.25 (one*) | 0.75 (two*)]");
    expect(normalized.maximized).toBeNull();
    const twice = { ...normalized, floating: [{ group: { type: "group" as const, id: "d", panels: ["one"], active: "one", history: ["one"] }, rect: { x: 0, y: 0, width: 1, height: 1 } }] };
    expect(() => validateLayout(twice)).toThrow("places the panel \"one\" more than once");
  });

  it("leaves out panels that are not known any more", () => {
    expect(shape(pruneLayout(base(), ["explorer", "editor"]).root)).toBe("H[0.25 (explorer*) | 0.75 (editor*)]");
  });
});

function findGroupOf(layout: DockLayout, panel: string): string {
  const visit = (node: DockNode | null): string | undefined => {
    if (!node) {
      return undefined;
    }
    if (node.type === "group") {
      return node.panels.includes(panel) ? node.id : undefined;
    }
    return node.children.map(visit).find(Boolean);
  };
  return visit(layout.root)!;
}
