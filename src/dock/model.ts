import type {
  DockAction,
  DockGroup,
  DockLayout,
  DockNode,
  DockOrientation,
  DockRect,
  DockSide,
  DockSplit,
  DockTarget,
} from "./types";
import { EDGE_SHARE, ROOT_NAME, SIZE_EPSILON } from "./constants";

export const EMPTY_LAYOUT: DockLayout = { root: null, floating: [], popouts: [], maximized: null };

/** Where a group lives. */
export type GroupPlace = "main" | "floating" | "popout";

type MakeId = (prefix: "group" | "split") => string;

function mainGroups(node: DockNode | null): DockGroup[] {
  if (!node) {
    return [];
  }
  return node.type === "group" ? [node] : node.children.flatMap(mainGroups);
}

function splitsOf(node: DockNode | null): DockSplit[] {
  if (!node || node.type === "group") {
    return [];
  }
  return [node, ...node.children.flatMap(splitsOf)];
}

/** Every group: those of the main surface in order, then the floating ones, then the popouts'. */
export function groupsOf(layout: DockLayout): DockGroup[] {
  return [...mainGroups(layout.root), ...layout.floating.map(entry => entry.group), ...layout.popouts.map(entry => entry.group)];
}

export function findGroup(layout: DockLayout, id: string): DockGroup | undefined {
  return groupsOf(layout).find(group => group.id === id);
}

export function groupOfPanel(layout: DockLayout, panel: string): DockGroup | undefined {
  return groupsOf(layout).find(group => group.panels.includes(panel));
}

export function findSplit(layout: DockLayout, id: string): DockSplit | undefined {
  return splitsOf(layout.root).find(split => split.id === id);
}

export function placeOf(layout: DockLayout, groupId: string): GroupPlace | undefined {
  if (mainGroups(layout.root).some(group => group.id === groupId)) {
    return "main";
  }
  if (layout.floating.some(entry => entry.group.id === groupId)) {
    return "floating";
  }
  return layout.popouts.some(entry => entry.group.id === groupId) ? "popout" : undefined;
}

/** The ids of every panel in the layout. */
export function panelsOf(layout: DockLayout): string[] {
  return groupsOf(layout).flatMap(group => group.panels);
}

/** Hands out ids `prefix-n` with the smallest `n` not taken yet. */
function idMaker(layout: DockLayout): MakeId {
  const taken = new Set([...groupsOf(layout).map(group => group.id), ...splitsOf(layout.root).map(split => split.id)]);
  return (prefix) => {
    let count = 1;
    while (taken.has(`${prefix}-${count}`)) {
      count++;
    }
    const id = `${prefix}-${count}`;
    taken.add(id);
    return id;
  };
}

function orientationOf(side: DockSide): DockOrientation {
  return side === "top" || side === "bottom" ? "vertical" : "horizontal";
}

function leads(side: DockSide): boolean {
  return side === "top" || side === "start";
}

function select(group: DockGroup, panel: string): void {
  group.active = panel;
  group.history = [panel, ...group.history.filter(entry => entry !== panel)];
}

function createGroup(makeId: MakeId, panels: string[], active: string): DockGroup {
  return { type: "group", id: makeId("group"), panels: [...panels], active, history: [active, ...panels.filter(panel => panel !== active)] };
}

function createSplit(makeId: MakeId, orientation: DockOrientation, children: DockNode[], sizes: number[]): DockSplit {
  return { type: "split", id: makeId("split"), orientation, children, sizes };
}

function removePanel(layout: DockLayout, panel: string): void {
  const group = groupOfPanel(layout, panel);
  if (!group) {
    throw new Error(`${ROOT_NAME} has no panel "${panel}".`);
  }
  group.panels = group.panels.filter(entry => entry !== panel);
  group.history = group.history.filter(entry => entry !== panel);
  if (group.active === panel) {
    group.active = group.history[0] ?? group.panels[0] ?? "";
  }
}

function insert(layout: DockLayout, panels: string[], active: string, target: DockTarget, origin: string | null): void {
  const makeId = idMaker(layout);
  switch (target.type) {
    case "group": {
      const group = findGroup(layout, target.group);
      if (!group) {
        throw new Error(`${ROOT_NAME} has no group "${target.group}".`);
      }
      const index = Math.min(Math.max(target.index ?? group.panels.length, 0), group.panels.length);
      group.panels.splice(index, 0, ...panels);
      group.history = [...panels, ...group.history];
      select(group, active);
      return;
    }
    case "split": {
      if (placeOf(layout, target.group) !== "main" || !layout.root) {
        throw new Error(`${ROOT_NAME} splits only groups of its main surface, and "${target.group}" is not one.`);
      }
      const created = createGroup(makeId, panels, active);
      const visit = (node: DockNode): DockNode => {
        if (node.type === "split") {
          node.children = node.children.map(visit);
          return node;
        }
        if (node.id !== target.group) {
          return node;
        }
        const children = leads(target.side) ? [created, node] : [node, created];
        return createSplit(makeId, orientationOf(target.side), children, [0.5, 0.5]);
      };
      layout.root = visit(layout.root);
      return;
    }
    case "edge": {
      const created = createGroup(makeId, panels, active);
      if (!layout.root) {
        layout.root = created;
        return;
      }
      const first = leads(target.side);
      layout.root = createSplit(
        makeId,
        orientationOf(target.side),
        first ? [created, layout.root] : [layout.root, created],
        first ? [EDGE_SHARE, 1 - EDGE_SHARE] : [1 - EDGE_SHARE, EDGE_SHARE],
      );
      return;
    }
    case "float":
      layout.floating.push({ group: createGroup(makeId, panels, active), rect: target.rect });
      return;
    case "popout":
      layout.popouts.push({ group: createGroup(makeId, panels, active), rect: target.rect, origin });
  }
}

