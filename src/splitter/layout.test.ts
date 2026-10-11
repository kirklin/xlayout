import type { PanelConstraints, PanelResizeBehavior, ResolvedPanel, SizeContext } from "./types";
import { describe, expect, it } from "vitest";
import {
  adjustLayoutByDelta,
  clampPanelSize,
  computeInitialLayout,
  deriveLayout,
  fitToConstraints,
  getHandleRange,
  isCollapsed,
  normalizeLayout,
  parsePanelSize,
  reconcileLayout,
  resizePanelTo,
  resolvePanel,
  toPercentage,
} from "./layout";

const context: SizeContext = {
  panelSpace: 1000,
  rootFontSize: 16,
  groupFontSize: 20,
  viewportWidth: 1200,
  viewportHeight: 800,
};

function panel(overrides: Partial<PanelConstraints> = {}): PanelConstraints {
  const minSize = overrides.minSize ?? 0;
  const collapsedSize = overrides.collapsedSize ?? 0;
  return {
    minSize,
    maxSize: 100,
    collapsible: false,
    collapsedSize,
    collapseThreshold: (minSize - collapsedSize) / 2,
    disabled: false,
    ...overrides,
  };
}

function resolved(id: string, defaultSize?: number, overrides: Partial<PanelConstraints> = {}, resizeBehavior: PanelResizeBehavior = "proportional"): ResolvedPanel {
  return { id, defaultSize, resizeBehavior, constraints: panel(overrides) };
}

const baseProps = {
  id: "a",
  defaultSize: undefined,
  minSize: undefined,
  maxSize: undefined,
  collapsible: false,
  collapsedSize: undefined,
  collapseThreshold: undefined,
  disabled: false,
  resizeBehavior: "proportional" as const,
};

describe("parsePanelSize", () => {
  it("treats numbers as percentages", () => {
    expect(parsePanelSize(25)).toEqual({ value: 25, unit: "%" });
  });

  it("reads every supported unit", () => {
    expect(parsePanelSize("12.5%")).toEqual({ value: 12.5, unit: "%" });
    expect(parsePanelSize("200px")).toEqual({ value: 200, unit: "px" });
    expect(parsePanelSize("10rem")).toEqual({ value: 10, unit: "rem" });
    expect(parsePanelSize("3em")).toEqual({ value: 3, unit: "em" });
    expect(parsePanelSize("20vw")).toEqual({ value: 20, unit: "vw" });
    expect(parsePanelSize(".5vh")).toEqual({ value: 0.5, unit: "vh" });
  });

  it("rejects unknown units and non-finite numbers", () => {
    expect(() => parsePanelSize("20pt" as never)).toThrow("Invalid panel size \"20pt\"");
    expect(() => parsePanelSize(Number.NaN)).toThrow("Invalid panel size: NaN");
  });
});

describe("toPercentage", () => {
  it("converts absolute lengths against the panel space", () => {
    expect(toPercentage("200px", context)).toBe(20);
    expect(toPercentage("10rem", context)).toBe(16);
    expect(toPercentage("5em", context)).toBe(10);
    expect(toPercentage("10vw", context)).toBe(12);
    expect(toPercentage("25vh", context)).toBe(20);
    expect(toPercentage(30, context)).toBe(30);
  });

  it("returns 0 for absolute lengths while the group has no size", () => {
    expect(toPercentage("200px", { ...context, panelSpace: 0 })).toBe(0);
  });
});

describe("resolvePanel", () => {
  it("fills in default constraints", () => {
    expect(resolvePanel(baseProps, context)).toEqual({ id: "a", defaultSize: undefined, resizeBehavior: "proportional", constraints: panel() });
  });

  it("resolves absolute lengths and places the threshold half way by default", () => {
    const result = resolvePanel({ ...baseProps, defaultSize: "300px", minSize: "100px", maxSize: "50%", collapsible: true, collapsedSize: "40px" }, context);
    expect(result.defaultSize).toBe(30);
    expect(result.constraints).toEqual(panel({ minSize: 10, maxSize: 50, collapsible: true, collapsedSize: 4, collapseThreshold: 3 }));
  });

  it("accepts a custom collapse threshold, limited to the collapse distance", () => {
    expect(resolvePanel({ ...baseProps, minSize: 20, collapsible: true, collapseThreshold: "50px" }, context).constraints.collapseThreshold).toBe(5);
    expect(resolvePanel({ ...baseProps, minSize: 20, collapsible: true, collapseThreshold: 80 }, context).constraints.collapseThreshold).toBe(20);
  });

  it("rejects a percentage minimum above the maximum", () => {
    expect(() => resolvePanel({ ...baseProps, minSize: 60, maxSize: 40 }, context)).toThrow("minSize (60) larger than its maxSize (40)");
  });

  it("rejects a collapsed size above the minimum", () => {
    expect(() => resolvePanel({ ...baseProps, collapsible: true, minSize: 10, collapsedSize: 20 }, context)).toThrow("collapsedSize (20) larger than its minSize (10)");
  });

  it("lets the maximum win when absolute lengths contradict each other", () => {
    const result = resolvePanel({ ...baseProps, minSize: "800px", maxSize: "60%" }, context);
    expect(result.constraints.minSize).toBe(60);
    expect(result.constraints.maxSize).toBe(60);
  });
});

