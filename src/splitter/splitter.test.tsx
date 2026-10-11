import type { SplitterActions, SplitterLayout } from "./types";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { drag, movePointer, nextFrames, releasePointer } from "../../test/pointer";
import { getById, getByTestId, heightOf, renderError, renderStrict, widthOf } from "../../test/render";
import * as Splitter from "./index";

const HANDLE_SIZE = 10;
const GROUP_WIDTH = 1010;
const PANEL_SPACE = GROUP_WIDTH - HANDLE_SIZE;

interface TwoPanelsProps extends Omit<Splitter.SplitterProps, "children"> {
  first?: Omit<Splitter.SplitterPanelProps, "id">;
  second?: Omit<Splitter.SplitterPanelProps, "id">;
  width?: number;
}

function TwoPanels({ first, second, width = GROUP_WIDTH, ...rootProps }: TwoPanelsProps): React.ReactNode {
  return (
    <Splitter.Root data-testid="group" style={{ width, height: 300 }} {...rootProps}>
      <Splitter.Panel id="first" defaultSize={30} {...first} />
      <Splitter.Handle data-testid="handle" aria-label="Resize" style={{ width: HANDLE_SIZE }} />
      <Splitter.Panel id="second" {...second} />
    </Splitter.Root>
  );
}

function expectWidth(id: string, percent: number, space = PANEL_SPACE): void {
  expect(widthOf(getById(id))).toBeCloseTo((space * percent) / 100, 0);
}

