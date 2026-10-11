import type { ShellProps, ShellSidebarProps } from "./index";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { drag, nextFrames, releasePointer } from "../../test/pointer";
import { getByTestId, renderError, renderStrict } from "../../test/render";
import * as Shell from "./index";

const DOCKED = "(max-width: 0px)";
const MODAL = "(min-width: 0px)";

interface AppProps {
  root?: Partial<ShellProps>;
  sidebar?: Partial<ShellSidebarProps>;
  children?: React.ReactNode;
}

function App({ root, sidebar, children }: AppProps): React.ReactNode {
  return (
    <Shell.Root breakpoint={DOCKED} data-testid="root" style={{ display: "flex", flexWrap: "wrap" }} {...root}>
      <Shell.SkipLink data-testid="skip">Skip to main content</Shell.SkipLink>
      <Shell.Header data-testid="header" style={{ height: 50, width: "100%" }}>
        <Shell.SidebarTrigger data-testid="trigger">Menu</Shell.SidebarTrigger>
        <button type="button" data-testid="header-action">Header action</button>
      </Shell.Header>
      <Shell.Sidebar
        data-testid="sidebar"
        aria-label="Navigation"
        style={{ position: "relative", width: "var(--xlayout-shell-sidebar-offset)", height: 200 }}
        {...sidebar}
      >
        <nav aria-label="Pages">
          <a href="#one" data-testid="one">One</a>
          <a href="#two" data-testid="two">Two</a>
        </nav>
        <Shell.SidebarResizer
          data-testid="resizer"
          aria-label="Resize navigation"
          style={{ position: "absolute", insetBlock: 0, insetInlineEnd: 0, width: 8 }}
        />
      </Shell.Sidebar>
      <Shell.SidebarOverlay data-testid="overlay" />
      <Shell.Main data-testid="main" style={{ flex: 1 }}>
        <button type="button" data-testid="main-action">Main action</button>
        <input data-testid="input" aria-label="Search" />
        {children}
      </Shell.Main>
      <Shell.Footer data-testid="footer" style={{ height: 30, width: "100%" }}>Footer</Shell.Footer>
    </Shell.Root>
  );
}

function rootVariable(name: string): string {
  return getByTestId("root").style.getPropertyValue(name);
}

const modifierKey = /mac|iphone|ipad/i.test(navigator.platform) ? "Meta" : "Control";

