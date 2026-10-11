import type * as DockTypes from "../dock";
import * as React from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { commands, userEvent } from "vitest/browser";
import * as Csp from ".";
import { nextFrames } from "../../test/pointer";
import * as Dock from "../dock";
import * as Grid from "../grid";
import * as Masonry from "../masonry";
import * as Overflow from "../overflow";
import * as ScrollSpy from "../scroll-spy";
import * as Shell from "../shell";
import * as Splitter from "../splitter";
import * as Sticky from "../sticky";

const NONCE = "xlayout-test-nonce";
/** Styles only with the nonce, no style attributes, and DOM sinks only with trusted types. */
const STRICT_POLICY = `default-src 'none'; style-src 'nonce-${NONCE}'; require-trusted-types-for 'script'`;

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

interface TrustedTypes {
  createPolicy: (name: string, rules: { createHTML: (input: string) => string }) => { createHTML: (input: string) => string };
}

interface Frame {
  element: HTMLIFrameElement;
  window: Window & typeof globalThis;
  document: Document;
  container: HTMLElement;
  /** The directive and sample of every policy violation in the frame, as reported. */
  violations: string[];
}

function watchViolations(target: Document, violations: string[]): void {
  target.addEventListener("securitypolicyviolation", (event) => {
    violations.push(`${event.effectiveDirective}: ${event.sample || event.blockedURI}`);
  });
}