describe("clampPanelSize", () => {
  const sidebar = panel({ minSize: 25, collapsible: true, collapsedSize: 5, collapseThreshold: 5 });

  it("collapses an expanded panel only past the threshold below its minimum", () => {
    expect(clampPanelSize(21, 30, sidebar)).toBe(25);
    expect(clampPanelSize(19.9, 30, sidebar)).toBe(5);
  });

  it("expands a collapsed panel only past the threshold above its collapsed size", () => {
    expect(clampPanelSize(9, 5, sidebar)).toBe(5);
    expect(clampPanelSize(10, 5, sidebar)).toBe(25);
  });

  it("keeps sizes within the maximum", () => {
    expect(clampPanelSize(120, 30, sidebar)).toBe(100);
    expect(fitToConstraints(10, panel({ minSize: 20 }))).toBe(20);
  });
});

describe("normalizeLayout", () => {
  it("keeps a valid layout", () => {
    expect(normalizeLayout([25, 75], [panel(), panel()])).toEqual([25, 75]);
  });

  it("moves sizes into their ranges and shares the difference", () => {
    expect(normalizeLayout([10, 90], [panel({ minSize: 20 }), panel()])).toEqual([20, 80]);
    expect(normalizeLayout([20, 20, 20], [panel(), panel(), panel({ maxSize: 30 })])).toEqual([35, 35, 30]);
  });

  it("changes disabled panels only when the enabled ones cannot absorb the difference", () => {
    expect(normalizeLayout([30, 50, 10], [panel({ disabled: true }), panel(), panel()])).toEqual([30, 55, 15]);
    expect(normalizeLayout([30, 50], [panel({ disabled: true }), panel({ maxSize: 60 })])).toEqual([40, 60]);
  });

  it("keeps collapsed panels collapsed", () => {
    expect(normalizeLayout([0, 40], [panel({ collapsible: true, minSize: 20 }), panel()])).toEqual([0, 100]);
  });

  it("scales the layout when the minimums do not fit", () => {
    expect(normalizeLayout([50, 50], [panel({ minSize: 80 }), panel({ minSize: 100 })])).toEqual([44.4444444444, 55.5555555556]);
  });

  it("rejects a size count that does not match the panels", () => {
    expect(() => normalizeLayout([100], [panel(), panel()])).toThrow("Expected 2 panel sizes but received 1");
  });
});

describe("computeInitialLayout", () => {
  it("shares the space left by panels with a default size", () => {
    expect(computeInitialLayout([resolved("a", 20), resolved("b"), resolved("c")], undefined)).toEqual([20, 40, 40]);
  });

  it("prefers sizes from the default layout", () => {
    expect(computeInitialLayout([resolved("a", 20), resolved("b")], { a: 70, b: 30 })).toEqual([70, 30]);
  });

  it("fits the defaults to the constraints", () => {
    expect(computeInitialLayout([resolved("a", 10, { minSize: 25 }), resolved("b", 90)], undefined)).toEqual([25, 75]);
  });
});

describe("reconcileLayout", () => {
  it("grows an added panel to its default size from the panel before it", () => {
    expect(reconcileLayout(["a", "b"], [25, 75], [resolved("a"), resolved("b"), resolved("c", 20)])).toEqual([25, 55, 20]);
  });

  it("grows an added first panel from the panel after it", () => {
    expect(reconcileLayout(["b", "c"], [40, 60], [resolved("a", 25), resolved("b"), resolved("c")])).toEqual([25, 15, 60]);
  });

  it("gives a removed panel's space to the panel that shared its handle", () => {
    expect(reconcileLayout(["a", "b", "c"], [20, 20, 60], [resolved("a"), resolved("b")])).toEqual([20, 80]);
    expect(reconcileLayout(["a", "b", "c"], [20, 30, 50], [resolved("b"), resolved("c")])).toEqual([50, 50]);
  });

  it("starts over when no panel is kept", () => {
    expect(reconcileLayout(["a"], [100], [resolved("b", 30), resolved("c")])).toEqual([30, 70]);
  });
});

