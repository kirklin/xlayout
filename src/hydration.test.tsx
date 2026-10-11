import * as React from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getByTestId } from "../test/render";
import * as Dock from "./dock";
import * as Grid from "./grid";
import * as Masonry from "./masonry";
import * as Overflow from "./overflow";
import * as ScrollSpy from "./scroll-spy";
import * as Shell from "./shell";
import * as Splitter from "./splitter";
import * as Sticky from "./sticky";

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

/** Lays out the markup the server renders for `ui`, as the browser shows it before scripts run. */
function renderOnServer(ui: React.ReactNode): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = renderToString(<React.StrictMode>{ui}</React.StrictMode>);
  document.body.append(container);
  cleanups.push(() => container.remove());
  return container;
}

/** Starts hydrating the server markup in `container`; the returned list collects the errors React recovers from. */
function hydrate(container: HTMLElement, ui: React.ReactNode): unknown[] {
  const errors: unknown[] = [];
  const root = hydrateRoot(container, <React.StrictMode>{ui}</React.StrictMode>, {
    onRecoverableError: error => errors.push(error),
  });
  cleanups.unshift(() => root.unmount());
  return errors;
}

interface Box {
  width: number;
  height: number;
}

function boxesOf(testIds: readonly string[]): Box[] {
  return testIds.map((testId) => {
    const { width, height } = getByTestId(testId).getBoundingClientRect();
    return { width, height };
  });
}

function expectSameBoxes(actual: Box[], expected: Box[]): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((box, index) => {
    expect(box.width).toBeCloseTo(expected[index]!.width, 1);
    expect(box.height).toBeCloseTo(expected[index]!.height, 1);
  });
}

interface SplitterCase {
  name: string;
  orientation?: "horizontal" | "vertical";
  root?: Pick<Splitter.SplitterProps, "layout" | "defaultLayout">;
  panels: Pick<Splitter.SplitterPanelProps, "defaultSize">[];
}

const SPLITTER_CASES: SplitterCase[] = [
  { name: "default sizes that add up to 100", panels: [{ defaultSize: 30 }, { defaultSize: 70 }] },
  { name: "the root's default layout", root: { defaultLayout: { a: 25, b: 75 } }, panels: [{ defaultSize: 50 }, { defaultSize: 50 }] },
  { name: "a controlled layout", root: { layout: { a: 40, b: 60 } }, panels: [{}, {}] },
  { name: "panels without sizes", panels: [{}, {}, {}] },
  { name: "an absolute size beside a panel without one", panels: [{ defaultSize: "200px" }, {}] },
  { name: "stacked panels", orientation: "vertical", panels: [{ defaultSize: "30%" }, { defaultSize: "70%" }] },
];

function SplitterExample({ orientation = "horizontal", root, panels }: SplitterCase): React.ReactNode {
  const handleStyle = orientation === "horizontal" ? { width: 8 } : { height: 8 };
  return (
    <div style={{ width: 600, height: 300 }}>
      <Splitter.Root orientation={orientation} {...root} style={{ height: "100%" }}>
        {panels.map((panel, index) => {
          const id = "abc"[index]!;
          return (
            <React.Fragment key={id}>
              {index > 0 && <Splitter.Handle style={handleStyle} />}
              <Splitter.Panel id={id} data-testid={id} {...panel} />
            </React.Fragment>
          );
        })}
      </Splitter.Root>
    </div>
  );
}