/** A frame of the test page's size, with `policy` as its content security policy. */
async function openFrame(policy: string | null): Promise<Frame> {
  const element = document.createElement("iframe");
  element.style.setProperty("width", "1000px");
  element.style.setProperty("height", "700px");
  element.style.setProperty("border", "0");
  element.style.setProperty("display", "block");
  const meta = policy === null ? "" : `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
  element.srcdoc = `<!doctype html><html><head>${meta}</head><body><div id="root"></div></body></html>`;
  const loaded = new Promise(resolve => element.addEventListener("load", resolve, { once: true }));
  document.body.append(element);
  cleanups.push(() => element.remove());
  await loaded;
  const frameDocument = element.contentDocument!;
  frameDocument.documentElement.style.setProperty("font-size", "16px");
  frameDocument.body.style.setProperty("margin", "0");
  const violations: string[] = [];
  watchViolations(frameDocument, violations);
  return {
    element,
    window: element.contentWindow as Window & typeof globalThis,
    document: frameDocument,
    container: frameDocument.getElementById("root")!,
    violations,
  };
}

/** Puts server markup into the frame the way the browser parses a page, through a trusted types policy where there is one. */
function showMarkup(frame: Frame, markup: string): void {
  const trustedTypes = (frame.window as { trustedTypes?: TrustedTypes }).trustedTypes;
  frame.container.innerHTML = trustedTypes ? trustedTypes.createPolicy("xlayout-test", { createHTML: input => input }).createHTML(markup) : markup;
}

function withNonce(ui: React.ReactNode, nonce: string | null): React.ReactNode {
  return <React.StrictMode>{nonce === null ? ui : <Csp.Provider nonce={nonce}>{ui}</Csp.Provider>}</React.StrictMode>;
}

/** Hydrates the frame's markup; the returned list collects the errors React recovers from. */
function hydrate(frame: Frame, ui: React.ReactNode): unknown[] {
  const errors: unknown[] = [];
  const root = hydrateRoot(frame.container, ui, { onRecoverableError: error => errors.push(error) });
  cleanups.unshift(() => root.unmount());
  return errors;
}

/** Violations are reported in a task after the browser blocked something. */
async function settle(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 50));
  await nextFrames();
}

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

function boxesOf(frame: Frame, testIds: readonly string[]): Record<string, Box> {
  return Object.fromEntries(testIds.map((testId) => {
    const element = frame.document.querySelector(`[data-testid="${testId}"]`);
    if (!element) {
      throw new Error(`No element with the test id "${testId}" in the frame.`);
    }
    const { left, top, width, height } = element.getBoundingClientRect();
    return [testId, { left: Math.round(left), top: Math.round(top), width: Math.round(width), height: Math.round(height) }];
  }));
}

function byTestId(frame: Frame, testId: string): HTMLElement {
  return frame.document.querySelector<HTMLElement>(`[data-testid="${testId}"]`)!;
}

const DOCK_LAYOUT = Dock.createDockLayout({ root: { orientation: "horizontal", sizes: [0.4, 0.6], children: [{ panels: ["files"] }, { panels: ["editor"] }] } });
const DOCK_PANELS: Record<string, DockTypes.DockPanelDefinition> = {
  files: { title: "Files", content: "Files" },
  editor: { title: "Editor", content: "Editor" },
};

function Everything(): React.ReactNode {
  return (
    <ScrollSpy.Root defaultValue="layouts">
      <Shell.Root style={{ height: 680 }} defaultState={Shell.parseShellState(Shell.serializeShellState({ start: { open: true, width: 220 } }))}>
        {/* The page's own styles, allowed by the nonce as well. */}
        <style nonce={NONCE}>{".row{display:flex}"}</style>
        <Shell.Header data-testid="header" style={{ height: 40 }}>
          <Shell.SidebarTrigger>Contents</Shell.SidebarTrigger>
        </Shell.Header>
        <div className="row">
          <Shell.Sidebar data-testid="sidebar" aria-label="Contents" style={{ width: "var(--xlayout-shell-sidebar-offset)", flex: "none" }}>
            <ScrollSpy.Nav aria-label="Contents">
              <ScrollSpy.List>
                <ScrollSpy.Item value="layouts"><ScrollSpy.Link>Layouts</ScrollSpy.Link></ScrollSpy.Item>
              </ScrollSpy.List>
            </ScrollSpy.Nav>
            <Shell.SidebarResizer data-testid="resizer" style={{ width: 6, height: 40 }} />
          </Shell.Sidebar>
          <Shell.Main style={{ flex: 1, minWidth: 0 }}>
            <ScrollSpy.Section value="layouts">
              <Grid.Root data-testid="grid" columns={4} rowHeight={40} gap={8} defaultLayouts={{ base: [{ value: "chart", x: 1, y: 0, w: 2, h: 2 }, { value: "notes", x: 0, y: 2, w: 1, h: 1 }] }}>
                <Grid.Item value="chart" data-testid="chart">
                  <Grid.DragHandle data-testid="chart-handle">Move</Grid.DragHandle>
                </Grid.Item>
                <Grid.Item value="notes" data-testid="notes">Notes</Grid.Item>
              </Grid.Root>
              <Splitter.Root style={{ height: 100 }}>
                <Splitter.Panel id="list" data-testid="list" defaultSize={30}>List</Splitter.Panel>
                <Splitter.Handle data-testid="splitter-handle" style={{ width: 10 }} />
                <Splitter.Panel id="detail" data-testid="detail">Detail</Splitter.Panel>
              </Splitter.Root>
              <Dock.Root data-testid="dock" panels={DOCK_PANELS} defaultLayout={DOCK_LAYOUT} style={{ height: 120 }} />
              <Masonry.Root columns={2} style={{ columnGap: 10, rowGap: 10 }}>
                <Masonry.Item data-testid="one" style={{ height: 60 }}>One</Masonry.Item>
                <Masonry.Item data-testid="two" style={{ height: 30 }}>Two</Masonry.Item>
                <Masonry.Item data-testid="three" style={{ height: 40 }}>Three</Masonry.Item>
              </Masonry.Root>
              <Overflow.Root style={{ width: 200 }}>
                {["Bold", "Italic", "Underline", "Strike", "Code"].map(label => (
                  <Overflow.Item key={label} value={label} data-testid={label} style={{ width: 60 }}>{label}</Overflow.Item>
                ))}
                <Overflow.Indicator data-testid="more" style={{ width: 40 }}>More</Overflow.Indicator>
              </Overflow.Root>
              <Sticky.Group>
                <Sticky.Root data-testid="sticky" offset={4}>Heading</Sticky.Root>
              </Sticky.Group>
            </ScrollSpy.Section>
          </Shell.Main>
        </div>
      </Shell.Root>
    </ScrollSpy.Root>
  );
}

const MEASURED = ["header", "sidebar", "resizer", "grid", "chart", "notes", "list", "splitter-handle", "detail", "dock", "one", "two", "three", "Bold", "Italic", "more", "sticky"];
const DOCK_PARTS = ["[data-dock-group]", "[data-dock-tablist]", "[data-dock-content]", "[role=separator]"];

function dockBoxes(frame: Frame): Box[] {
  return DOCK_PARTS.flatMap(selector => [...frame.document.querySelectorAll(selector)]
    .filter(element => element.closest("[data-testid=dock]"))
    .map((element) => {
      const { left, top, width, height } = element.getBoundingClientRect();
      return { left: Math.round(left), top: Math.round(top), width: Math.round(width), height: Math.round(height) };
    }));
}

/** Renders `Everything` on the server for a frame and shows the markup in it, as a page load would. */
async function loadEverything(policy: string | null, nonce: string | null): Promise<Frame> {
  const frame = await openFrame(policy);
  showMarkup(frame, renderToString(withNonce(<Everything />, nonce)));
  await settle();
  return frame;
}

async function hydrateEverything(frame: Frame, nonce: string | null): Promise<unknown[]> {
  const errors = hydrate(frame, withNonce(<Everything />, nonce));
  // The dock adds its panels' hosts once the hydrated tree is committed.
  await vi.waitFor(() => expect(frame.container.querySelectorAll("[data-dock-content] [data-dock-panel]")).toHaveLength(2));
  await settle();
  return errors;
}

/** Presses the real mouse on `element` in the frame and moves it by `deltaX` and `deltaY`. */
async function dragInFrame(frame: Frame, element: Element, deltaX: number, deltaY: number, { release = true } = {}): Promise<void> {
  const frameRect = frame.element.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  const x = frameRect.left + rect.left + rect.width / 2;
  const y = frameRect.top + rect.top + rect.height / 2;
  await commands.pointer([
    { type: "move", x, y },
    { type: "down" },
    { type: "move", x: x + deltaX, y: y + deltaY, steps: 8 },
    ...(release ? [{ type: "up" as const }] : []),
  ]);
}

describe("content security policy", () => {
  it("drops style attributes from server markup without the provider, so the frame does enforce the policy", async () => {
    const frame = await loadEverything(STRICT_POLICY, null);
    expect(frame.violations.length).toBeGreaterThan(0);
    expect(frame.violations.every(violation => violation.startsWith("style-src"))).toBe(true);
  });

  it("lays the server markup out as it would without a policy, and hydrates without changing it", async () => {
    const plain = await loadEverything(null, null);
    const expectedMarkup = boxesOf(plain, MEASURED);
    const expectedDock = dockBoxes(plain);
    const strict = await loadEverything(STRICT_POLICY, NONCE);
    expect(strict.violations).toEqual([]);
    expect(boxesOf(strict, MEASURED)).toEqual(expectedMarkup);
    expect(dockBoxes(strict)).toEqual(expectedDock);

    const plainErrors = await hydrateEverything(plain, null);
    const strictErrors = await hydrateEverything(strict, NONCE);
    expect(plainErrors).toEqual([]);
    expect(strictErrors).toEqual([]);
    expect(strict.violations).toEqual([]);
    expect(boxesOf(strict, MEASURED)).toEqual(boxesOf(plain, MEASURED));
    expect(dockBoxes(strict)).toEqual(dockBoxes(plain));
    // Once hydrated, React sets styles through the CSSOM, so the stand-in style elements are gone;
    // the grid's own rules and the page's stay, with the nonce.
    expect(strict.container.querySelectorAll("[data-xlayout-css]")).toHaveLength(0);
    const styles = [...strict.container.querySelectorAll("style")];
    expect(styles.filter(style => style.textContent.includes("data-xlayout-css"))).toEqual([]);
    expect(styles.map(style => style.nonce)).toEqual([NONCE, NONCE]);
  });

  it("keeps working within the policy as the reader resizes, drags and gets announcements", async () => {
    const frame = await loadEverything(STRICT_POLICY, NONCE);
    await hydrateEverything(frame, NONCE);
    const listWidth = byTestId(frame, "list").getBoundingClientRect().width;

    byTestId(frame, "splitter-handle").focus();
    await userEvent.keyboard("{ArrowRight}");
    await nextFrames();
    expect(byTestId(frame, "list").getBoundingClientRect().width).toBeGreaterThan(listWidth);

    // Dragging adopts a constructed style sheet for the cursor and text selection, which the
    // policy allows.
    const before = byTestId(frame, "detail").getBoundingClientRect().width;
    await dragInFrame(frame, byTestId(frame, "splitter-handle"), -60, 0, { release: false });
    const selection = frame.window.getComputedStyle(frame.document.body);
    expect(selection.userSelect || selection.getPropertyValue("-webkit-user-select")).toBe("none");
    await commands.pointer([{ type: "up" }]);
    await nextFrames();
    expect(frame.window.getComputedStyle(frame.document.body).userSelect || "auto").not.toBe("none");
    expect(byTestId(frame, "detail").getBoundingClientRect().width).toBeGreaterThan(before + 40);

    await dragInFrame(frame, byTestId(frame, "chart-handle"), -200, 0);
    await nextFrames();
    expect(byTestId(frame, "chart").style.getPropertyValue("--xlayout-grid-x")).toBe("");

    byTestId(frame, "chart-handle").focus();
    await userEvent.keyboard(" ");
    const region = frame.document.querySelector<HTMLElement>("[data-xlayout-live-region]")!;
    expect(region.textContent).toContain("picked up");
    // The live region is hidden through the CSSOM.
    expect(frame.window.getComputedStyle(region).position).toBe("absolute");
    expect(region.getBoundingClientRect().width).toBeLessThanOrEqual(1);
    await userEvent.keyboard("{Escape}");

    await settle();
    expect(frame.violations).toEqual([]);
  });

  it("carries the page's styles into popout windows with their nonce", async () => {
    const frame = await openFrame(STRICT_POLICY);
    const style = frame.document.createElement("style");
    style.setAttribute("nonce", NONCE);
    style.textContent = "[data-dock-tab]{color:rgb(1, 2, 3)}";
    frame.document.head.append(style);
    const root = createRoot(frame.container);
    cleanups.unshift(() => root.unmount());
    root.render(withNonce(
      <Dock.Root
        panels={DOCK_PANELS}
        defaultLayout={DOCK_LAYOUT}
        renderGroupControls={({ group, api }) => <button type="button" data-testid={`${group}-popout`} onClick={() => api.popout(group)}>Pop out</button>}
        style={{ height: 200 }}
      />,
      NONCE,
    ));
    await vi.waitFor(() => expect(byTestId(frame, "group-1-popout")).not.toBeNull());
    const open = vi.spyOn(frame.window, "open");
    // A real click, so the browser lets the window open.
    const frameRect = frame.element.getBoundingClientRect();
    const buttonRect = byTestId(frame, "group-1-popout").getBoundingClientRect();
    await commands.pointer([
      { type: "move", x: frameRect.left + buttonRect.left + buttonRect.width / 2, y: frameRect.top + buttonRect.top + buttonRect.height / 2 },
      { type: "down" },
      { type: "up" },
    ]);
    await vi.waitFor(() => expect(open).toHaveBeenCalled());
    const popup = open.mock.results[0]!.value as Window | null;
    expect(popup).not.toBeNull();
    const popupViolations: string[] = [];
    watchViolations(popup!.document, popupViolations);
    cleanups.unshift(() => popup!.close());
    await vi.waitFor(() => expect(popup!.document.querySelector("[data-dock-tab]")).not.toBeNull());
    await settle();
    const tab = popup!.document.querySelector("[data-dock-tab]")!;
    expect(popup!.getComputedStyle(tab).color).toBe("rgb(1, 2, 3)");
    expect(popupViolations).toEqual([]);
    expect(frame.violations).toEqual([]);
  });
});