describe("deriveLayout", () => {
  const panels = [resolved("nav", undefined, {}, "fixed"), resolved("main")];

  it("keeps fixed panels at their pixel size when the group grows or shrinks", () => {
    expect(deriveLayout([25, 75], panels, 800, 1000)).toEqual([20, 80]);
    expect(deriveLayout([25, 75], panels, 800, 400)).toEqual([50, 50]);
  });

  it("keeps proportional layouts unchanged", () => {
    expect(deriveLayout([25, 75], [resolved("a"), resolved("b")], 800, 1000)).toEqual([25, 75]);
  });

  it("restores sizes that a small group squeezed once the group grows back", () => {
    const sidebar = [resolved("nav", undefined, { minSize: 30 }), resolved("main")];
    expect(deriveLayout([20, 80], sidebar, 1000, 1000)).toEqual([30, 70]);
    expect(deriveLayout([20, 80], [resolved("nav", undefined, { minSize: 15 }), resolved("main")], 1000, 1000)).toEqual([20, 80]);
  });
});

describe("adjustLayoutByDelta", () => {
  const two = [panel(), panel()];

  it("moves space across the handle", () => {
    expect(adjustLayoutByDelta({ layout: [50, 50], constraints: two, handleIndex: 0, delta: 10, trigger: "pointer" })).toEqual([60, 40]);
    expect(adjustLayoutByDelta({ layout: [50, 50], constraints: two, handleIndex: 0, delta: -10, trigger: "pointer" })).toEqual([40, 60]);
  });

  it("stops at the maximum of the growing side", () => {
    const constraints = [panel({ maxSize: 55 }), panel()];
    expect(adjustLayoutByDelta({ layout: [50, 50], constraints, handleIndex: 0, delta: 10, trigger: "pointer" })).toEqual([55, 45]);
    expect(adjustLayoutByDelta({ layout: [55, 45], constraints, handleIndex: 0, delta: 10, trigger: "pointer" })).toEqual([55, 45]);
  });

  it("takes space from further panels once the neighbour reaches its minimum", () => {
    const constraints = [panel(), panel({ minSize: 20 }), panel({ minSize: 20 })];
    expect(adjustLayoutByDelta({ layout: [40, 30, 30], constraints, handleIndex: 0, delta: 15, trigger: "pointer" })).toEqual([55, 20, 25]);
    expect(adjustLayoutByDelta({ layout: [40, 30, 30], constraints, handleIndex: 0, delta: 25, trigger: "pointer" })).toEqual([60, 20, 20]);
    expect(adjustLayoutByDelta({ layout: [30, 30, 40], constraints: [panel({ minSize: 20 }), panel({ minSize: 20 }), panel()], handleIndex: 1, delta: -25, trigger: "pointer" })).toEqual([20, 20, 60]);
  });

  it("grows further panels once the panel next to the handle reaches its maximum", () => {
    const constraints = [panel(), panel({ maxSize: 40 }), panel()];
    expect(adjustLayoutByDelta({ layout: [30, 30, 40], constraints, handleIndex: 1, delta: 20, trigger: "pointer" })).toEqual([40, 40, 20]);
  });

  it("skips disabled panels on both sides", () => {
    const constraints = [panel(), panel({ disabled: true }), panel()];
    expect(adjustLayoutByDelta({ layout: [30, 30, 40], constraints, handleIndex: 1, delta: 10, trigger: "pointer" })).toEqual([40, 30, 30]);
    expect(adjustLayoutByDelta({ layout: [30, 30, 40], constraints, handleIndex: 0, delta: 10, trigger: "pointer" })).toEqual([40, 30, 30]);
  });

  it("holds a collapsible panel at its minimum until the pointer passes the threshold", () => {
    const constraints = [panel(), panel({ minSize: 20, collapsible: true })];
    expect(adjustLayoutByDelta({ layout: [70, 30], constraints, handleIndex: 0, delta: 15, trigger: "pointer" })).toEqual([80, 20]);
    expect(adjustLayoutByDelta({ layout: [70, 30], constraints, handleIndex: 0, delta: 19, trigger: "pointer" })).toEqual([80, 20]);
    expect(adjustLayoutByDelta({ layout: [70, 30], constraints, handleIndex: 0, delta: 20, trigger: "pointer" })).toEqual([100, 0]);
  });

  it("uses the panel's own collapse threshold", () => {
    const constraints = [panel(), panel({ minSize: 20, collapsible: true, collapseThreshold: 2 })];
    expect(adjustLayoutByDelta({ layout: [70, 30], constraints, handleIndex: 0, delta: 11, trigger: "pointer" })).toEqual([80, 20]);
    expect(adjustLayoutByDelta({ layout: [70, 30], constraints, handleIndex: 0, delta: 12, trigger: "pointer" })).toEqual([100, 0]);
    expect(adjustLayoutByDelta({ layout: [100, 0], constraints, handleIndex: 0, delta: -1.9, trigger: "pointer" })).toEqual([100, 0]);
    expect(adjustLayoutByDelta({ layout: [100, 0], constraints, handleIndex: 0, delta: -2, trigger: "pointer" })).toEqual([80, 20]);
  });

  it("restores the starting layout when the pointer returns", () => {
    const constraints = [panel(), panel({ minSize: 20, collapsible: true })];
    const start = [70, 30];
    expect(adjustLayoutByDelta({ layout: start, constraints, handleIndex: 0, delta: 25, trigger: "pointer" })).toEqual([100, 0]);
    expect(adjustLayoutByDelta({ layout: start, constraints, handleIndex: 0, delta: 0, trigger: "pointer" })).toEqual(start);
  });

  it("collapses a panel at its minimum with one keyboard step", () => {
    const constraints = [panel(), panel({ minSize: 20, collapsible: true, collapsedSize: 5 })];
    expect(adjustLayoutByDelta({ layout: [80, 20], constraints, handleIndex: 0, delta: 1, trigger: "keyboard" })).toEqual([95, 5]);
  });

  it("expands a collapsed panel to its minimum", () => {
    const constraints = [panel(), panel({ minSize: 20, collapsible: true })];
    expect(adjustLayoutByDelta({ layout: [100, 0], constraints, handleIndex: 0, delta: -9, trigger: "pointer" })).toEqual([100, 0]);
    expect(adjustLayoutByDelta({ layout: [100, 0], constraints, handleIndex: 0, delta: -10, trigger: "pointer" })).toEqual([80, 20]);
    expect(adjustLayoutByDelta({ layout: [100, 0], constraints, handleIndex: 0, delta: -25, trigger: "pointer" })).toEqual([75, 25]);
    expect(adjustLayoutByDelta({ layout: [100, 0], constraints, handleIndex: 0, delta: -1, trigger: "keyboard" })).toEqual([80, 20]);
  });

  it("keeps a collapsed panel collapsed when the other side cannot give up its minimum", () => {
    const constraints = [panel({ minSize: 90 }), panel({ minSize: 20, collapsible: true })];
    expect(adjustLayoutByDelta({ layout: [100, 0], constraints, handleIndex: 0, delta: -30, trigger: "pointer" })).toEqual([100, 0]);
  });

  it("gives the space a collapsing panel frees to the panels before the handle", () => {
    const constraints = [panel(), panel({ maxSize: 50 }), panel({ minSize: 40, collapsible: true })];
    expect(adjustLayoutByDelta({ layout: [20, 30, 50], constraints, handleIndex: 1, delta: 30, trigger: "pointer" })).toEqual([50, 50, 0]);
  });

  it("does not collapse a panel when nothing can take its space", () => {
    const constraints = [panel({ maxSize: 70 }), panel({ minSize: 20, collapsible: true })];
    expect(adjustLayoutByDelta({ layout: [60, 40], constraints, handleIndex: 0, delta: 30, trigger: "pointer" })).toEqual([70, 30]);
  });

  it("rejects handles that do not exist", () => {
    expect(() => adjustLayoutByDelta({ layout: [50, 50], constraints: two, handleIndex: 1, delta: 5, trigger: "pointer" })).toThrow("There is no handle after panel 1");
  });
});

