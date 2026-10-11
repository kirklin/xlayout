import type { GridDrop, GridItemLayout, GridLayoutChange, GridLayouts, GridProps } from "./index";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { drag, nextFrames, releasePointer } from "../../test/pointer";
import { getByTestId, renderError, renderStrict } from "../../test/render";
import * as Grid from "./index";

const LAYOUT: GridItemLayout[] = [
  { value: "a", x: 0, y: 0, w: 1, h: 1 },
  { value: "b", x: 1, y: 0, w: 1, h: 1 },
  { value: "c", x: 2, y: 0, w: 1, h: 1 },
];

interface BoardProps extends Partial<GridProps> {
  values?: string[];
  width?: number;
  extra?: React.ReactNode;
}

/** Four columns of 100px with 10px gaps, rows of 50px. */
function Board({ values = ["a", "b", "c"], width = 430, extra, style, ...gridProps }: BoardProps): React.ReactNode {
  return (
    <Grid.Root data-testid="grid" columns={4} rowHeight={50} gap={10} defaultLayouts={{ base: LAYOUT }} style={{ width, ...style }} {...gridProps}>
      {values.map(value => (
        <Grid.Item key={value} value={value} label={`Card ${value}`} data-testid={value} style={{ position: "relative" }}>
          <Grid.DragHandle data-testid={`${value}-move`} aria-label={`Move card ${value}`} style={{ display: "block", width: 20, height: 20, padding: 0 }} />
          <Grid.ResizeHandle
            data-testid={`${value}-resize`}
            aria-label={`Resize card ${value}`}
            style={{ position: "absolute", insetInlineEnd: 0, bottom: 0, width: 12, height: 12, padding: 0 }}
          />
          {extra}
        </Grid.Item>
      ))}
      <Grid.Placeholder data-testid="placeholder" />
    </Grid.Root>
  );
}

function canvas(): HTMLElement {
  return getByTestId("grid").querySelector<HTMLElement>("[data-xlayout-grid-canvas]")!;
}

function boxOf(testId: string): { x: number; y: number; width: number; height: number } {
  const origin = canvas().getBoundingClientRect();
  const rect = getByTestId(testId).getBoundingClientRect();
  return { x: rect.left - origin.left, y: rect.top - origin.top, width: rect.width, height: rect.height };
}

function cells(layouts: GridLayouts, breakpoint = "base"): string[] {
  return (layouts[breakpoint] ?? []).map(item => `${item.value} ${item.x},${item.y} ${item.w}x${item.h}`);
}

function announcements(): string {
  return document.querySelector("[data-xlayout-live-region=\"polite\"]")?.textContent ?? "";
}

/** Waits for React to render and then for every slide to finish, so boxes are where the layout put them. */
async function settle(): Promise<void> {
  await nextFrames();
  await Promise.allSettled(document.getAnimations().map(animation => animation.finished));
  await nextFrames();
}

