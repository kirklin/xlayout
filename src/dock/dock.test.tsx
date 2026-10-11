import type { DockAction, DockGroupRenderProps, DockLayout, DockNode, DockPanelDefinition, DockProps } from "./index";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { drag, nextFrames, releasePointer } from "../../test/pointer";
import { getByTestId, renderError, renderStrict } from "../../test/render";
import * as Dock from "./index";

function Counter({ name }: { name: string }): React.ReactNode {
  const [count, setCount] = React.useState(0);
  return <button type="button" data-testid={`${name}-count`} onClick={() => setCount(value => value + 1)}>{count}</button>;
}

const PANELS: Record<string, DockPanelDefinition> = {
  explorer: { title: "Explorer", content: <Counter name="explorer" /> },
  search: { title: "Search", content: <Counter name="search" /> },
  editor: { title: "Editor", content: <Counter name="editor" />, closable: false },
  preview: { title: "Preview", content: <Counter name="preview" />, render: "whenVisible" },
  terminal: { title: "Terminal", content: <Counter name="terminal" />, render: "overlay" },
};

/** group-1 holds explorer and search, group-2 editor and preview, group-3 the terminal. */
const LAYOUT = Dock.createDockLayout({
  root: {
    orientation: "horizontal",
    sizes: [0.25, 0.75],
    children: [
      { panels: ["explorer", "search"] },
      { orientation: "vertical", sizes: [0.7, 0.3], children: [{ panels: ["editor", "preview"] }, { panels: ["terminal"] }] },
    ],
  },
});

const CONTROL_STYLE: React.CSSProperties = { width: 12, height: 12, padding: 0, border: 0 };

function Controls({ group, active, maximized, api }: DockGroupRenderProps): React.ReactNode {
  return (
    <>
      <button type="button" aria-label="Maximize" data-testid={`${group}-maximize`} style={CONTROL_STYLE} onClick={() => api.maximize(maximized ? null : group)} />
      <button type="button" aria-label="Float" data-testid={`${group}-float`} style={CONTROL_STYLE} onClick={() => api.float(active)} />
      <button type="button" aria-label="Pop out" data-testid={`${group}-popout`} style={CONTROL_STYLE} onClick={() => api.popout(group)} />
      <button type="button" aria-label="Dock" data-testid={`${group}-dock`} style={CONTROL_STYLE} onClick={() => api.dock(group)} />
    </>
  );
}

/** Tabs of one width, so which of them fit does not depend on the fonts of the system. */
const TAB_STYLE = "[data-testid=dock] [data-dock-tab] { width: 64px; overflow: hidden; white-space: nowrap; }";

function Workbench(props: Partial<DockProps>): React.ReactNode {
  return (
    <>
      <style>{TAB_STYLE}</style>
      <Dock.Root
        data-testid="dock"
        panels={PANELS}
        defaultLayout={LAYOUT}
        renderGroupControls={group => <Controls {...group} />}
        style={{ width: 800, height: 500 }}
        {...props}
      />
    </>
  );
}

function shape(node: DockNode | null): string {
  if (!node) {
    return "empty";
  }
  if (node.type === "group") {
    return `(${node.panels.map(panel => (panel === node.active ? `${panel}*` : panel)).join(" ")})`;
  }
  return `${node.orientation === "horizontal" ? "H" : "V"}[${node.children.map(shape).join(" | ")}]`;
}

function tab(panel: string): HTMLElement {
  return document.querySelector<HTMLElement>(`[role="tab"][data-panel="${panel}"]`)!;
}

function host(panel: string): HTMLElement {
  return document.querySelector<HTMLElement>(`[data-dock-panel="${panel}"]`)!;
}

function groupOf(panel: string): HTMLElement {
  return tab(panel).closest<HTMLElement>("[data-dock-group]")!;
}

function rectOf(element: Element): DOMRect {
  return element.getBoundingClientRect();
}