describe("resizePanelTo", () => {
  it("resizes through the handle after the panel first", () => {
    expect(resizePanelTo([30, 40, 30], [panel(), panel(), panel()], 1, 50)).toEqual([30, 50, 20]);
  });

  it("uses the handle before the panel for what the next panels cannot give", () => {
    expect(resizePanelTo([30, 40, 30], [panel(), panel(), panel({ minSize: 25 })], 1, 55)).toEqual([20, 55, 25]);
  });

  it("collapses and expands a panel", () => {
    const constraints = [panel(), panel({ minSize: 20, collapsible: true })];
    const collapsed = resizePanelTo([60, 40], constraints, 1, 0);
    expect(collapsed).toEqual([100, 0]);
    expect(isCollapsed(collapsed[1]!, constraints[1]!)).toBe(true);
    expect(resizePanelTo(collapsed, constraints, 1, 40)).toEqual([60, 40]);
  });
});

describe("getHandleRange", () => {
  it("reports how small and large the panel before the handle can get", () => {
    const constraints = [panel({ minSize: 10, collapsible: true }), panel({ minSize: 30 }), panel({ minSize: 20 })];
    expect(getHandleRange([30, 40, 30], constraints, 0)).toEqual({ min: 0, max: 50 });
    expect(getHandleRange([30, 40, 30], constraints, 1)).toEqual({ min: 30, max: 50 });
  });
});