function normalizeGroup(group: DockGroup): DockGroup | null {
  if (group.panels.length === 0) {
    return null;
  }
  const history = group.history.filter(panel => group.panels.includes(panel));
  const remembered = [...new Set([...history, ...group.panels])];
  const active = group.panels.includes(group.active) ? group.active : remembered[0]!;
  return { ...group, active, history: [active, ...remembered.filter(panel => panel !== active)] };
}

function normalizeNode(node: DockNode): DockNode | null {
  if (node.type === "group") {
    return normalizeGroup(node);
  }
  const children: DockNode[] = [];
  const sizes: number[] = [];
  node.children.forEach((child, index) => {
    const normalized = normalizeNode(child);
    if (!normalized) {
      return;
    }
    const size = node.sizes[index] ?? 0;
    // A split inside a split of the same orientation adds nothing; its children move up.
    if (normalized.type === "split" && normalized.orientation === node.orientation) {
      normalized.children.forEach((grandchild, position) => {
        children.push(grandchild);
        sizes.push(size * normalized.sizes[position]!);
      });
      return;
    }
    children.push(normalized);
    sizes.push(size);
  });
  if (children.length <= 1) {
    return children[0] ?? null;
  }
  const total = sizes.reduce((sum, size) => sum + size, 0);
  return { ...node, children, sizes: total > SIZE_EPSILON ? sizes.map(size => size / total) : children.map(() => 1 / children.length) };
}

/**
 * Restores what every layout keeps true: no empty groups, every split with two children or
 * more and an orientation other than its parent's, shares adding up to 1, every group's
 * selected panel and history matching its panels, and the maximized group on the main surface.
 */
export function normalizeLayout(layout: DockLayout): DockLayout {
  const root = layout.root ? normalizeNode(layout.root) : null;
  const floating = layout.floating.flatMap((entry) => {
    const group = normalizeGroup(entry.group);
    return group ? [{ ...entry, group }] : [];
  });
  const popouts = layout.popouts.flatMap((entry) => {
    const group = normalizeGroup(entry.group);
    return group ? [{ ...entry, group }] : [];
  });
  const maximized = layout.maximized !== null && mainGroups(root).some(group => group.id === layout.maximized) ? layout.maximized : null;
  return { root, floating, popouts, maximized };
}

/** Rejects layouts that place a panel twice, repeat ids, or have a malformed split or group. */
export function validateLayout(layout: DockLayout): void {
  const panels = new Set<string>();
  const ids = new Set<string>();
  const claim = (id: string): void => {
    if (ids.has(id)) {
      throw new Error(`${ROOT_NAME} layout uses the id "${id}" more than once.`);
    }
    ids.add(id);
  };
  for (const group of groupsOf(layout)) {
    claim(group.id);
    if (group.panels.length === 0 || !group.panels.includes(group.active)) {
      throw new Error(`${ROOT_NAME} layout has group "${group.id}" without panels or with a selected panel it does not hold.`);
    }
    for (const panel of group.panels) {
      if (panels.has(panel)) {
        throw new Error(`${ROOT_NAME} layout places the panel "${panel}" more than once.`);
      }
      panels.add(panel);
    }
  }
  for (const split of splitsOf(layout.root)) {
    claim(split.id);
    if (split.children.length < 2 || split.sizes.length !== split.children.length || split.sizes.some(size => !(size > 0))) {
      throw new Error(`${ROOT_NAME} layout has split "${split.id}" with fewer than two children or shares that do not match them.`);
    }
  }
  if (layout.maximized !== null && placeOf(layout, layout.maximized) !== "main") {
    throw new Error(`${ROOT_NAME} layout maximizes "${layout.maximized}", which is not a group of its main surface.`);
  }
}

/** Leaves out panels that are not known any more, for example in a layout saved by an older version. */
export function pruneLayout(layout: DockLayout, known: readonly string[]): DockLayout {
  const keep = new Set(known);
  const next = structuredClone(layout);
  for (const group of groupsOf(next)) {
    group.panels = group.panels.filter(panel => keep.has(panel));
  }
  return normalizeLayout(next);
}