describe("splitter", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("sizes panels from their default sizes and shares the rest", async () => {
    await renderStrict(<TwoPanels />);
    expectWidth("first", 30);
    expectWidth("second", 70);
    expect(getById("first").style.getPropertyValue("--xlayout-splitter-panel-size")).toBe("30%");
  });

  it("describes the handle as a window splitter", async () => {
    await renderStrict(<TwoPanels first={{ minSize: 10, maxSize: 80 }} />);
    const handle = getByTestId("handle");
    expect(handle.getAttribute("role")).toBe("separator");
    expect(handle.getAttribute("aria-orientation")).toBe("vertical");
    expect(handle.getAttribute("aria-controls")).toBe("first");
    expect(handle.getAttribute("aria-valuenow")).toBe("30");
    expect(handle.getAttribute("aria-valuemin")).toBe("10");
    expect(handle.getAttribute("aria-valuemax")).toBe("80");
    expect(handle.tabIndex).toBe(0);
    expect(handle.dataset.orientation).toBe("vertical");
    expect(getById("first").dataset.state).toBe("expanded");
  });

  it("reports the range the neighbouring panels allow", async () => {
    await renderStrict(<TwoPanels second={{ minSize: 40 }} />);
    expect(getByTestId("handle").getAttribute("aria-valuemax")).toBe("60");
  });

  it("moves the handle with arrow keys, Shift, Home and End", async () => {
    const onLayoutCommit = vi.fn();
    await renderStrict(<TwoPanels first={{ minSize: 10, maxSize: 80 }} onLayoutCommit={onLayoutCommit} />);
    const handle = getByTestId("handle");
    handle.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(handle.getAttribute("aria-valuenow")).toBe("35");
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(handle.getAttribute("aria-valuenow")).toBe("25");
    await userEvent.keyboard("{Shift>}{ArrowRight}{/Shift}");
    expect(handle.getAttribute("aria-valuenow")).toBe("45");
    await userEvent.keyboard("{End}");
    expect(handle.getAttribute("aria-valuenow")).toBe("80");
    await userEvent.keyboard("{Home}");
    expect(handle.getAttribute("aria-valuenow")).toBe("10");
    expectWidth("first", 10);
    expect(onLayoutCommit).toHaveBeenCalledTimes(6);
    expect(onLayoutCommit).toHaveBeenLastCalledWith({ first: 10, second: 90 }, { source: "keyboard" });
  });

  it("reverses horizontal arrow keys in right-to-left layouts", async () => {
    await renderStrict(<TwoPanels dir="rtl" />);
    const handle = getByTestId("handle");
    handle.focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(handle.getAttribute("aria-valuenow")).toBe("35");
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    expect(handle.getAttribute("aria-valuenow")).toBe("25");
  });

  it("uses up and down arrows for stacked panels and ignores the others", async () => {
    await renderStrict(
      <Splitter.Root orientation="vertical" style={{ width: 400, height: GROUP_WIDTH }}>
        <Splitter.Panel id="top" defaultSize={50} />
        <Splitter.Handle data-testid="handle" style={{ height: HANDLE_SIZE }} />
        <Splitter.Panel id="bottom" />
      </Splitter.Root>,
    );
    const handle = getByTestId("handle");
    expect(handle.getAttribute("aria-orientation")).toBe("horizontal");
    handle.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(handle.getAttribute("aria-valuenow")).toBe("55");
    await userEvent.keyboard("{ArrowRight}");
    expect(handle.getAttribute("aria-valuenow")).toBe("55");
    expect(heightOf(getById("top"))).toBeCloseTo(PANEL_SPACE * 0.55, 0);
  });

  it("cycles focus through the handles of a group with F6", async () => {
    await renderStrict(
      <Splitter.Root style={{ width: 1020, height: 300 }}>
        <Splitter.Panel id="a" />
        <Splitter.Handle data-testid="one" style={{ width: HANDLE_SIZE }} />
        <Splitter.Panel id="b" />
        <Splitter.Handle data-testid="two" style={{ width: HANDLE_SIZE }} />
        <Splitter.Panel id="c" />
      </Splitter.Root>,
    );
    getByTestId("one").focus();
    await userEvent.keyboard("{F6}");
    expect(document.activeElement).toBe(getByTestId("two"));
    await userEvent.keyboard("{F6}");
    expect(document.activeElement).toBe(getByTestId("one"));
    await userEvent.keyboard("{Shift>}{F6}{/Shift}");
    expect(document.activeElement).toBe(getByTestId("two"));
  });

  it("collapses and restores the primary panel with Enter", async () => {
    const onCollapsedChange = vi.fn();
    await renderStrict(<TwoPanels first={{ defaultSize: 35, minSize: 20, collapsible: true, onCollapsedChange }} />);
    const handle = getByTestId("handle");
    handle.focus();
    await userEvent.keyboard("{Enter}");
    expect(handle.getAttribute("aria-valuenow")).toBe("0");
    expect(getById("first").dataset.state).toBe("collapsed");
    expect(onCollapsedChange).toHaveBeenLastCalledWith(true);
    await userEvent.keyboard("{Enter}");
    expect(handle.getAttribute("aria-valuenow")).toBe("35");
    expect(getById("first").dataset.state).toBe("expanded");
    expect(onCollapsedChange).toHaveBeenLastCalledWith(false);
  });

  it("makes a panel collapsed to nothing inert", async () => {
    await renderStrict(
      <TwoPanels first={{ minSize: 20, collapsible: true, children: <button type="button">Inside</button> }} />,
    );
    getByTestId("handle").focus();
    await userEvent.keyboard("{Enter}");
    expect(getById("first").inert).toBe(true);
    await userEvent.keyboard("{Enter}");
    expect(getById("first").inert).toBe(false);
  });

  it("resizes panels by dragging the handle", async () => {
    const onLayoutChange = vi.fn();
    const onLayoutCommit = vi.fn();
    await renderStrict(<TwoPanels onLayoutChange={onLayoutChange} onLayoutCommit={onLayoutCommit} />);
    onLayoutChange.mockClear();
    await drag(getByTestId("handle"), PANEL_SPACE * 0.2, 0);
    await nextFrames();
    expectWidth("first", 50);
    expect(getByTestId("handle").getAttribute("aria-valuenow")).toBe("50");
    expect(onLayoutChange).toHaveBeenCalled();
    expect(onLayoutCommit).toHaveBeenCalledTimes(1);
    expect(onLayoutCommit.mock.calls[0]![0].first).toBeCloseTo(50, 1);
    expect(onLayoutCommit.mock.calls[0]![1]).toEqual({ source: "pointer" });
  });

  it("marks the handle while dragging and restores the layout on Escape", async () => {
    const onDraggingChange = vi.fn();
    await renderStrict(
      <Splitter.Root data-testid="group" style={{ width: GROUP_WIDTH, height: 300 }}>
        <Splitter.Panel id="first" defaultSize={30} />
        <Splitter.Handle data-testid="handle" onDraggingChange={onDraggingChange} style={{ width: HANDLE_SIZE }} />
        <Splitter.Panel id="second" />
      </Splitter.Root>,
    );
    const handle = getByTestId("handle");
    await drag(handle, PANEL_SPACE * 0.2, 0, { release: false });
    await nextFrames();
    expect(handle.dataset.dragging).toBe("");
    expect(getByTestId("group").dataset.resizing).toBe("");
    expect(onDraggingChange).toHaveBeenLastCalledWith(true);
    expectWidth("first", 50);
    await userEvent.keyboard("{Escape}");
    await nextFrames();
    expectWidth("first", 30);
    expect(handle.dataset.dragging).toBeUndefined();
    expect(onDraggingChange).toHaveBeenLastCalledWith(false);
    await releasePointer();
    await nextFrames();
    expectWidth("first", 30);
  });

  it("keeps the layout reached so far when the window loses focus mid-drag", async () => {
    const onLayoutCommit = vi.fn();
    await renderStrict(<TwoPanels onLayoutCommit={onLayoutCommit} />);
    await drag(getByTestId("handle"), PANEL_SPACE * 0.1, 0, { release: false });
    await nextFrames();
    window.dispatchEvent(new Event("blur"));
    await nextFrames();
    await releasePointer();
    expectWidth("first", 40);
    expect(onLayoutCommit).toHaveBeenCalledTimes(1);
  });

  it("flags the limit a drag is pressing against", async () => {
    await renderStrict(<TwoPanels first={{ maxSize: 40 }} />);
    const handle = getByTestId("handle");
    await drag(handle, PANEL_SPACE * 0.3, 0, { release: false });
    await nextFrames();
    expect(handle.dataset.limit).toBe("end");
    expectWidth("first", 40);
    await releasePointer();
    await nextFrames();
    expect(handle.dataset.limit).toBeUndefined();
  });

  it("collapses a collapsible panel once the pointer passes half way below its minimum", async () => {
    await renderStrict(<TwoPanels second={{ minSize: 20, collapsible: true }} first={{ defaultSize: 70 }} />);
    const handle = getByTestId("handle");
    await drag(handle, PANEL_SPACE * 0.15, 0, { release: false });
    await nextFrames();
    expectWidth("second", 20);
    // The handle stopped 10% along while the pointer went 15%; collapsing needs the pointer
    // 10% past the minimum, half the distance to the collapsed size.
    const position = handle.getBoundingClientRect();
    await movePointer(position.left + position.width / 2 + PANEL_SPACE * 0.105, position.top + 10);
    await nextFrames();
    expectWidth("second", 0);
    expect(getById("second").dataset.state).toBe("collapsed");
    await releasePointer();
  });

  it("previews a deferred resize on the handle and applies it on release", async () => {
    await renderStrict(<TwoPanels resizeMode="deferred" />);
    const handle = getByTestId("handle");
    await drag(handle, 100, 0, { release: false });
    await nextFrames();
    expectWidth("first", 30);
    expect(handle.style.transform).toBe("translateX(100px)");
    await releasePointer();
    await nextFrames();
    expect(widthOf(getById("first"))).toBeCloseTo(PANEL_SPACE * 0.3 + 100, 0);
    expect(handle.style.transform).toBe("");
  });

  it("resets the panels beside a handle to their default sizes on double click", async () => {
    await renderStrict(<TwoPanels />);
    const handle = getByTestId("handle");
    handle.focus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    expectWidth("first", 40);
    await userEvent.dblClick(handle);
    expectWidth("first", 30);
  });

  it("keeps disabled panels at their size", async () => {
    await renderStrict(
      <Splitter.Root style={{ width: 1020, height: 300 }}>
        <Splitter.Panel id="a" defaultSize={30} />
        <Splitter.Handle style={{ width: HANDLE_SIZE }} />
        <Splitter.Panel id="b" defaultSize={30} disabled />
        <Splitter.Handle data-testid="handle" style={{ width: HANDLE_SIZE }} />
        <Splitter.Panel id="c" />
      </Splitter.Root>,
    );
    getByTestId("handle").focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(widthOf(getById("a"))).toBeCloseTo(350, 0);
    expect(widthOf(getById("b"))).toBeCloseTo(300, 0);
    expect(widthOf(getById("c"))).toBeCloseTo(350, 0);
    expect(getById("b").dataset.disabled).toBe("");
  });

  it("keeps fixed panels at their pixel size when the group resizes", async () => {
    const view = await renderStrict(<TwoPanels first={{ defaultSize: "200px", resizeBehavior: "fixed" }} />);
    expect(widthOf(getById("first"))).toBeCloseTo(200, 0);
    await view.rerender(<TwoPanels first={{ defaultSize: "200px", resizeBehavior: "fixed" }} width={610} />);
    await nextFrames(3);
    expect(widthOf(getById("first"))).toBeCloseTo(200, 0);
    expect(widthOf(getById("second"))).toBeCloseTo(400, 0);
  });

  it("restores sizes a narrow group squeezed once it grows back", async () => {
    const view = await renderStrict(<TwoPanels first={{ defaultSize: 20 }} second={{ minSize: "600px" }} />);
    expectWidth("first", 20);
    await view.rerender(<TwoPanels first={{ defaultSize: 20 }} second={{ minSize: "600px" }} width={710} />);
    await nextFrames(3);
    expect(widthOf(getById("first"))).toBeCloseTo(100, 0);
    await view.rerender(<TwoPanels first={{ defaultSize: 20 }} second={{ minSize: "600px" }} />);
    await nextFrames(3);
    expectWidth("first", 20);
  });

  it("keeps panels within absolute minimum sizes", async () => {
    await renderStrict(<TwoPanels first={{ minSize: "200px" }} />);
    await drag(getByTestId("handle"), -250, 0);
    await nextFrames();
    expect(widthOf(getById("first"))).toBeCloseTo(200, 0);
  });

  it("converts absolute default sizes before the first paint", async () => {
    await renderStrict(<TwoPanels first={{ defaultSize: "250px" }} />);
    expect(widthOf(getById("first"))).toBeCloseTo(250, 0);
    expect(widthOf(getById("second"))).toBeCloseTo(PANEL_SPACE - 250, 0);
  });

  it("follows a controlled layout", async () => {
    function Controlled(): React.ReactNode {
      const [layout, setLayout] = React.useState<SplitterLayout>({ first: 25, second: 75 });
      return (
        <>
          <output data-testid="output">{JSON.stringify(layout)}</output>
          <TwoPanels layout={layout} onLayoutChange={setLayout} />
        </>
      );
    }
    await renderStrict(<Controlled />);
    expectWidth("first", 25);
    getByTestId("handle").focus();
    await userEvent.keyboard("{ArrowRight}");
    expectWidth("first", 30);
    expect(getByTestId("output").textContent).toBe(JSON.stringify({ first: 30, second: 70 }));
  });

  it("ignores changes a controlling parent rejects", async () => {
    const onLayoutChange = vi.fn();
    await renderStrict(<TwoPanels layout={{ first: 25, second: 75 }} onLayoutChange={onLayoutChange} />);
    getByTestId("handle").focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onLayoutChange).toHaveBeenLastCalledWith({ first: 30, second: 70 });
    expectWidth("first", 25);
    await userEvent.keyboard("{ArrowRight}");
    expect(onLayoutChange).toHaveBeenLastCalledWith({ first: 30, second: 70 });
  });

  it("persists the layout with the sizes collapsed panels return to", async () => {
    const view = await renderStrict(<TwoPanels storageKey="layout" first={{ minSize: 10, collapsible: true }} />);
    const handle = getByTestId("handle");
    handle.focus();
    await userEvent.keyboard("{ArrowRight}{Enter}");
    const stored = JSON.parse(localStorage.getItem("layout")!);
    expect(stored.version).toBe(1);
    expect(stored.layouts["[\"first\",\"second\"]"]).toEqual({
      layout: { first: 0, second: 100 },
      panelSpace: PANEL_SPACE,
      expandSizes: { first: 35, second: 100 },
    });
    await view.unmount();
    await renderStrict(<TwoPanels storageKey="layout" first={{ minSize: 10, collapsible: true }} />);
    expectWidth("first", 0);
    getByTestId("handle").focus();
    await userEvent.keyboard("{Enter}");
    expectWidth("first", 35);
  });

  it("rejects stored values that are not layouts", async () => {
    localStorage.setItem("layout", JSON.stringify({ "[\"first\",\"second\"]": { first: "wide" } }));
    const error = await renderError(<TwoPanels storageKey="layout" />);
    expect(error.message).toContain("is not a splitter layout");
  });

  it("toggles a panel with a trigger", async () => {
    await renderStrict(
      <Splitter.Root style={{ width: GROUP_WIDTH, height: 300 }}>
        <Splitter.Panel id="sidebar" defaultSize={25} minSize={15} collapsible collapsedSize="40px">
          <Splitter.Trigger panelId="sidebar" data-testid="trigger">Toggle</Splitter.Trigger>
        </Splitter.Panel>
        <Splitter.Handle style={{ width: HANDLE_SIZE }} />
        <Splitter.Panel id="content" />
      </Splitter.Root>,
    );
    const trigger = getByTestId("trigger");
    expect(trigger.getAttribute("aria-controls")).toBe("sidebar");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    await userEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(widthOf(getById("sidebar"))).toBeCloseTo(40, 0);
    expect(getById("sidebar").inert).toBe(false);
    await userEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expectWidth("sidebar", 25);
  });

  it("exposes actions through actionsRef", async () => {
    const actionsRef = React.createRef<SplitterActions>();
    const onLayoutCommit = vi.fn();
    await renderStrict(<TwoPanels actionsRef={actionsRef} onLayoutCommit={onLayoutCommit} first={{ collapsible: true, minSize: 10 }} />);
    const actions = actionsRef.current!;
    expect(actions.getLayout()).toEqual({ first: 30, second: 70 });
    expect(actions.getPanelSize("first")).toEqual({ percentage: 30, pixels: PANEL_SPACE * 0.3 });
    actions.resize("first", "200px");
    await nextFrames();
    expect(widthOf(getById("first"))).toBeCloseTo(200, 0);
    expect(onLayoutCommit).toHaveBeenLastCalledWith(expect.anything(), { source: "imperative" });
    actions.collapse("first");
    await nextFrames();
    expect(actions.isCollapsed("first")).toBe(true);
    actions.expand("first");
    await nextFrames();
    expect(widthOf(getById("first"))).toBeCloseTo(200, 0);
    actions.setLayout({ first: 60, second: 40 });
    await nextFrames();
    expectWidth("first", 60);
    actions.reset();
    await nextFrames();
    expectWidth("first", 30);
    expect(() => actions.setLayout({ first: 60, second: 30 })).toThrow("must add up to 100");
    expect(() => actions.setLayout({ first: 50, other: 50 })).toThrow("need a size for exactly these panels");
    expect(() => actions.resize("missing", 10)).toThrow("has no panel with the id \"missing\"");
    expect(() => actions.collapse("second")).toThrow("is not collapsible");
  });

  it("lets actions move disabled panels", async () => {
    const actionsRef = React.createRef<SplitterActions>();
    await renderStrict(<TwoPanels actionsRef={actionsRef} first={{ disabled: true }} />);
    actionsRef.current!.resize("first", 45);
    await nextFrames();
    expectWidth("first", 45);
  });

  it("gives a panel that appears its default size from the panel before it", async () => {
    function Conditional({ showThird }: { showThird: boolean }): React.ReactNode {
      return (
        <Splitter.Root style={{ width: 1020, height: 300 }}>
          <Splitter.Panel id="a" defaultSize={50} />
          <Splitter.Handle style={{ width: HANDLE_SIZE }} />
          <Splitter.Panel id="b" />
          {showThird && <Splitter.Handle style={{ width: HANDLE_SIZE }} />}
          {showThird && <Splitter.Panel id="c" defaultSize={20} />}
        </Splitter.Root>
      );
    }
    const view = await renderStrict(<Conditional showThird={false} />);
    expect(widthOf(getById("a"))).toBeCloseTo(505, 0);
    await view.rerender(<Conditional showThird />);
    await nextFrames();
    expect(widthOf(getById("a"))).toBeCloseTo(500, 0);
    expect(widthOf(getById("b"))).toBeCloseTo(300, 0);
    expect(widthOf(getById("c"))).toBeCloseTo(200, 0);
    await view.rerender(<Conditional showThird={false} />);
    await nextFrames();
    expect(widthOf(getById("a"))).toBeCloseTo(505, 0);
  });

  it("resizes both groups when dragging where two handles cross", async () => {
    await renderStrict(
      <Splitter.Root style={{ width: GROUP_WIDTH, height: 610 }}>
        <Splitter.Panel id="left" defaultSize={50} />
        <Splitter.Handle data-testid="outer" style={{ width: HANDLE_SIZE }} />
        <Splitter.Panel id="right">
          <Splitter.Root orientation="vertical" style={{ height: "100%" }}>
            <Splitter.Panel id="top" defaultSize={50} />
            <Splitter.Handle data-testid="inner" style={{ height: HANDLE_SIZE }} />
            <Splitter.Panel id="bottom" />
          </Splitter.Root>
        </Splitter.Panel>
      </Splitter.Root>,
    );
    const outer = getByTestId("outer").getBoundingClientRect();
    const inner = getByTestId("inner").getBoundingClientRect();
    const crossingY = inner.top + inner.height / 2;
    await drag(getByTestId("outer"), 100, 60, { from: { x: 0.5, y: (crossingY - outer.top) / outer.height } });
    await nextFrames();
    expect(widthOf(getById("left"))).toBeCloseTo(PANEL_SPACE / 2 + 100, 0);
    expect(heightOf(getById("top"))).toBeCloseTo(300 + 60, 0);
  });

  it("does not resize while disabled", async () => {
    await renderStrict(<TwoPanels disabled />);
    const handle = getByTestId("handle");
    expect(handle.hasAttribute("tabindex")).toBe(false);
    expect(handle.getAttribute("aria-disabled")).toBe("true");
    handle.focus();
    await userEvent.keyboard("{ArrowRight}");
    await drag(handle, 100, 0);
    await nextFrames();
    expectWidth("first", 30);
  });

  it("gives panel content access to its panel", async () => {
    function PanelInfo(): React.ReactNode {
      const panel = Splitter.useSplitterPanel();
      return (
        <button type="button" data-testid="info" onClick={panel.collapse}>
          {`${panel.id} ${panel.size} ${panel.collapsed}`}
        </button>
      );
    }
    await renderStrict(
      <Splitter.Root style={{ width: GROUP_WIDTH, height: 300 }}>
        <Splitter.Panel id="first" defaultSize={30} minSize={10} collapsible collapsedSize={2}>
          <PanelInfo />
        </Splitter.Panel>
        <Splitter.Handle style={{ width: HANDLE_SIZE }} />
        <Splitter.Panel id="second" />
      </Splitter.Root>,
    );
    expect(getByTestId("info").textContent).toBe("first 30 false");
    getByTestId("info").click();
    await nextFrames();
    expect(getByTestId("info").textContent).toBe("first 2 true");
  });

  it("rejects duplicate panel ids, misplaced handles and wrapped panels", async () => {
    const duplicate = await renderError(
      <Splitter.Root>
        <Splitter.Panel id="same" />
        <Splitter.Handle />
        <Splitter.Panel id="same" />
      </Splitter.Root>,
    );
    expect(duplicate.message).toContain("already has a panel with the id \"same\"");
    const misplaced = await renderError(
      <Splitter.Root>
        <Splitter.Handle />
        <Splitter.Panel id="only" />
      </Splitter.Root>,
    );
    expect(misplaced.message).toContain("must be placed between two panels");
    const wrapped = await renderError(
      <Splitter.Root>
        <div>
          <Splitter.Panel id="wrapped" />
        </div>
      </Splitter.Root>,
    );
    expect(wrapped.message).toContain("must be a direct child");
  });

  it("requires at least one proportional panel", async () => {
    const error = await renderError(<TwoPanels first={{ resizeBehavior: "fixed" }} second={{ resizeBehavior: "fixed" }} />);
    expect(error.message).toContain("needs at least one panel with resizeBehavior \"proportional\"");
  });

  it("requires panels to be rendered inside a splitter", async () => {
    const error = await renderError(<Splitter.Panel />);
    expect(error.message).toBe("`Splitter.Panel` must be used within `Splitter`");
  });
});