describe("shell", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("renders landmarks and a skip link to the main content", async () => {
    await renderStrict(<App />);
    const main = getByTestId("main");
    expect(main.tagName).toBe("MAIN");
    expect(main.tabIndex).toBe(-1);
    expect(getByTestId("header").tagName).toBe("HEADER");
    expect(getByTestId("footer").tagName).toBe("FOOTER");
    const skip = getByTestId("skip");
    expect(skip.getAttribute("href")).toBe(`#${main.id}`);
    await userEvent.click(skip);
    expect(document.activeElement).toBe(main);
  });

  it("publishes sidebar and region sizes as CSS variables", async () => {
    await renderStrict(<App />);
    const sidebar = getByTestId("sidebar");
    expect(sidebar.dataset.state).toBe("expanded");
    expect(sidebar.dataset.mode).toBe("docked");
    expect(sidebar.dataset.side).toBe("start");
    expect(sidebar.dataset.collapsible).toBe("offcanvas");
    expect(sidebar.getAttribute("role")).toBeNull();
    expect(sidebar.getAttribute("aria-label")).toBeNull();
    expect(sidebar.style.getPropertyValue("--xlayout-shell-sidebar-width")).toBe("16rem");
    expect(rootVariable("--xlayout-shell-start-width")).toBe("16rem");
    expect(rootVariable("--xlayout-shell-start-offset")).toBe("16rem");
    expect(rootVariable("--xlayout-shell-end-offset")).toBe("0px");
    expect(rootVariable("--xlayout-shell-header-height")).toBe("50px");
    expect(rootVariable("--xlayout-shell-footer-height")).toBe("30px");
    expect(getByTestId("root").dataset.hydrated).toBe("");
  });

  it("collapses an offcanvas sidebar out of reach", async () => {
    await renderStrict(<App />);
    const trigger = getByTestId("trigger");
    const sidebar = getByTestId("sidebar");
    expect(trigger.getAttribute("aria-controls")).toBe("start");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    await userEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(sidebar.dataset.state).toBe("collapsed");
    expect(sidebar.inert).toBe(true);
    expect(rootVariable("--xlayout-shell-start-offset")).toBe("0px");
    await userEvent.click(trigger);
    expect(sidebar.dataset.state).toBe("expanded");
    expect(sidebar.inert).toBe(false);
  });

  it("keeps an icon sidebar reachable at its collapsed width", async () => {
    await renderStrict(<App sidebar={{ collapsible: "icon" }} />);
    await userEvent.click(getByTestId("trigger"));
    const sidebar = getByTestId("sidebar");
    expect(sidebar.dataset.state).toBe("collapsed");
    expect(sidebar.inert).toBe(false);
    expect(rootVariable("--xlayout-shell-start-offset")).toBe("3rem");
    expect(sidebar.getBoundingClientRect().width).toBe(48);
  });

  it("never collapses a sidebar that is not collapsible", async () => {
    await renderStrict(<App sidebar={{ collapsible: "none" }} root={{ breakpoint: MODAL }} />);
    await userEvent.click(getByTestId("trigger"));
    const sidebar = getByTestId("sidebar");
    expect(sidebar.dataset.state).toBe("expanded");
    expect(sidebar.dataset.mode).toBe("docked");
  });

  it("toggles with a keyboard shortcut outside text fields", async () => {
    await renderStrict(<App sidebar={{ shortcut: "mod+b" }} />);
    const trigger = getByTestId("trigger");
    expect(trigger.getAttribute("aria-keyshortcuts")).toBe("Control+B Meta+B");
    getByTestId("main-action").focus();
    await userEvent.keyboard(`{${modifierKey}>}b{/${modifierKey}}`);
    expect(getByTestId("sidebar").dataset.state).toBe("collapsed");
    getByTestId("input").focus();
    await userEvent.keyboard(`{${modifierKey}>}b{/${modifierKey}}`);
    expect(getByTestId("sidebar").dataset.state).toBe("collapsed");
  });

  it("opens as a modal drawer on narrow screens", async () => {
    await renderStrict(<App root={{ breakpoint: MODAL }} />);
    const root = getByTestId("root");
    const sidebar = getByTestId("sidebar");
    const trigger = getByTestId("trigger");
    expect(root.dataset.mobile).toBe("");
    expect(sidebar.dataset.mode).toBe("modal");
    expect(sidebar.dataset.state).toBe("collapsed");
    expect(sidebar.inert).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector("[data-testid=overlay]")).toBeNull();

    await userEvent.click(trigger);
    expect(sidebar.getAttribute("role")).toBe("dialog");
    expect(sidebar.getAttribute("aria-modal")).toBe("true");
    expect(sidebar.getAttribute("aria-label")).toBe("Navigation");
    expect(sidebar.inert).toBe(false);
    expect(document.activeElement).toBe(getByTestId("one"));
    expect(getByTestId("main").inert).toBe(true);
    expect(getByTestId("header").inert).toBe(true);
    expect(getByTestId("overlay").inert).toBe(false);
    expect(getByTestId("overlay").dataset.state).toBe("open");
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(getByTestId("resizer").hidden).toBe(true);

    await userEvent.keyboard("{Escape}");
    expect(sidebar.dataset.state).toBe("collapsed");
    expect(document.activeElement).toBe(trigger);
    expect(getByTestId("main").inert).toBe(false);
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("keeps Tab inside the open drawer", async () => {
    await renderStrict(<App root={{ breakpoint: MODAL }} />);
    await userEvent.click(getByTestId("trigger"));
    expect(document.activeElement).toBe(getByTestId("one"));
    await userEvent.tab();
    expect(document.activeElement).toBe(getByTestId("two"));
    await userEvent.tab();
    expect(document.activeElement).toBe(getByTestId("one"));
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(getByTestId("two"));
  });

  it("closes the drawer from the overlay and after following a link", async () => {
    await renderStrict(<App root={{ breakpoint: MODAL }} />);
    const sidebar = getByTestId("sidebar");
    await userEvent.click(getByTestId("trigger"));
    getByTestId("overlay").click();
    await nextFrames();
    expect(sidebar.dataset.state).toBe("collapsed");
    await userEvent.click(getByTestId("trigger"));
    await userEvent.click(getByTestId("two"));
    expect(sidebar.dataset.state).toBe("collapsed");
  });

  it("closes the drawer when the screen becomes wide", async () => {
    const onOpenMobileChange = vi.fn();
    const view = await renderStrict(<App root={{ breakpoint: MODAL }} sidebar={{ onOpenMobileChange }} />);
    await userEvent.click(getByTestId("trigger"));
    expect(onOpenMobileChange).toHaveBeenLastCalledWith(true);
    await view.rerender(<App root={{ breakpoint: DOCKED }} sidebar={{ onOpenMobileChange }} />);
    await nextFrames();
    expect(onOpenMobileChange).toHaveBeenLastCalledWith(false);
    expect(getByTestId("sidebar").dataset.mode).toBe("docked");
    expect(getByTestId("sidebar").dataset.state).toBe("expanded");
    expect(getByTestId("main").inert).toBe(false);
  });

  it("persists sidebar state in storage", async () => {
    const view = await renderStrict(<App root={{ storageKey: "shell" }} />);
    await userEvent.click(getByTestId("trigger"));
    expect(JSON.parse(localStorage.getItem("shell")!)).toEqual({ version: 1, sidebars: { start: { open: false } } });
    await view.unmount();
    await renderStrict(<App root={{ storageKey: "shell" }} />);
    expect(getByTestId("sidebar").dataset.state).toBe("collapsed");
  });

  it("starts from state passed in from the server and reports changes", async () => {
    const onStateChange = vi.fn();
    await renderStrict(<App root={{ defaultState: { start: { open: false, width: 300 } }, onStateChange }} />);
    const sidebar = getByTestId("sidebar");
    expect(sidebar.dataset.state).toBe("collapsed");
    expect(sidebar.style.getPropertyValue("--xlayout-shell-sidebar-width")).toBe("300px");
    await userEvent.click(getByTestId("trigger"));
    const expected = { start: { open: true, width: 300 } };
    expect(onStateChange).toHaveBeenLastCalledWith(expected, Shell.serializeShellState(expected));
  });

  it("resizes with the keyboard and collapses at the start", async () => {
    await renderStrict(<App />);
    const resizer = getByTestId("resizer");
    expect(resizer.getAttribute("role")).toBe("separator");
    expect(resizer.getAttribute("aria-controls")).toBe("start");
    expect(resizer.getAttribute("aria-valuenow")).toBe("256");
    expect(resizer.getAttribute("aria-valuetext")).toBe("256px");
    expect(resizer.getAttribute("aria-valuemin")).toBe("0");
    expect(resizer.getAttribute("aria-valuemax")).toBe("512");
    resizer.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(resizer.getAttribute("aria-valuenow")).toBe("266");
    await userEvent.keyboard("{Shift>}{ArrowRight}{/Shift}");
    expect(resizer.getAttribute("aria-valuenow")).toBe("316");
    await userEvent.keyboard("{ArrowLeft}");
    expect(resizer.getAttribute("aria-valuenow")).toBe("306");
    await userEvent.keyboard("{End}");
    expect(resizer.getAttribute("aria-valuenow")).toBe("512");
    expect(getByTestId("sidebar").getBoundingClientRect().width).toBe(512);
    await userEvent.keyboard("{Home}");
    expect(getByTestId("sidebar").dataset.state).toBe("collapsed");
    expect(resizer.hidden).toBe(true);
  });

  it("collapses and restores an icon sidebar with Enter", async () => {
    await renderStrict(<App sidebar={{ collapsible: "icon", defaultWidth: 280 }} />);
    const resizer = getByTestId("resizer");
    resizer.focus();
    await userEvent.keyboard("{Enter}");
    expect(getByTestId("sidebar").dataset.state).toBe("collapsed");
    expect(resizer.getAttribute("aria-valuenow")).toBe("48");
    await userEvent.keyboard("{Enter}");
    expect(getByTestId("sidebar").dataset.state).toBe("expanded");
    expect(resizer.getAttribute("aria-valuenow")).toBe("280");
  });

  it("grows the sidebar towards the content in every direction", async () => {
    const view = await renderStrict(<App root={{ dir: "rtl" }} />);
    getByTestId("resizer").focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(getByTestId("resizer").getAttribute("aria-valuenow")).toBe("266");
    await view.unmount();
    await renderStrict(<App sidebar={{ side: "end", id: "details" }} />);
    getByTestId("resizer").focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(getByTestId("resizer").getAttribute("aria-valuenow")).toBe("266");
    expect(rootVariable("--xlayout-shell-end-offset")).toBe("266px");
  });

  it("resizes by dragging, collapses past the threshold and restores on Escape", async () => {
    const onWidthChange = vi.fn();
    await renderStrict(<App sidebar={{ onWidthChange }} root={{ storageKey: "shell" }} />);
    const resizer = getByTestId("resizer");
    await drag(resizer, 44, 0);
    await nextFrames();
    expect(getByTestId("sidebar").getBoundingClientRect().width).toBeCloseTo(300, 0);
    expect(onWidthChange).toHaveBeenLastCalledWith(300);
    expect(JSON.parse(localStorage.getItem("shell")!).sidebars.start).toEqual({ open: true, width: 300 });

    await drag(resizer, -100, 0, { release: false });
    await nextFrames();
    expect(getByTestId("sidebar").getBoundingClientRect().width).toBeCloseTo(200, 0);
    expect(getByTestId("root").dataset.resizing).toBe("");
    await userEvent.keyboard("{Escape}");
    await nextFrames();
    expect(getByTestId("sidebar").getBoundingClientRect().width).toBeCloseTo(300, 0);
    await releasePointer();

    await drag(resizer, -260, 0);
    await nextFrames();
    expect(getByTestId("sidebar").dataset.state).toBe("collapsed");
    expect(JSON.parse(localStorage.getItem("shell")!).sidebars.start).toEqual({ open: false, width: 300 });
  });

  it("restores the default width on double click", async () => {
    await renderStrict(<App />);
    const resizer = getByTestId("resizer");
    resizer.focus();
    await userEvent.keyboard("{End}");
    await userEvent.dblClick(resizer);
    expect(resizer.getAttribute("aria-valuenow")).toBe("256");
  });

  it("moves focus between landmarks with F6", async () => {
    await renderStrict(<App root={{ landmarkNavigation: true }} />);
    getByTestId("header-action").focus();
    await userEvent.keyboard("{F6}");
    expect(document.activeElement).toBe(getByTestId("one"));
    await userEvent.keyboard("{F6}");
    expect(document.activeElement).toBe(getByTestId("main-action"));
    await userEvent.keyboard("{F6}");
    expect(document.activeElement).toBe(getByTestId("footer"));
    await userEvent.keyboard("{F6}");
    expect(document.activeElement).toBe(getByTestId("header-action"));
    await userEvent.keyboard("{Shift>}{F6}{/Shift}");
    expect(document.activeElement).toBe(getByTestId("footer"));
  });

  it("gives content access to a sidebar", async () => {
    function Status(): React.ReactNode {
      const sidebar = Shell.useShellSidebar();
      const shell = Shell.useShell();
      return (
        <button type="button" data-testid="status" onClick={sidebar?.toggle}>
          {`${sidebar?.state} ${sidebar?.width} ${shell.isMobile}`}
        </button>
      );
    }
    await renderStrict(<App><Status /></App>);
    expect(getByTestId("status").textContent).toBe("expanded 16rem false");
    await userEvent.click(getByTestId("status"));
    expect(getByTestId("status").textContent).toBe("collapsed 16rem false");
  });

  it("rejects two sidebars with the same id", async () => {
    const error = await renderError(
      <Shell.Root>
        <Shell.Sidebar />
        <Shell.Sidebar />
      </Shell.Root>,
    );
    expect(error.message).toContain("already has a sidebar with the id \"start\"");
  });
});