describe("hydration", () => {
  it.each(SPLITTER_CASES)("lays out a splitter with $name on the server as it will once measured", async (example) => {
    const ui = <SplitterExample {...example} />;
    const container = renderOnServer(ui);
    const testIds = example.panels.map((_, index) => "abc"[index]!);
    const before = boxesOf(testIds);
    const errors = hydrate(container, ui);
    // Panels report their size once the group has measured them.
    await vi.waitFor(() => expect(getByTestId("a").style.getPropertyValue("--xlayout-splitter-panel-size")).not.toBe(""));
    expect(errors).toEqual([]);
    expectSameBoxes(boxesOf(testIds), before);
  });

  it("hydrates every component without a mismatch and keeps what the server rendered", async () => {
    const shellCookie = Shell.serializeShellState({ start: { open: false, width: 280 } });
    const dockLayout = Dock.createDockLayout({ root: { orientation: "horizontal", children: [{ panels: ["files"] }, { panels: ["editor"] }] } });
    const ui = (
      <ScrollSpy.Root defaultValue="grid">
        <Shell.Root defaultState={Shell.parseShellState(shellCookie)} style={{ height: 600 }}>
          <Shell.Header>
            <Shell.SidebarTrigger>Contents</Shell.SidebarTrigger>
          </Shell.Header>
          <Shell.Sidebar data-testid="sidebar" aria-label="Contents">
            <ScrollSpy.Nav aria-label="Contents">
              <ScrollSpy.List>
                <ScrollSpy.Item value="grid"><ScrollSpy.Link>Grid</ScrollSpy.Link></ScrollSpy.Item>
                <ScrollSpy.Item value="content"><ScrollSpy.Link>Content</ScrollSpy.Link></ScrollSpy.Item>
              </ScrollSpy.List>
            </ScrollSpy.Nav>
          </Shell.Sidebar>
          <Shell.Main>
            <ScrollSpy.Section value="grid">
              <Grid.Root columns={4} rowHeight={40} defaultLayouts={{ base: [{ value: "chart", x: 1, y: 0, w: 2, h: 2 }] }}>
                <Grid.Item value="chart" data-testid="chart">Chart</Grid.Item>
              </Grid.Root>
              <Splitter.Root style={{ height: 120 }}>
                <Splitter.Panel defaultSize={40}>List</Splitter.Panel>
                <Splitter.Handle style={{ width: 4 }} />
                <Splitter.Panel>Detail</Splitter.Panel>
              </Splitter.Root>
              <Dock.Root panels={{ files: { title: "Files", content: "Files" }, editor: { title: "Editor", content: "Editor" } }} defaultLayout={dockLayout} style={{ height: 160 }} />
            </ScrollSpy.Section>
            <ScrollSpy.Section value="content">
              <Masonry.Root columns={2}>
                <Masonry.Item style={{ height: 60 }}>One</Masonry.Item>
                <Masonry.Item style={{ height: 30 }}>Two</Masonry.Item>
                <Masonry.Item style={{ height: 40 }}>Three</Masonry.Item>
              </Masonry.Root>
              <Overflow.Root style={{ width: 200 }}>
                {["Bold", "Italic", "Underline", "Strike", "Code"].map(label => (
                  <Overflow.Item key={label} value={label} style={{ width: 60 }}>{label}</Overflow.Item>
                ))}
                <Overflow.Indicator style={{ width: 40 }}>More</Overflow.Indicator>
              </Overflow.Root>
              <Sticky.Group>
                <Sticky.Root>Heading</Sticky.Root>
              </Sticky.Group>
            </ScrollSpy.Section>
          </Shell.Main>
        </Shell.Root>
      </ScrollSpy.Root>
    );
    const container = renderOnServer(ui);
    const chartBefore = boxesOf(["chart"]);
    const errors = hydrate(container, ui);
    // The dock adds its panels' hosts once the hydrated tree is committed.
    await vi.waitFor(() => expect(container.querySelectorAll("[data-dock-content] [data-dock-panel]")).toHaveLength(2));
    expect(errors).toEqual([]);
    expect(getByTestId("sidebar").dataset.state).toBe("collapsed");
    expect(getByTestId("sidebar").style.getPropertyValue("--xlayout-shell-sidebar-width")).toBe("280px");
    expectSameBoxes(boxesOf(["chart"]), chartBefore);
  });
});