/** Applies an action and returns the new layout; the given layout stays untouched. */
export function dockReducer(layout: DockLayout, action: DockAction): DockLayout {
  const next = structuredClone(layout);
  switch (action.type) {
    case "activate": {
      const group = groupOfPanel(next, action.panel);
      if (!group) {
        throw new Error(`${ROOT_NAME} has no panel "${action.panel}".`);
      }
      select(group, action.panel);
      break;
    }
    case "close":
      removePanel(next, action.panel);
      break;
    case "add":
      if (groupOfPanel(next, action.panel)) {
        throw new Error(`${ROOT_NAME} already has the panel "${action.panel}".`);
      }
      insert(next, [action.panel], action.panel, action.to, null);
      break;
    case "move": {
      const source = groupOfPanel(next, action.panel);
      if (!source) {
        throw new Error(`${ROOT_NAME} has no panel "${action.panel}".`);
      }
      const { to } = action;
      if (to.type === "group" && to.group === source.id) {
        const from = source.panels.indexOf(action.panel);
        const index = Math.min(Math.max(to.index ?? source.panels.length, 0), source.panels.length);
        source.panels.splice(from, 1);
        source.panels.splice(index > from ? index - 1 : index, 0, action.panel);
        select(source, action.panel);
        break;
      }
      if (to.type === "split" && to.group === source.id && source.panels.length === 1) {
        // A group's only panel cannot leave it just to start it again.
        return layout;
      }
      removePanel(next, action.panel);
      insert(next, [action.panel], action.panel, to, source.id);
      break;
    }
    case "moveGroup": {
      const source = findGroup(next, action.group);
      if (!source) {
        throw new Error(`${ROOT_NAME} has no group "${action.group}".`);
      }
      const { to } = action;
      if ((to.type === "group" || to.type === "split") && to.group === source.id) {
        return layout;
      }
      const panels = [...source.panels];
      source.panels = [];
      insert(next, panels, source.active, to, source.id);
      break;
    }
    case "resize": {
      const split = findSplit(next, action.split);
      if (!split) {
        throw new Error(`${ROOT_NAME} has no split "${action.split}".`);
      }
      if (action.sizes.length !== split.children.length || action.sizes.some(size => !(size > 0))) {
        throw new Error(`${ROOT_NAME} split "${action.split}" needs ${split.children.length} shares above 0.`);
      }
      split.sizes = [...action.sizes];
      break;
    }
    case "maximize":
      if (action.group !== null && placeOf(next, action.group) !== "main") {
        throw new Error(`${ROOT_NAME} maximizes only groups of its main surface, and "${action.group}" is not one.`);
      }
      next.maximized = action.group;
      break;
    case "place": {
      const surface = [...next.floating, ...next.popouts].find(entry => entry.group.id === action.group);
      if (!surface) {
        throw new Error(`${ROOT_NAME} has no floating or popout group "${action.group}".`);
      }
      surface.rect = action.rect;
      break;
    }
    case "return": {
      const popout = next.popouts.find(entry => entry.group.id === action.group);
      if (!popout) {
        throw new Error(`${ROOT_NAME} has no popout group "${action.group}".`);
      }
      next.popouts = next.popouts.filter(entry => entry !== popout);
      const back = popout.origin !== null && placeOf(next, popout.origin) !== undefined && placeOf(next, popout.origin) !== "popout";
      insert(next, popout.group.panels, popout.group.active, back ? { type: "group", group: popout.origin! } : { type: "edge", side: "end" }, null);
      break;
    }
    case "raise": {
      const entry = next.floating.find(floating => floating.group.id === action.group);
      if (!entry) {
        throw new Error(`${ROOT_NAME} has no floating group "${action.group}".`);
      }
      next.floating = [...next.floating.filter(floating => floating !== entry), entry];
      break;
    }
  }
  return normalizeLayout(next);
}

export interface DockGroupInput {
  panels: string[];
  active?: string;
}

export interface DockSplitInput {
  orientation: DockOrientation;
  children: DockTreeInput[];
  sizes?: number[];
}

/** A tree to build a layout from, without ids. */
export type DockTreeInput = DockGroupInput | DockSplitInput;

export interface DockLayoutInput {
  root?: DockTreeInput | null;
  floating?: { panels: string[]; active?: string; rect: DockRect }[];
}

/** Builds a layout without writing ids or histories by hand. */
export function createDockLayout(input: DockLayoutInput): DockLayout {
  const makeId = idMaker(EMPTY_LAYOUT);
  const build = (node: DockTreeInput): DockNode => {
    if ("panels" in node) {
      return createGroup(makeId, node.panels, node.active ?? node.panels[0]!);
    }
    const children = node.children.map(build);
    return createSplit(makeId, node.orientation, children, node.sizes ?? children.map(() => 1 / children.length));
  };
  const layout = normalizeLayout({
    root: input.root ? build(input.root) : null,
    floating: (input.floating ?? []).map(entry => ({ group: createGroup(makeId, entry.panels, entry.active ?? entry.panels[0]!), rect: entry.rect })),
    popouts: [],
    maximized: null,
  });
  validateLayout(layout);
  return layout;
}
