import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { commands, server } from "vitest/browser";
import { centerOf, nextFrames, touchDrag } from "../test/pointer";
import { getById, getByTestId, renderStrict, widthOf } from "../test/render";
import * as Dock from "./dock";
import * as Grid from "./grid";
import * as Shell from "./shell";
import * as Splitter from "./splitter";

// Touches come from the DevTools protocol, which only Chromium has.
describe.runIf(server.browser === "chromium")("touch", () => {
  describe("splitter", () => {
    function Split({ touchMargin }: { touchMargin?: number }): React.ReactNode {
      return (
        <Splitter.Root data-testid="group" style={{ width: 1010, height: 300 }}>
          <Splitter.Panel id="first" defaultSize={30}>
            <button type="button" data-testid="control" style={{ position: "absolute", right: 0, top: 0, width: 40, height: 40 }}>Go</button>
          </Splitter.Panel>
          <Splitter.Handle data-testid="handle" aria-label="Resize" style={{ width: 4 }} touchMargin={touchMargin} />
          <Splitter.Panel id="second" />
        </Splitter.Root>
      );
    }

    it("resizes from a touch on the handle", async () => {
      await renderStrict(<Split />);
      const before = widthOf(getById("first"));
      await touchDrag(centerOf(getByTestId("handle")), 100, 0);
      await nextFrames();
      expect(widthOf(getById("first"))).toBeCloseTo(before + 100, 0);
    });

    // Chromium itself moves touches up to about 8 pixels away onto the handle; the margin reaches further.
    it("takes a touch that lands beside the thin handle", async () => {
      await renderStrict(<Split />);
      const before = widthOf(getById("first"));
      const handle = getByTestId("handle").getBoundingClientRect();
      await touchDrag({ x: handle.right + 11, y: handle.top + 200 }, 100, 0);
      await nextFrames();
      expect(widthOf(getById("first"))).toBeCloseTo(before + 100, 0);
    });

    it("leaves touches beyond the margin and touches on controls to the content", async () => {
      await renderStrict(<Split />);
      const before = widthOf(getById("first"));
      const handle = getByTestId("handle").getBoundingClientRect();
      await touchDrag({ x: handle.right + 20, y: handle.top + 200 }, 100, 0);
      await nextFrames();
      expect(widthOf(getById("first"))).toBe(before);
      // The button sits right beside the handle, inside its margin.
      await touchDrag(centerOf(getByTestId("control")), 100, 0);
      await nextFrames();
      expect(widthOf(getById("first"))).toBe(before);
    });

    it("takes only touches on the handle with a margin of 0", async () => {
      await renderStrict(<Split touchMargin={0} />);
      const before = widthOf(getById("first"));
      const handle = getByTestId("handle").getBoundingClientRect();
      await touchDrag({ x: handle.right + 11, y: handle.top + 200 }, 100, 0);
      await nextFrames();
      expect(widthOf(getById("first"))).toBe(before);
    });
  });

  describe("shell", () => {
    function Docked(): React.ReactNode {
      return (
        <Shell.Root breakpoint="(max-width: 0px)" style={{ display: "flex", width: 900, height: 400 }}>
          <Shell.Sidebar data-testid="sidebar" defaultWidth={240} style={{ position: "relative", width: "var(--xlayout-shell-sidebar-offset)", flex: "none" }}>
            <Shell.SidebarResizer data-testid="resizer" style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: 4 }} />
          </Shell.Sidebar>
          <Shell.Main style={{ flex: 1 }}>Main</Shell.Main>
        </Shell.Root>
      );
    }

    it("takes a touch beside the thin resizer", async () => {
      await renderStrict(<Docked />);
      const resizer = getByTestId("resizer").getBoundingClientRect();
      await touchDrag({ x: resizer.right + 11, y: resizer.top + 200 }, 60, 0);
      await nextFrames();
      expect(widthOf(getByTestId("sidebar"))).toBeCloseTo(300, 0);
    });

    function Drawer({ swipeEdge }: { swipeEdge?: number }): React.ReactNode {
      return (
        <Shell.Root breakpoint="(min-width: 0px)" style={{ width: 900, height: 600 }}>
          <Shell.SidebarTrigger data-testid="trigger">Menu</Shell.SidebarTrigger>
          <Shell.Sidebar
            data-testid="drawer"
            aria-label="Menu"
            swipeEdge={swipeEdge}
            style={{ position: "fixed", left: 0, top: 0, bottom: 0, width: 300, zIndex: 2, overflow: "auto" }}
          >
            <div style={{ height: 2000 }}>Long menu</div>
          </Shell.Sidebar>
          <Shell.SidebarOverlay data-testid="overlay" style={{ position: "fixed", inset: 0, zIndex: 1 }} />
          <Shell.Main>Main</Shell.Main>
        </Shell.Root>
      );
    }

    async function openDrawer(): Promise<void> {
      getByTestId("trigger").click();
      await vi.waitFor(() => expect(getByTestId("drawer").dataset.state).toBe("expanded"));
    }

    it("follows a swipe across the drawer and closes it past half its width", async () => {
      await renderStrict(<Drawer />);
      await openDrawer();
      await touchDrag({ x: 250, y: 300 }, -120, 0, { release: false, steps: 12 });
      await nextFrames();
      const drawer = getByTestId("drawer");
      expect(drawer.dataset.swiping).toBe("");
      expect(drawer.style.getPropertyValue("--xlayout-shell-sidebar-swipe")).toBe("-120px");
      expect(Number(getByTestId("overlay").style.getPropertyValue("--xlayout-shell-sidebar-swipe-progress"))).toBeCloseTo(0.4, 2);
      await commands.touch([{ type: "move", x: 70, y: 300, steps: 6 }, { type: "wait", ms: 150 }, { type: "end" }]);
      await vi.waitFor(() => expect(drawer.dataset.state).toBe("collapsed"));
      expect(drawer.dataset.swiping).toBeUndefined();
      expect(drawer.style.getPropertyValue("--xlayout-shell-sidebar-swipe")).toBe("");
    });

    it("springs back from a short slow swipe and lets vertical swipes scroll the drawer", async () => {
      await renderStrict(<Drawer />);
      await openDrawer();
      const drawer = getByTestId("drawer");
      await commands.touch([{ type: "start", x: 250, y: 300 }, { type: "move", x: 200, y: 300, steps: 10 }, { type: "wait", ms: 200 }, { type: "end" }]);
      await nextFrames();
      expect(drawer.dataset.state).toBe("expanded");
      expect(drawer.dataset.swiping).toBeUndefined();
      await touchDrag({ x: 150, y: 400 }, 0, -200, { steps: 12 });
      await nextFrames(4);
      expect(drawer.dataset.state).toBe("expanded");
      expect(drawer.scrollTop).toBeGreaterThan(50);
    });

    it("closes on a quick flick and from a swipe on the overlay", async () => {
      await renderStrict(<Drawer />);
      await openDrawer();
      await touchDrag({ x: 250, y: 300 }, -50, 0, { steps: 2 });
      await vi.waitFor(() => expect(getByTestId("drawer").dataset.state).toBe("collapsed"));
      await openDrawer();
      await touchDrag({ x: 600, y: 300 }, -400, 0, { steps: 12 });
      await vi.waitFor(() => expect(getByTestId("drawer").dataset.state).toBe("collapsed"));
    });

    it("opens from a swipe off the screen's edge only when the edge is turned on", async () => {
      await renderStrict(<Drawer />);
      await touchDrag({ x: 4, y: 300 }, 250, 0, { steps: 12 });
      await nextFrames();
      expect(getByTestId("drawer").dataset.state).toBe("collapsed");
    });

    it("opens from a swipe off the screen's edge", async () => {
      await renderStrict(<Drawer swipeEdge={20} />);
      await touchDrag({ x: 4, y: 300 }, 250, 0, { steps: 12 });
      await vi.waitFor(() => expect(getByTestId("drawer").dataset.state).toBe("expanded"));
    });
  });

  describe("dock", () => {
    // Without close buttons, which the browser's touch adjustment would move touches onto.
    const PANELS = {
      files: { title: "Files", content: "Files", closable: false },
      search: { title: "Search", content: "Search", closable: false },
      editor: { title: "Editor", content: "Editor", closable: false },
      terminal: { title: "Terminal", content: "Terminal", closable: false },
    };
    const LAYOUT = Dock.createDockLayout({
      root: { orientation: "horizontal", sizes: [0.4, 0.6], children: [{ panels: ["files", "search"] }, { panels: ["editor"] }] },
      autoHide: [{ panels: ["terminal"], side: "bottom", size: 120 }],
    });

    function Page({ onLayoutChange }: { onLayoutChange?: (layout: Dock.DockLayout) => void }): React.ReactNode {
      return (
        <div data-testid="page" style={{ width: 900, height: 500, overflow: "auto" }}>
          <Dock.Root panels={PANELS} defaultLayout={LAYOUT} onLayoutChange={onLayoutChange} style={{ width: 800, height: 400 }} />
          <div style={{ height: 1200 }}>Below</div>
        </div>
      );
    }

    const tab = (panel: string): HTMLElement => document.querySelector<HTMLElement>(`[role=tab][data-panel="${panel}"]`)!;

    it("drags a tab across at once and leaves swipes up and down to scrolling", async () => {
      const onLayoutChange = vi.fn();
      await renderStrict(<Page onLayoutChange={onLayoutChange} />);
      const bar = document.querySelectorAll<HTMLElement>("[role=tablist]")[1]!.getBoundingClientRect();
      const from = centerOf(tab("search"));
      await touchDrag(from, bar.right - 20 - from.x, 0, { steps: 16 });
      await nextFrames();
      expect(onLayoutChange.mock.lastCall![0].root.children[1].panels).toEqual(["editor", "search"]);

      const page = getByTestId("page");
      await touchDrag(centerOf(tab("files")), 0, -150, { steps: 16 });
      await nextFrames(4);
      expect(page.scrollTop).toBeGreaterThan(50);
      expect(onLayoutChange).toHaveBeenCalledTimes(1);
    });

    it("drags a held tab in any direction without scrolling", async () => {
      const onLayoutChange = vi.fn();
      await renderStrict(<Page onLayoutChange={onLayoutChange} />);
      const content = document.querySelectorAll<HTMLElement>("[data-dock-content]")[1]!.getBoundingClientRect();
      const from = centerOf(tab("files"));
      await touchDrag(from, content.left + content.width / 2 - from.x, content.bottom - 20 - from.y, { hold: 600, steps: 16 });
      await nextFrames();
      expect(getByTestId("page").scrollTop).toBe(0);
      const root = onLayoutChange.mock.lastCall![0].root;
      expect(root.children[1]).toMatchObject({ type: "split", orientation: "vertical" });
    });

    it("takes touches beside its separators and opens hidden panels with a tap", async () => {
      await renderStrict(<Page />);
      const separator = document.querySelector<HTMLElement>("[data-dock-handle]")!;
      const before = widthOf(document.querySelectorAll("[data-dock-group]")[0]!);
      const rect = separator.getBoundingClientRect();
      await touchDrag({ x: rect.right + 11, y: rect.top + 200 }, 80, 0);
      await nextFrames();
      expect(widthOf(document.querySelectorAll("[data-dock-group]")[0]!)).toBeCloseTo(before + 80, 0);

      const strip = document.querySelector<HTMLElement>("[data-dock-strip-tab]")!;
      await commands.touch([{ type: "start", ...centerOf(strip) }, { type: "end" }]);
      await vi.waitFor(() => expect(document.querySelector("[data-dock-flyout]")).not.toBeNull());
    });
  });

  describe("grid", () => {
    it("moves and resizes items by touch on their handles, without scrolling the page", async () => {
      const onLayoutsChange = vi.fn();
      await renderStrict(
        <div data-testid="page" style={{ height: 500, overflow: "auto" }}>
          <Grid.Root columns={4} rowHeight={50} gap={10} style={{ width: 430 }} defaultLayouts={{ base: [{ value: "a", x: 0, y: 0, w: 1, h: 1 }] }} onLayoutsChange={onLayoutsChange}>
            <Grid.Item value="a" style={{ position: "relative" }}>
              <Grid.DragHandle data-testid="move" aria-label="Move" style={{ display: "block", width: 30, height: 30, padding: 0 }} />
              <Grid.ResizeHandle data-testid="resize" aria-label="Resize" style={{ position: "absolute", right: 0, bottom: 0, width: 16, height: 16, padding: 0 }} />
            </Grid.Item>
          </Grid.Root>
          <div style={{ height: 1500 }}>Below</div>
        </div>,
      );
      await touchDrag(centerOf(getByTestId("move")), 220, 60, { steps: 12 });
      await nextFrames();
      expect(onLayoutsChange.mock.lastCall![0].base[0]).toMatchObject({ x: 2, y: 0 });
      expect(getByTestId("page").scrollTop).toBe(0);
      await touchDrag(centerOf(getByTestId("resize")), 110, 60, { steps: 12 });
      await nextFrames();
      expect(onLayoutsChange.mock.lastCall![0].base[0]).toMatchObject({ x: 2, w: 2, h: 2 });
      expect(getByTestId("page").scrollTop).toBe(0);
    });
  });

  it("keeps the command honest: a touch on content scrolls it", async () => {
    await renderStrict(
      <div data-testid="scroller" style={{ width: 300, height: 200, overflow: "auto" }}>
        <div style={{ height: 1000 }}>Long</div>
      </div>,
    );
    const scroller = getByTestId("scroller");
    await commands.touch([
      { type: "start", x: centerOf(scroller).x, y: centerOf(scroller).y + 50 },
      { type: "move", x: centerOf(scroller).x, y: centerOf(scroller).y - 50, steps: 10 },
      { type: "end" },
    ]);
    await nextFrames(4);
    expect(scroller.scrollTop).toBeGreaterThan(30);
  });
});
