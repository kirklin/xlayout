// @env node
import type * as React from "react";
import { createElement as h } from "react";
import { Dock, Grid, Masonry, Overflow, ScrollSpy, Shell, Splitter, Sticky } from "xlayout";

/** The cookie of a visitor who widened the sidebar and then closed it. */
const SHELL_COOKIE = Shell.serializeShellState({ start: { open: false, width: 280 } });

const CARDS = [
  { id: "first", height: 120 },
  { id: "second", height: 80 },
  { id: "third", height: 160 },
  { id: "fourth", height: 100 },
];

function SplitterExample(): React.ReactNode {
  return h(
    Splitter.Root,
    null,
    h(Splitter.Panel, { id: "list", defaultSize: 30 }, "List"),
    h(Splitter.Handle, { "aria-label": "Resize the list" }),
    h(Splitter.Panel, { id: "detail" }, "Detail"),
  );
}

function GridExample(): React.ReactNode {
  const layout = [{ value: "chart", x: 0, y: 0, w: 3, h: 2 }, { value: "notes", x: 3, y: 0, w: 1, h: 1 }];
  return h(
    Grid.Root,
    { columns: 4, defaultLayouts: { base: layout } },
    h(Grid.Item, { value: "chart" }, "Chart"),
    h(Grid.Item, { value: "notes" }, "Notes"),
  );
}

function DockExample(): React.ReactNode {
  const layout = Dock.createDockLayout({
    root: { orientation: "horizontal", sizes: [0.3, 0.7], children: [{ panels: ["files"] }, { panels: ["editor", "preview"] }] },
  });
  const panels = {
    files: { title: "Files", content: h("p", null, "Files") },
    editor: { title: "Editor", content: h("p", null, "Editor") },
    preview: { title: "Preview", content: h("p", null, "Preview"), render: "overlay" as const },
  };
  return h(Dock.Root, { panels, defaultLayout: layout });
}

function MasonryExample(): React.ReactNode {
  return h(Masonry.Root, { columns: 3 }, CARDS.map(card => h(Masonry.Item, { key: card.id, style: { height: card.height } }, card.id)));
}

function OverflowExample(): React.ReactNode {
  return h(
    Overflow.Root,
    null,
    ["Bold", "Italic", "Link"].map(label => h(Overflow.Item, { key: label, value: label }, h("button", { type: "button" }, label))),
    h(Overflow.Indicator, null, h("button", { type: "button" }, "More")),
  );
}

function StickyExample(): React.ReactNode {
  return h(Sticky.Group, null, h(Sticky.Root, null, "Heading"), h(Sticky.Root, { side: "bottom" }, "Actions"));
}

const SECTIONS = [
  { value: "splitter", Example: SplitterExample },
  { value: "grid", Example: GridExample },
  { value: "dock", Example: DockExample },
  { value: "masonry", Example: MasonryExample },
  { value: "overflow", Example: OverflowExample },
  { value: "sticky", Example: StickyExample },
];

/** A page written as a Server Component: every part gets serializable props, and the helpers run here. */
export function Page(): React.ReactNode {
  const contents = SECTIONS.map(({ value }) => h(ScrollSpy.Item, { key: value, value }, h(ScrollSpy.Link, null, value)));
  return h(
    ScrollSpy.Root,
    { defaultValue: "splitter" },
    h(
      Shell.Root,
      { defaultState: Shell.parseShellState(SHELL_COOKIE) },
      h(Shell.SkipLink, null, "Skip to content"),
      h(Shell.Header, null, h(Shell.SidebarTrigger, null, "Contents")),
      h(Shell.Sidebar, { "aria-label": "Contents" }, h(ScrollSpy.Nav, { "aria-label": "Contents" }, h(ScrollSpy.List, null, contents))),
      h(Shell.Main, null, SECTIONS.map(({ value, Example }) => h(ScrollSpy.Section, { key: value, value }, h(Example)))),
    ),
  );
}