describe("grid", () => {
  afterEach(() => {
    document.querySelector("[data-xlayout-live-region]")?.remove();
  });

  it("places items from their layout and sizes rows and gaps", async () => {
    await renderStrict(<Board defaultLayouts={{ base: [{ value: "a", x: 0, y: 0, w: 2, h: 1 }, { value: "b", x: 2, y: 0, w: 2, h: 2 }, { value: "c", x: 0, y: 1, w: 1, h: 1 }] }} />);
    expect(getByTestId("grid").dataset.breakpoint).toBe("base");
    expect(boxOf("a")).toEqual({ x: 0, y: 0, width: 210, height: 50 });
    expect(boxOf("b")).toEqual({ x: 220, y: 0, width: 210, height: 110 });
    expect(boxOf("c")).toEqual({ x: 0, y: 60, width: 100, height: 50 });
    expect(canvas().getBoundingClientRect().height).toBe(110);
  });

  it("uses the layout of the breakpoint its width reaches, deriving the ones not given", async () => {
    const props: BoardProps = {
      breakpoints: { wide: 600, narrow: 0 },
      columns: { wide: 6, narrow: 2 },
      defaultLayouts: { wide: [{ value: "a", x: 0, y: 0, w: 3, h: 1 }, { value: "b", x: 3, y: 0, w: 3, h: 1 }, { value: "c", x: 0, y: 1, w: 6, h: 1 }] },
    };
    const view = await renderStrict(<Board {...props} width={210} />);
    expect(getByTestId("grid").dataset.breakpoint).toBe("narrow");
    expect(boxOf("b")).toEqual({ x: 110, y: 0, width: 100, height: 50 });
    expect(boxOf("c")).toEqual({ x: 0, y: 60, width: 210, height: 50 });
    await view.rerender(<Board {...props} width={650} />);
    await nextFrames();
    expect(getByTestId("grid").dataset.breakpoint).toBe("wide");
    expect(boxOf("b")).toEqual({ x: 330, y: 0, width: 320, height: 50 });
  });

  it("moves an item by dragging its handle and reports the new layout", async () => {
    const onLayoutsChange = vi.fn<(layouts: GridLayouts, change: GridLayoutChange) => void>();
    await renderStrict(<Board onLayoutsChange={onLayoutsChange} />);
    await drag(getByTestId("a-move"), 330, 10, { release: false });
    await nextFrames();
    expect(getByTestId("grid").dataset.state).toBe("dragging");
    expect(getByTestId("a").dataset.state).toBe("dragging");
    expect(boxOf("placeholder")).toMatchObject({ x: 330, y: 0 });
    expect(boxOf("a")).toMatchObject({ x: 330, y: 10 });
    await releasePointer();
    await nextFrames();
    expect(getByTestId("grid").dataset.state).toBe("idle");
    expect(onLayoutsChange).toHaveBeenCalledOnce();
    expect(cells(onLayoutsChange.mock.calls[0]![0])).toEqual(["a 3,0 1x1", "b 1,0 1x1", "c 2,0 1x1"]);
    expect(onLayoutsChange.mock.calls[0]![1]).toEqual({ breakpoint: "base", value: "a", reason: "move" });
    await settle();
    expect(boxOf("a")).toMatchObject({ x: 330, y: 0 });
  });

  it("swaps with an item of the same size once dragged past its middle", async () => {
    const layout = [{ value: "a", x: 0, y: 0, w: 2, h: 1 }, { value: "b", x: 2, y: 0, w: 2, h: 1 }];
    await renderStrict(<Board values={["a", "b"]} defaultLayouts={{ base: layout }} />);
    await drag(getByTestId("a-move"), 110, 0, { release: false });
    await nextFrames();
    expect(boxOf("placeholder")).toMatchObject({ x: 0 });
    await drag(getByTestId("a-move"), 110, 0, { release: false, from: { x: 0.5, y: 0.5 } });
    await nextFrames();
    expect(boxOf("placeholder")).toMatchObject({ x: 220 });
    await releasePointer();
    await settle();
    expect(boxOf("b")).toMatchObject({ x: 0, y: 0 });
    expect(boxOf("a")).toMatchObject({ x: 220, y: 0 });
  });

  it("resizes an item from its corner", async () => {
    const onLayoutsChange = vi.fn<(layouts: GridLayouts, change: GridLayoutChange) => void>();
    await renderStrict(<Board values={["a", "b"]} defaultLayouts={{ base: [{ value: "a", x: 0, y: 0, w: 1, h: 1 }, { value: "b", x: 3, y: 0, w: 1, h: 1 }] }} onLayoutsChange={onLayoutsChange} />);
    await drag(getByTestId("a-resize"), 110, 60, { release: false });
    await nextFrames();
    expect(getByTestId("a").dataset.state).toBe("resizing");
    expect(boxOf("placeholder")).toEqual({ x: 0, y: 0, width: 210, height: 110 });
    await releasePointer();
    await nextFrames();
    expect(cells(onLayoutsChange.mock.calls[0]![0])).toEqual(["a 0,0 2x2", "b 3,0 1x1"]);
    expect(onLayoutsChange.mock.calls[0]![1].reason).toBe("resize");
    expect(boxOf("a")).toEqual({ x: 0, y: 0, width: 210, height: 110 });
  });

  it("puts a dragged item back when Escape is pressed", async () => {
    const onLayoutsChange = vi.fn();
    await renderStrict(<Board onLayoutsChange={onLayoutsChange} />);
    await drag(getByTestId("a-move"), 330, 0, { release: false });
    await userEvent.keyboard("{Escape}");
    await releasePointer();
    await settle();
    expect(onLayoutsChange).not.toHaveBeenCalled();
    expect(boxOf("a")).toMatchObject({ x: 0, y: 0 });
  });

  it("moves and resizes with the keyboard and says what happened", async () => {
    const onLayoutsChange = vi.fn<(layouts: GridLayouts, change: GridLayoutChange) => void>();
    await renderStrict(<Board onLayoutsChange={onLayoutsChange} />);
    getByTestId("a-move").focus();
    await userEvent.keyboard(" ");
    expect(getByTestId("a-move").getAttribute("aria-pressed")).toBe("true");
    expect(announcements()).toContain("Card a picked up.");
    await userEvent.keyboard("{ArrowRight}");
    await settle();
    expect(boxOf("a")).toMatchObject({ x: 110, y: 0 });
    expect(boxOf("b")).toMatchObject({ x: 0, y: 0 });
    expect(announcements()).toContain("Card a moved to column 2, row 1.");
    await userEvent.keyboard("{Enter}");
    expect(getByTestId("a-move").getAttribute("aria-pressed")).toBe("false");
    expect(cells(onLayoutsChange.mock.calls[0]![0])).toEqual(["a 1,0 1x1", "b 0,0 1x1", "c 2,0 1x1"]);
    expect(announcements()).toContain("Card a dropped at column 2, row 1.");

    getByTestId("c-resize").focus();
    await userEvent.keyboard(" ");
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{ArrowRight}");
    expect(boxOf("c")).toMatchObject({ width: 210, height: 110 });
    expect(announcements()).toContain("Card c resized to 2 columns by 2 rows.");
    await userEvent.keyboard("{Escape}");
    expect(boxOf("c")).toMatchObject({ width: 100, height: 50 });
    expect(announcements()).toContain("Card c put back at column 3, row 1.");
    expect(onLayoutsChange).toHaveBeenCalledOnce();
  });

  it("slides items to their new places", async () => {
    await renderStrict(<Board />);
    getByTestId("a-move").focus();
    await userEvent.keyboard(" ");
    await userEvent.keyboard("{ArrowRight}");
    const slides = getByTestId("b").getAnimations().filter(animation => animation.id === "xlayout-grid-slide");
    expect(slides).toHaveLength(1);
    await userEvent.keyboard("{Escape}");
  });

  it("moves and resizes from code, for controls that work without dragging", async () => {
    function Controls(): React.ReactNode {
      const item = Grid.useGridItem();
      return (
        <>
          <button type="button" data-testid={`${item.value}-end`} onClick={() => item.move("end")}>End</button>
          <button type="button" data-testid={`${item.value}-taller`} onClick={() => item.resize("taller")}>Taller</button>
        </>
      );
    }
    await renderStrict(<Board extra={<Controls />} />);
    getByTestId("c-end").click();
    await settle();
    expect(boxOf("c")).toMatchObject({ x: 330, y: 0 });
    getByTestId("a-taller").click();
    await settle();
    expect(boxOf("a")).toMatchObject({ height: 110 });
  });

  it("keeps static items in place", async () => {
    const layout = [{ value: "a", x: 0, y: 0, w: 1, h: 1 }, { value: "b", x: 1, y: 0, w: 1, h: 1, static: true }];
    await renderStrict(<Board values={["a", "b"]} defaultLayouts={{ base: layout }} />);
    expect(getByTestId("b").dataset.static).toBe("");
    await drag(getByTestId("a-move"), 110, 0, { release: false });
    await nextFrames();
    expect(boxOf("placeholder")).toMatchObject({ x: 0 });
    await releasePointer();
    getByTestId("b-move").focus();
    await userEvent.keyboard(" ");
    expect(getByTestId("b-move").getAttribute("aria-pressed")).toBe("false");
  });

  it("places items from the inline start in right-to-left layouts", async () => {
    await renderStrict(<Board dir="rtl" />);
    expect(boxOf("a")).toMatchObject({ x: 330, y: 0 });
    await drag(getByTestId("a-move"), -330, 0);
    await settle();
    expect(boxOf("a")).toMatchObject({ x: 0, y: 0 });
  });

  it("takes items dragged in from outside", async () => {
    const drops: GridDrop[] = [];
    const onDropItem = (drop: GridDrop): void => {
      drops.push(drop);
    };
    await renderStrict(<Board onDropItem={onDropItem} />);
    const rect = canvas().getBoundingClientRect();
    const dragEvent = (type: string): DragEvent => new DragEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + 50,
      clientY: rect.top + 25,
      dataTransfer: new DataTransfer(),
    });
    const over = dragEvent("dragover");
    canvas().dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
    await nextFrames();
    expect(getByTestId("grid").dataset.state).toBe("dropping");
    expect(boxOf("placeholder")).toMatchObject({ x: 0, y: 0 });
    canvas().dispatchEvent(dragEvent("drop"));
    await nextFrames();
    expect(drops).toEqual([{
      breakpoint: "base",
      cell: { x: 0, y: 0, w: 1, h: 1 },
      layout: [{ value: "a", x: 0, y: 1, w: 1, h: 1 }, { value: "b", x: 1, y: 0, w: 1, h: 1 }, { value: "c", x: 2, y: 0, w: 1, h: 1 }],
    }]);
    expect(getByTestId("grid").dataset.state).toBe("idle");
  });

  it("scrolls its scroll container while a drag holds near the edge", async () => {
    const tall = Array.from({ length: 12 }, (_, index) => ({ value: `t${index}`, x: 0, y: index, w: 1, h: 1 }));
    await renderStrict(
      <div data-testid="scroller" style={{ height: 300, overflow: "auto" }}>
        <Board values={tall.map(item => item.value)} defaultLayouts={{ base: tall }} />
      </div>,
    );
    const scroller = getByTestId("scroller");
    const handle = getByTestId("t0-move");
    const handleRect = handle.getBoundingClientRect();
    const bottom = scroller.getBoundingClientRect().bottom;
    await drag(handle, 0, bottom - 10 - handleRect.top, { release: false, steps: 4 });
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(scroller.scrollTop).toBeGreaterThan(0);
    await releasePointer();
  });

  it("rejects duplicate items and layouts for breakpoints it does not have", async () => {
    const duplicate = await renderError(<Board values={["a", "a"]} />);
    expect(duplicate.message).toContain("already has an item with the value \"a\"");
    const unknown = await renderError(<Board defaultLayouts={{ wide: LAYOUT }} />);
    expect(unknown.message).toContain("layout for \"wide\", which is not one of its breakpoints");
  });
});