/** Drags `element` from its middle to a point of the page. */
async function dragTo(element: Element, x: number, y: number, release = true): Promise<void> {
  const rect = rectOf(element);
  await drag(element, x - (rect.left + rect.width / 2), y - (rect.top + rect.height / 2), { release, steps: 10 });
  await nextFrames();
}

function announcements(): string {
  return document.querySelector("[data-xlayout-live-region=\"polite\"]")?.textContent ?? "";
}

describe("dock", () => {
  afterEach(() => {
    document.querySelector("[data-xlayout-live-region]")?.remove();
    vi.restoreAllMocks();
  });

  it("shows groups of tabs, each with its selected panel", async () => {
    await renderStrict(<Workbench />);
    expect(document.querySelectorAll("[role=tablist]")).toHaveLength(3);
    expect(tab("explorer").getAttribute("aria-selected")).toBe("true");
    expect(tab("search").getAttribute("aria-selected")).toBe("false");
    expect(tab("explorer").tabIndex).toBe(0);
    expect(tab("search").tabIndex).toBe(-1);
    expect(tab("explorer").getAttribute("aria-controls")).toBe(host("explorer").id);
    expect(host("explorer").getAttribute("role")).toBe("tabpanel");
    expect(host("explorer").getAttribute("aria-labelledby")).toBe(tab("explorer").id);
    expect(host("explorer").hidden).toBe(false);
    expect(host("search").hidden).toBe(true);
    expect(host("explorer").parentElement).toBe(groupOf("explorer").querySelector("[data-dock-content]"));
    expect(rectOf(groupOf("explorer")).width).toBeCloseTo(199);
    expect(getByTestId("explorer-count").textContent).toBe("0");
  });

  it("selects tabs by click and with the keyboard, and closes them with Delete", async () => {
    const onLayoutChange = vi.fn<(layout: DockLayout, action: DockAction) => void>();
    await renderStrict(<Workbench onLayoutChange={onLayoutChange} />);
    await userEvent.click(tab("search"));
    expect(tab("search").getAttribute("aria-selected")).toBe("true");
    expect(host("search").hidden).toBe(false);
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(tab("explorer"));
    expect(tab("explorer").getAttribute("aria-selected")).toBe("true");
    await userEvent.keyboard("{End}");
    expect(document.activeElement).toBe(tab("search"));
    await userEvent.keyboard("{Delete}");
    expect(tab("search")).toBeNull();
    expect(document.activeElement).toBe(tab("explorer"));
    expect(onLayoutChange).toHaveBeenLastCalledWith(expect.anything(), { type: "close", panel: "search" });
    tab("editor").focus();
    await userEvent.keyboard("{Delete}");
    expect(tab("editor")).not.toBeNull();
  });

  it("keeps the state of hidden and moved panels, except panels shown only while visible", async () => {
    await renderStrict(<Workbench />);
    await userEvent.click(getByTestId("explorer-count"));
    await userEvent.click(tab("search"));
    await userEvent.click(tab("explorer"));
    expect(getByTestId("explorer-count").textContent).toBe("1");
    await userEvent.click(tab("preview"));
    await userEvent.click(getByTestId("preview-count"));
    expect(getByTestId("preview-count").textContent).toBe("1");
    await userEvent.click(tab("editor"));
    expect(host("preview").childElementCount).toBe(0);
    await userEvent.click(tab("preview"));
    expect(getByTestId("preview-count").textContent).toBe("0");
    const target = rectOf(groupOf("editor").querySelector("[data-dock-tablist]")!);
    await dragTo(tab("explorer"), target.right - 20, target.top + target.height / 2);
    expect(groupOf("explorer")).toBe(groupOf("editor"));
    expect(getByTestId("explorer-count").textContent).toBe("1");
  });

  it("drops a tab among the tabs of another group", async () => {
    const onLayoutChange = vi.fn<(layout: DockLayout, action: DockAction) => void>();
    await renderStrict(<Workbench onLayoutChange={onLayoutChange} />);
    const editor = rectOf(tab("editor"));
    await dragTo(tab("search"), editor.left + editor.width / 4, editor.top + editor.height / 2, false);
    const indicator = getByTestId("dock").querySelector<HTMLElement>("[data-dock-drop-indicator]")!;
    expect(indicator.dataset.target).toBe("group");
    expect(tab("search").dataset.dragging).toBe("");
    await userEvent.keyboard("{Escape}");
    await releasePointer();
    await nextFrames();
    expect(getByTestId("dock").querySelector("[data-dock-drop-indicator]")).toBeNull();
    expect(onLayoutChange).not.toHaveBeenCalled();
    await dragTo(tab("search"), editor.left + editor.width / 4, editor.top + editor.height / 2);
    expect(shape(onLayoutChange.mock.lastCall![0].root)).toBe("H[(explorer*) | V[(search* editor preview) | (terminal*)]]");
    expect(onLayoutChange.mock.lastCall![1]).toEqual({ type: "move", panel: "search", to: { type: "group", group: "group-2", index: 0 } });
  });

  it("splits a group near the edges of its content and docks along the edges of the dock", async () => {
    const onLayoutChange = vi.fn<(layout: DockLayout, action: DockAction) => void>();
    // Room above the dock keeps the pointer inside the page there.
    await renderStrict(<Workbench onLayoutChange={onLayoutChange} style={{ width: 800, height: 500, marginTop: 60 }} />);
    const content = rectOf(groupOf("editor").querySelector("[data-dock-content]")!);
    await dragTo(tab("search"), content.left + content.width / 2, content.bottom - 10);
    expect(shape(onLayoutChange.mock.lastCall![0].root)).toBe("H[(explorer*) | V[(editor* preview) | (search*) | (terminal*)]]");
    // Tab bars line the top, so the top edge docks from just above the dock.
    const dock = rectOf(getByTestId("dock"));
    await dragTo(tab("explorer"), dock.left + dock.width / 2, dock.top - 20);
    expect(onLayoutChange.mock.lastCall![1]).toEqual({ type: "move", panel: "explorer", to: { type: "edge", side: "top" } });
    expect(shape(onLayoutChange.mock.lastCall![0].root)).toBe("V[(explorer*) | (editor* preview) | (search*) | (terminal*)]");
  });

  it("floats tabs dropped away from every group, and moves and resizes floating groups", async () => {
    const onLayoutChange = vi.fn<(layout: DockLayout, action: DockAction) => void>();
    await renderStrict(<Workbench onLayoutChange={onLayoutChange} floatSize={{ width: 300, height: 200 }} />);
    const dock = rectOf(getByTestId("dock"));
    await dragTo(tab("search"), dock.left + 400, dock.bottom + 100);
    const floating = getByTestId("dock").querySelector<HTMLElement>("[data-dock-floating]")!;
    expect(floating.dataset.group).toBe("group-4");
    expect(rectOf(floating)).toMatchObject({ left: dock.left + 250, top: dock.top + 300, width: 300, height: 200 });
    // The free end of the tab list moves the group.
    const header = floating.querySelector<HTMLElement>("[data-dock-tablist]")!;
    await drag(header, -100, -100, { from: { x: (rectOf(header).width - 10) / rectOf(header).width, y: 0.5 } });
    await nextFrames();
    expect(onLayoutChange.mock.lastCall![1]).toMatchObject({ type: "place", group: "group-4" });
    expect(rectOf(floating)).toMatchObject({ left: dock.left + 150, top: dock.top + 200 });
    await drag(floating.querySelector("[data-dock-float-resize]")!, 40, 30);
    await nextFrames();
    expect(rectOf(floating)).toMatchObject({ width: 340, height: 230 });
  });

  it("resizes splits by dragging their separator and with the keyboard", async () => {
    const onLayoutChange = vi.fn<(layout: DockLayout, action: DockAction) => void>();
    await renderStrict(<Workbench onLayoutChange={onLayoutChange} />);
    const separator = getByTestId("dock").querySelector<HTMLElement>("[role=separator][data-orientation=horizontal]")!;
    expect(separator.getAttribute("aria-valuenow")).toBe("25");
    await drag(separator, 80, 0);
    await nextFrames();
    expect(onLayoutChange.mock.lastCall![1]).toMatchObject({ type: "resize", split: "split-2" });
    expect(Number(separator.getAttribute("aria-valuenow"))).toBe(35);
    separator.focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(Number(separator.getAttribute("aria-valuenow"))).toBe(30);
  });

  it("maximizes a group of the main surface and restores the others", async () => {
    await renderStrict(<Workbench />);
    await userEvent.click(getByTestId("group-2-maximize"));
    expect(document.querySelectorAll("[data-dock-group]")).toHaveLength(1);
    expect(groupOf("editor").dataset.maximized).toBe("");
    expect(rectOf(groupOf("editor")).width).toBe(800);
    await userEvent.click(getByTestId("group-2-maximize"));
    expect(document.querySelectorAll("[data-dock-group]")).toHaveLength(3);
  });

  it("docks a tab with the keyboard and says where", async () => {
    const onLayoutChange = vi.fn<(layout: DockLayout, action: DockAction) => void>();
    await renderStrict(<Workbench onLayoutChange={onLayoutChange} />);
    tab("search").focus();
    await userEvent.keyboard("{Alt>}{Shift>}m{/Shift}{/Alt}");
    expect(announcements()).toContain("Docking Search.");
    expect(announcements()).toContain("With Editor.");
    expect(tab("search").dataset.docking).toBe("");
    expect(getByTestId("dock").querySelector("[data-dock-drop-indicator]")).not.toBeNull();
    // Two other groups to join, four sides of Explorer's group, then above, below and before Editor.
    for (let press = 0; press < 8; press++) {
      await userEvent.keyboard("{ArrowDown}");
    }
    expect(announcements()).toContain("Beside Editor, before it");
    await userEvent.keyboard("{Enter}");
    expect(shape(onLayoutChange.mock.lastCall![0].root)).toBe("H[(explorer*) | V[H[(search*) | (editor* preview)] | (terminal*)]]");
    expect(document.activeElement).toBe(tab("search"));
    await userEvent.keyboard("{Alt>}{Shift>}m{/Shift}{/Alt}");
    await userEvent.keyboard("{Escape}");
    expect(tab("search").dataset.docking).toBeUndefined();
    expect(onLayoutChange).toHaveBeenCalledOnce();
  });

  it("reorders tabs with the keyboard", async () => {
    const onLayoutChange = vi.fn<(layout: DockLayout, action: DockAction) => void>();
    await renderStrict(<Workbench onLayoutChange={onLayoutChange} />);
    tab("explorer").focus();
    await userEvent.keyboard("{Control>}{Shift>}{ArrowRight}{/Shift}{/Control}");
    expect(shape(onLayoutChange.mock.lastCall![0].root)).toBe("H[(search explorer*) | V[(editor* preview) | (terminal*)]]");
    expect(document.activeElement).toBe(tab("explorer"));
  });

  it("opens a group in a window of its own and takes it back when the window closes", async () => {
    const open = vi.spyOn(window, "open");
    const onLayoutChange = vi.fn<(layout: DockLayout, action: DockAction) => void>();
    await renderStrict(<Workbench onLayoutChange={onLayoutChange} />);
    await userEvent.click(getByTestId("explorer-count"));
    await userEvent.click(getByTestId("group-1-popout"));
    const popup = open.mock.results[0]!.value as Window;
    expect(popup).not.toBeNull();
    await nextFrames();
    expect(popup.document.querySelector("[role=tab][data-panel=explorer]")).not.toBeNull();
    expect(popup.document.querySelector("[data-testid=explorer-count]")?.textContent).toBe("1");
    expect(onLayoutChange.mock.lastCall![0].popouts).toHaveLength(1);
    popup.close();
    await vi.waitFor(() => expect(onLayoutChange.mock.lastCall![1]).toMatchObject({ type: "return" }));
    await nextFrames();
    expect(shape(onLayoutChange.mock.lastCall![0].root)).toBe("H[V[(editor* preview) | (terminal*)] | (explorer* search)]");
    expect(getByTestId("explorer-count").textContent).toBe("1");
  });

  it("draws overlay panels over their group without moving them in the document", async () => {
    await renderStrict(<Workbench />);
    const overlay = getByTestId("dock").querySelector("[data-dock-overlays]");
    expect(host("terminal").parentElement).toBe(overlay);
    const content = rectOf(groupOf("terminal").querySelector("[data-dock-content]")!);
    expect(rectOf(host("terminal"))).toMatchObject({ left: content.left, top: content.top, width: content.width, height: content.height });
    await userEvent.click(getByTestId("terminal-count"));
    const target = rectOf(groupOf("explorer").querySelector("[data-dock-tablist]")!);
    await dragTo(tab("terminal"), target.right - 10, target.top + target.height / 2);
    expect(host("terminal").parentElement).toBe(overlay);
    const moved = rectOf(groupOf("explorer").querySelector("[data-dock-content]")!);
    expect(rectOf(host("terminal"))).toMatchObject({ left: moved.left, top: moved.top, width: moved.width });
    expect(getByTestId("terminal-count").textContent).toBe("1");
  });

  it("lists the tabs that do not fit in a menu and keeps the selected tab in the bar", async () => {
    const files = Array.from({ length: 8 }, (_, index) => `file-${index}`);
    const panels = Object.fromEntries(files.map(file => [file, { title: `Long file name ${file}`, content: <Counter name={file} /> }]));
    const layout = (active: string): DockLayout => Dock.createDockLayout({ root: { panels: files, active } });
    const style = { width: 320, height: 200 };
    const view = await renderStrict(<Workbench panels={panels} layout={layout("file-0")} style={style} />);
    const bar = (): HTMLElement => document.querySelector<HTMLElement>("[role=tablist]")!;
    const trigger = (): HTMLElement => document.querySelector<HTMLElement>("[data-dock-overflow-trigger]")!;
    const menu = (): HTMLElement => document.querySelector<HTMLElement>("[data-dock-overflow-menu]")!;
    const shown = (): string[] => [...bar().querySelectorAll<HTMLElement>("[data-dock-tab]:not([data-overflow])")].map(element => element.dataset.panel!);
    const fits = (): void => {
      for (const panel of shown()) {
        expect(rectOf(tab(panel)).right).toBeLessThanOrEqual(rectOf(trigger()).left + 0.5);
      }
      expect(rectOf(trigger()).right).toBeLessThanOrEqual(rectOf(document.querySelector("[data-dock-controls]")!).left + 0.5);
    };
    expect(shown()[0]).toBe("file-0");
    expect(shown().length).toBeLessThan(files.length);
    expect(trigger().textContent).toBe(`+${files.length - shown().length}`);
    expect(trigger().getAttribute("aria-label")).toBe("More tabs");
    expect(bar().scrollWidth).toBe(bar().clientWidth);
    fits();

    await view.rerender(<Workbench panels={panels} layout={layout("file-6")} style={style} />);
    expect(shown()).toContain("file-6");
    expect(tab("file-6").getAttribute("aria-selected")).toBe("true");
    fits();

    await view.rerender(<Workbench panels={panels} defaultLayout={layout("file-0")} style={style} key="uncontrolled" />);
    tab("file-0").focus();
    await userEvent.keyboard("{End}");
    expect(document.activeElement).toBe(tab("file-7"));
    expect(shown()).toContain("file-7");
    fits();

    await userEvent.click(trigger());
    expect(menu().matches(":popover-open")).toBe(true);
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    const items = [...menu().querySelectorAll<HTMLElement>("[role=menuitem]")];
    expect(items.map(item => item.dataset.panel)).toEqual(files.filter(file => !shown().includes(file)));
    expect(document.activeElement).toBe(items[0]);
    // The menu opens under its button, inside the dock's window.
    expect(rectOf(menu()).top).toBeCloseTo(rectOf(trigger()).bottom, 0);
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(items[1]);
    const chosen = items[1]!.dataset.panel!;
    await userEvent.keyboard("{Enter}");
    expect(menu().matches(":popover-open")).toBe(false);
    expect(tab(chosen).getAttribute("aria-selected")).toBe("true");
    expect(shown()).toContain(chosen);
    expect(document.activeElement).toBe(tab(chosen));

    trigger().focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(menu().matches(":popover-open")).toBe(true);
    await userEvent.keyboard("{Escape}");
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger()));
    expect(menu().matches(":popover-open")).toBe(false);
    expect(getByTestId("dock").scrollLeft).toBe(0);
  });

  it("shows no overflow button while every tab fits", async () => {
    await renderStrict(<Workbench />);
    for (const trigger of document.querySelectorAll<HTMLElement>("[data-dock-overflow-trigger]")) {
      expect(trigger.inert).toBe(true);
      expect(getComputedStyle(trigger).visibility).toBe("hidden");
    }
    expect(document.querySelectorAll("[data-dock-tab][data-overflow]")).toHaveLength(0);
  });

  describe("hidden along the edges", () => {
    const HIDDEN = Dock.createDockLayout({
      root: { orientation: "horizontal", sizes: [0.3, 0.7], children: [{ panels: ["explorer", "search"] }, { panels: ["editor", "preview"] }] },
      autoHide: [{ panels: ["terminal"], side: "bottom", size: 150 }],
    });

    function HiddenWorkbench(props: Partial<DockProps>): React.ReactNode {
      return (
        <Workbench
          defaultLayout={HIDDEN}
          renderGroupControls={({ group, place, api }) => (
            <>
              <button type="button" aria-label="Hide" data-testid={`${group}-hide`} style={CONTROL_STYLE} onClick={() => api.autoHide(group)} />
              {place === "autoHide" && <button type="button" aria-label="Dock" data-testid={`${group}-dock`} style={CONTROL_STYLE} onClick={() => api.dock(group)} />}
            </>
          )}
          {...props}
        />
      );
    }

    const stripTab = (panel: string): HTMLElement => document.querySelector<HTMLElement>(`[data-dock-strip-tab][data-panel="${panel}"]`)!;
    const flyout = (): HTMLElement | null => document.querySelector<HTMLElement>("[data-dock-flyout]");

    it("shows a button for each hidden panel and reveals its group over the main surface", async () => {
      await renderStrict(<HiddenWorkbench />);
      const strip = document.querySelector<HTMLElement>("[data-dock-strip]")!;
      expect(strip.dataset.side).toBe("bottom");
      expect(strip.getAttribute("role")).toBe("toolbar");
      expect(strip.getAttribute("aria-label")).toBe("Hidden panels");
      expect(stripTab("terminal").textContent).toBe("Terminal");
      expect(stripTab("terminal").getAttribute("aria-expanded")).toBe("false");
      expect(flyout()).toBeNull();
      const surface = rectOf(document.querySelector("[data-dock-surface]")!);
      // The strip takes its own room below the main surface.
      expect(rectOf(strip).top).toBeGreaterThanOrEqual(surface.bottom - 0.5);

      await userEvent.click(stripTab("terminal"));
      expect(flyout()).not.toBeNull();
      expect(stripTab("terminal").getAttribute("aria-expanded")).toBe("true");
      expect(stripTab("terminal").getAttribute("aria-controls")).toBe(flyout()!.id);
      expect(rectOf(flyout()!).height).toBeCloseTo(150, 0);
      expect(rectOf(flyout()!).bottom).toBeCloseTo(surface.bottom, 0);
      expect(rectOf(flyout()!).width).toBeCloseTo(surface.width, 0);
      expect(host("terminal").style.visibility).toBe("visible");
      await userEvent.click(getByTestId("terminal-count"));
      expect(getByTestId("terminal-count").textContent).toBe("1");

      // A click anywhere else hides the group again; its panel keeps its state.
      await userEvent.click(tab("editor"));
      expect(flyout()).toBeNull();
      expect(host("terminal").style.visibility).toBe("hidden");
      await userEvent.click(stripTab("terminal"));
      expect(getByTestId("terminal-count").textContent).toBe("1");
      await userEvent.click(stripTab("terminal"));
      expect(flyout()).toBeNull();
    });

    it("reveals with the keyboard, takes focus there, and gives it back on Escape", async () => {
      await renderStrict(<HiddenWorkbench />);
      stripTab("terminal").focus();
      await userEvent.keyboard("{Enter}");
      expect(flyout()).not.toBeNull();
      expect(document.activeElement).toBe(tab("terminal"));
      await userEvent.keyboard("{Escape}");
      expect(flyout()).toBeNull();
      expect(document.activeElement).toBe(stripTab("terminal"));
      await userEvent.keyboard(" ");
      expect(flyout()).not.toBeNull();
      // Focus leaving for the main surface hides it.
      tab("editor").focus();
      await vi.waitFor(() => expect(flyout()).toBeNull());
    });

    it("resizes a revealed group from its inner edge and keeps the size", async () => {
      const onLayoutChange = vi.fn<(layout: DockLayout, action: DockAction) => void>();
      await renderStrict(<HiddenWorkbench onLayoutChange={onLayoutChange} />);
      await userEvent.click(stripTab("terminal"));
      const handle = flyout()!.querySelector<HTMLElement>("[data-dock-flyout-handle]")!;
      expect(handle.getAttribute("role")).toBe("separator");
      expect(handle.getAttribute("aria-valuenow")).toBe("150");
      await drag(handle, 0, -50);
      await nextFrames();
      expect(rectOf(flyout()!).height).toBeCloseTo(200, 0);
      expect(onLayoutChange).toHaveBeenLastCalledWith(expect.objectContaining({ autoHide: [expect.objectContaining({ size: 200 })] }), expect.objectContaining({ type: "size", size: 200 }));
      handle.focus();
      await userEvent.keyboard("{ArrowUp}");
      expect(rectOf(flyout()!).height).toBeCloseTo(220, 0);
      await userEvent.keyboard("{Home}");
      expect(rectOf(flyout()!).height).toBeCloseTo(120, 0);
    });

    it("hides a group along its nearest edge, docks it back, and takes tabs dropped on a strip", async () => {
      const onLayoutChange = vi.fn<(layout: DockLayout, action: DockAction) => void>();
      await renderStrict(<HiddenWorkbench onLayoutChange={onLayoutChange} />);
      const explorerWidth = rectOf(groupOf("explorer")).width;
      await userEvent.click(getByTestId("group-1-hide"));
      let layout = onLayoutChange.mock.lastCall![0];
      expect(shape(layout.root)).toBe("(editor* preview)");
      expect(layout.autoHide).toMatchObject([{ side: "bottom" }, { side: "start", size: Math.round(explorerWidth), group: { panels: ["explorer", "search"] } }]);
      expect(stripTab("explorer")).not.toBeNull();
      expect(document.querySelector("[data-dock-strip][data-side=start]")).not.toBeNull();

      const strip = rectOf(document.querySelector("[data-dock-strip][data-side=bottom]")!);
      await dragTo(tab("preview"), strip.left + strip.width / 2, strip.top + strip.height / 2);
      layout = onLayoutChange.mock.lastCall![0];
      expect(layout.autoHide).toHaveLength(3);
      expect(layout.autoHide![2]).toMatchObject({ side: "bottom", group: { panels: ["preview"] } });

      await userEvent.click(stripTab("terminal"));
      const terminalGroup = flyout()!.dataset.group!;
      await userEvent.click(getByTestId(`${terminalGroup}-dock`));
      layout = onLayoutChange.mock.lastCall![0];
      expect(shape(layout.root)).toBe("V[(editor*) | (terminal*)]");
      expect(flyout()).toBeNull();
    });

    it("hides a column along the nearer side and a row along the top or the bottom", async () => {
      const onLayoutChange = vi.fn<(layout: DockLayout, action: DockAction) => void>();
      const columns = Dock.createDockLayout({
        root: { orientation: "horizontal", sizes: [0.2, 0.5, 0.3], children: [{ panels: ["explorer"] }, { panels: ["editor", "search"] }, { panels: ["preview"] }] },
      });
      const view = await renderStrict(<HiddenWorkbench defaultLayout={columns} onLayoutChange={onLayoutChange} />);
      const editorWidth = rectOf(groupOf("editor")).width;
      // The middle column touches the top, yet goes to the side it is nearer to.
      await userEvent.click(getByTestId(`${groupOf("editor").dataset.group}-hide`));
      expect(onLayoutChange.mock.lastCall![0].autoHide).toMatchObject([{ side: "start", size: Math.round(editorWidth), group: { panels: ["editor", "search"] } }]);

      const rows = Dock.createDockLayout({ root: { orientation: "vertical", sizes: [0.7, 0.3], children: [{ panels: ["editor"] }, { panels: ["terminal"] }] } });
      await view.rerender(<HiddenWorkbench key="rows" defaultLayout={rows} onLayoutChange={onLayoutChange} />);
      // The bottom row touches the start too, yet goes to the bottom.
      await userEvent.click(getByTestId(`${groupOf("terminal").dataset.group}-hide`));
      expect(onLayoutChange.mock.lastCall![0].autoHide).toMatchObject([{ side: "bottom", group: { panels: ["terminal"] } }]);
    });

    it("shows the tab of the revealed panel only and leaves some of the surface showing", async () => {
      const layout = Dock.createDockLayout({ root: { panels: ["editor"] }, autoHide: [{ panels: ["explorer", "search"], side: "bottom", size: 5000 }] });
      await renderStrict(<HiddenWorkbench defaultLayout={layout} />);
      await userEvent.click(stripTab("search"));
      const surface = rectOf(document.querySelector("[data-dock-surface]")!);
      expect(rectOf(flyout()!).height).toBeCloseTo(surface.height - 40, 0);
      expect(flyout()!.querySelector("[data-dock-flyout-handle]")!.getAttribute("aria-valuenow")).toBe(String(Math.round(surface.height - 40)));
      expect([...flyout()!.querySelectorAll<HTMLElement>("[role=tab]")].map(element => element.dataset.panel)).toEqual(["search"]);
      await userEvent.click(stripTab("explorer"));
      expect([...flyout()!.querySelectorAll<HTMLElement>("[role=tab]")].map(element => element.dataset.panel)).toEqual(["explorer"]);
    });

    it("offers the edges among the keyboard's docking choices", async () => {
      const onLayoutChange = vi.fn<(layout: DockLayout, action: DockAction) => void>();
      await renderStrict(<HiddenWorkbench onLayoutChange={onLayoutChange} />);
      tab("search").focus();
      await userEvent.keyboard("{Alt>}{Shift>}M{/Shift}{/Alt}");
      for (let step = 0; step < 20 && !announcements().includes("Hidden along the end edge"); step++) {
        await userEvent.keyboard("{ArrowDown}");
      }
      expect(announcements()).toContain("Hidden along the end edge");
      await userEvent.keyboard("{Enter}");
      expect(onLayoutChange.mock.lastCall![0].autoHide).toMatchObject([{ side: "bottom" }, { side: "end", group: { panels: ["search"] } }]);
    });
  });

  it("follows the reading direction for tab keys", async () => {
    await renderStrict(<Workbench dir="rtl" />);
    tab("explorer").focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(tab("search"));
  });

  it("rejects layouts with panels it has no definition for", async () => {
    const error = await renderError(<Workbench panels={{ explorer: PANELS.explorer! }} />);
    expect(error.message).toContain("places panels it has no definition for: search, editor, preview, terminal");
    expect(Dock.pruneLayout(LAYOUT, ["explorer"]).root).toMatchObject({ type: "group", panels: ["explorer"] });
  });
});
