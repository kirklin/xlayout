import type { GridDrop, GridItemLayout, GridLayoutChange, GridLayouts, GridProps } from "./index";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { commands, userEvent } from "vitest/browser";
import { drag, movePointer, nextFrames, releasePointer, settle } from "../../test/pointer";
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

interface ManyItemsProps {
  count: number;
  /** Called for every item that renders, by value. */
  onItemRender: (value: string) => void;
}

/** Items in four columns of 100px, each in a profiler that reports when it renders. */
function ManyItems({ count, onItemRender }: ManyItemsProps): React.ReactNode {
  const values = Array.from({ length: count }, (_, index) => `i${index}`);
  const layout = values.map((value, index) => ({ value, x: index % 4, y: Math.floor(index / 4), w: 1, h: 1 }));
  return (
    <Grid.Root data-testid="grid" columns={4} rowHeight={20} gap={10} defaultLayouts={{ base: layout }} style={{ width: 430 }}>
      {values.map(value => (
        <React.Profiler key={value} id={value} onRender={onItemRender}>
          <Grid.Item value={value} data-testid={value}>
            <Grid.DragHandle data-testid={`${value}-move`} aria-label={`Move ${value}`} style={{ display: "block", width: 20, height: 20, padding: 0 }} />
          </Grid.Item>
        </React.Profiler>
      ))}
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

describe("grid", () => {
  afterEach(() => {
    document.querySelector("[data-xlayout-live-region]")?.remove();
  });

  it("renders again only the items a drag changes", async () => {
    const rendered = new Set<string>();
    await renderStrict(<ManyItems count={400} onItemRender={value => rendered.add(value)} />);
    await settle();
    const handle = getByTestId("i0-move").getBoundingClientRect();
    rendered.clear();
    await drag(getByTestId("i0-move"), 30, 0, { release: false });
    await nextFrames();
    expect([...rendered]).toEqual(["i0"]);
    rendered.clear();
    // Past the middle of the next item the two trade places, and the others stay.
    await movePointer(handle.left + 10 + 110, handle.top + 10);
    await nextFrames();
    expect([...rendered].sort()).toEqual(["i0", "i1"]);
    await releasePointer();
    await settle();
    expect(boxOf("i1")).toMatchObject({ x: 0, y: 0 });
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
    await renderStrict(<Board onDropItem={onDropItem} style={{ minHeight: 200 }} />);
    const rect = canvas().getBoundingClientRect();
    const dragEvent = (type: string, below = 0): DragEvent => new DragEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + 50,
      clientY: rect.top + 25 + below,
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

    // Below its only row, on its own box, the grid takes the item too and puts it under the others.
    const below = dragEvent("dragover", 120);
    getByTestId("grid").dispatchEvent(below);
    expect(below.defaultPrevented).toBe(true);
    await nextFrames();
    expect(boxOf("placeholder")).toMatchObject({ x: 0, y: 60 });
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

  describe("resizing from any edge", () => {
    function EdgeBoard(props: Partial<GridProps> & { edge: Grid.GridEdge }): React.ReactNode {
      const { edge, ...gridProps } = props;
      return (
        <Grid.Root data-testid="grid" columns={4} rowHeight={50} gap={10} style={{ width: 430 }} {...gridProps}>
          {["a", "b"].map(value => (
            <Grid.Item key={value} value={value} label={`Card ${value}`} data-testid={value} style={{ position: "relative" }}>
              <Grid.ResizeHandle data-testid={`${value}-resize`} edge={edge} aria-label={`Resize card ${value}`} style={{ position: "absolute", inset: 0, margin: "auto", width: 12, height: 12, padding: 0 }} />
            </Grid.Item>
          ))}
          <Grid.Placeholder data-testid="placeholder" />
        </Grid.Root>
      );
    }

    it("grows toward the start, keeping the end, and pushes what is in the way", async () => {
      const onLayoutsChange = vi.fn<(layouts: GridLayouts, change: GridLayoutChange) => void>();
      const layout = [{ value: "a", x: 0, y: 0, w: 1, h: 1 }, { value: "b", x: 2, y: 0, w: 1, h: 1 }];
      await renderStrict(<EdgeBoard edge="start" defaultLayouts={{ base: layout }} onLayoutsChange={onLayoutsChange} />);
      expect(getByTestId("b-resize").dataset.edge).toBe("start");
      await drag(getByTestId("b-resize"), -220, 0, { release: false });
      await nextFrames();
      expect(getComputedStyle(document.body).cursor).toBe("ew-resize");
      expect(boxOf("placeholder")).toMatchObject({ x: 0, y: 0, width: 320 });
      // The item is drawn from where the pointer has its start edge to its own end.
      expect(boxOf("b")).toMatchObject({ x: 0, width: 320 });
      await releasePointer();
      expect(cells(onLayoutsChange.mock.lastCall![0])).toEqual(["a 0,1 1x1", "b 0,0 3x1"]);
      expect(onLayoutsChange.mock.lastCall![1]).toEqual({ breakpoint: "base", value: "b", reason: "resize" });
    });

    it("grows up from the top and from a corner, within the grid", async () => {
      const onLayoutsChange = vi.fn<(layouts: GridLayouts, change: GridLayoutChange) => void>();
      const layout = [{ value: "a", x: 0, y: 0, w: 1, h: 1, static: true }, { value: "b", x: 2, y: 2, w: 1, h: 1 }];
      const view = await renderStrict(<EdgeBoard edge="top" compact="none" defaultLayouts={{ base: layout }} onLayoutsChange={onLayoutsChange} />);
      await drag(getByTestId("b-resize"), 0, -110);
      expect(cells(onLayoutsChange.mock.lastCall![0])).toEqual(["a 0,0 1x1", "b 2,0 1x3"]);
      await view.rerender(<EdgeBoard key="corner" edge="top-start" compact="none" defaultLayouts={{ base: layout }} onLayoutsChange={onLayoutsChange} />);
      await drag(getByTestId("b-resize"), -110, -60);
      expect(cells(onLayoutsChange.mock.lastCall![0])).toEqual(["a 0,0 1x1", "b 1,1 2x2"]);
    });

    it("moves its own sides with the arrow keys and leaves the other axis alone", async () => {
      const onLayoutsChange = vi.fn<(layouts: GridLayouts, change: GridLayoutChange) => void>();
      const layout = [{ value: "a", x: 0, y: 1, w: 1, h: 1 }, { value: "b", x: 2, y: 1, w: 1, h: 1 }];
      await renderStrict(<EdgeBoard edge="start" compact="none" defaultLayouts={{ base: layout }} onLayoutsChange={onLayoutsChange} />);
      getByTestId("b-resize").focus();
      await userEvent.keyboard(" ");
      await userEvent.keyboard("{ArrowLeft}");
      expect(announcements()).toContain("Card b resized to 2 columns by 1 rows.");
      await userEvent.keyboard("{ArrowUp}");
      expect(announcements()).toContain("Card b cannot go further that way.");
      await userEvent.keyboard("{Enter}");
      expect(cells(onLayoutsChange.mock.lastCall![0])).toEqual(["a 0,1 1x1", "b 1,1 2x1"]);
    });
  });

  describe("removing", () => {
    it("takes an item dragged out of a removable grid out of every layout", async () => {
      const onLayoutsChange = vi.fn<(layouts: GridLayouts, change: GridLayoutChange) => void>();
      const layouts = {
        wide: [{ value: "a", x: 0, y: 0, w: 1, h: 1 }, { value: "b", x: 0, y: 1, w: 1, h: 1 }, { value: "c", x: 2, y: 0, w: 1, h: 1 }],
        base: [{ value: "a", x: 0, y: 0, w: 1, h: 1 }, { value: "b", x: 0, y: 1, w: 1, h: 1 }, { value: "c", x: 0, y: 2, w: 1, h: 1 }],
      };
      await renderStrict(<Board removable breakpoints={{ wide: 400, base: 0 }} defaultLayouts={layouts} onLayoutsChange={onLayoutsChange} />);
      expect(getByTestId("grid").dataset.breakpoint).toBe("wide");
      await drag(getByTestId("a-move"), 0, 300, { release: false });
      await settle();
      expect(getByTestId("grid").dataset.state).toBe("removing");
      expect(getByTestId("a").dataset.leaving).toBe("");
      expect(document.querySelector("[data-testid=placeholder]")).toBeNull();
      // The others close the gap the item leaves while it is away.
      expect(boxOf("b")).toMatchObject({ x: 0, y: 0 });
      await releasePointer();
      expect(onLayoutsChange).toHaveBeenCalledOnce();
      const [next, change] = onLayoutsChange.mock.lastCall!;
      expect(change).toEqual({ breakpoint: "wide", value: "a", reason: "remove" });
      expect(cells(next, "wide")).toEqual(["b 0,0 1x1", "c 2,0 1x1"]);
      expect(cells(next, "base")).toEqual(["b 0,1 1x1", "c 0,2 1x1"]);
    });

    it("keeps items dragged out of a grid that is not removable", async () => {
      const onLayoutsChange = vi.fn<(layouts: GridLayouts, change: GridLayoutChange) => void>();
      await renderStrict(<Board onLayoutsChange={onLayoutsChange} />);
      await drag(getByTestId("a-move"), 0, 200, { release: false });
      await nextFrames();
      expect(getByTestId("grid").dataset.state).toBe("dragging");
      expect(getByTestId("a").dataset.leaving).toBeUndefined();
      await releasePointer();
      expect(onLayoutsChange.mock.lastCall?.[1].reason).not.toBe("remove");
    });

    it("removes the item picked up with Delete, and from code", async () => {
      const onLayoutsChange = vi.fn<(layouts: GridLayouts, change: GridLayoutChange) => void>();
      function Remover(): React.ReactNode {
        const item = Grid.useGridItem();
        return <button type="button" data-testid={`${item.value}-remove`} onClick={() => item.remove()}>Remove</button>;
      }
      await renderStrict(<Board removable extra={<Remover />} onLayoutsChange={onLayoutsChange} />);
      getByTestId("b-move").focus();
      await userEvent.keyboard(" ");
      expect(announcements()).toContain("Delete removes it");
      await userEvent.keyboard("{Delete}");
      expect(onLayoutsChange.mock.lastCall![1]).toEqual({ breakpoint: "base", value: "b", reason: "remove" });
      expect(announcements()).toContain("Card b removed.");
      getByTestId("c-remove").click();
      expect(onLayoutsChange.mock.lastCall![1]).toEqual({ breakpoint: "base", value: "c", reason: "remove" });
    });
  });

  describe("moving between grids of a group", () => {
    type Board = "left" | "right";
    interface BoardsProps {
      onChange?: (board: Board, change: GridLayoutChange) => void;
      removable?: boolean;
      /** The style of each board, whose box may reach below its rows. */
      style?: React.CSSProperties;
    }
    function Boards({ onChange, removable, style }: BoardsProps): React.ReactNode {
      const [cards, setCards] = React.useState<Record<Board, string[]>>({ left: ["a", "b"], right: ["c"] });
      const [layouts, setLayouts] = React.useState<Record<Board, GridLayouts>>({
        left: { base: [{ value: "a", x: 0, y: 0, w: 1, h: 1 }, { value: "b", x: 1, y: 0, w: 2, h: 1 }] },
        right: { base: [{ value: "c", x: 0, y: 0, w: 1, h: 1 }] },
      });
      return (
        <div style={{ display: "flex", gap: 40, alignItems: "start" }}>
          {(["left", "right"] as const).map(board => (
            <Grid.Root
              key={board}
              data-testid={board}
              aria-label={`the ${board} board`}
              group="boards"
              removable={removable}
              columns={4}
              rowHeight={50}
              gap={10}
              style={{ width: 430, ...style }}
              layouts={layouts[board]}
              onLayoutsChange={(next, change) => {
                setLayouts(current => ({ ...current, [board]: next }));
                if (change.reason === "remove") {
                  setCards(current => ({ ...current, [board]: current[board].filter(value => value !== change.value) }));
                } else if (change.reason === "add") {
                  setCards(current => ({ ...current, [board]: [...current[board], change.value] }));
                }
                onChange?.(board, change);
              }}
            >
              {cards[board].map(value => (
                <Grid.Item key={value} value={value} label={`Card ${value}`} data-testid={value}>
                  <Grid.DragHandle data-testid={`${value}-move`} aria-label={`Move card ${value}`} style={{ display: "block", width: 20, height: 20, padding: 0 }} />
                </Grid.Item>
              ))}
              <Grid.Placeholder data-testid={`${board}-placeholder`} />
            </Grid.Root>
          ))}
        </div>
      );
    }

    const canvasOf = (board: string): DOMRect => getByTestId(board).querySelector("[data-xlayout-grid-canvas]")!.getBoundingClientRect();
    const boardOf = (value: string): string | undefined => getByTestId(value).closest<HTMLElement>("[data-xlayout-grid]")?.dataset.testid;

    it("hands an item dragged over another grid to it, which shows where it lands", async () => {
      const onChange = vi.fn<(board: Board, change: GridLayoutChange) => void>();
      await renderStrict(<Boards onChange={onChange} />);
      const handle = getByTestId("b-move").getBoundingClientRect();
      const right = canvasOf("right");
      // The handle sits at the item's top left corner, so the item's corner goes to column 2 of the right board.
      await drag(getByTestId("b-move"), right.left + 220 + 10 - (handle.left + 10), right.top + 10 - (handle.top + 10), { release: false, steps: 12 });
      await nextFrames();
      expect(getByTestId("left").dataset.state).toBe("dragging");
      expect(getByTestId("b").dataset.leaving).toBe("");
      expect(getByTestId("right").dataset.state).toBe("dropping");
      const placeholder = getByTestId("right-placeholder").getBoundingClientRect();
      expect(placeholder.left - right.left).toBeCloseTo(220, 0);
      expect(placeholder.width).toBeCloseTo(210, 0);
      await releasePointer();
      await nextFrames();
      expect(onChange.mock.calls.map(([board, change]) => `${board} ${change.reason} ${change.value}`)).toEqual(["right add b", "left remove b"]);
      expect(boardOf("b")).toBe("right");
      expect(getByTestId("b").getBoundingClientRect().left - right.left).toBeCloseTo(220, 0);
      expect(getByTestId("right").dataset.state).toBe("idle");
    });

    it("takes items dropped anywhere on its box, below its rows too", async () => {
      const onChange = vi.fn<(board: Board, change: GridLayoutChange) => void>();
      await renderStrict(<Boards onChange={onChange} removable style={{ minHeight: 300, padding: 10 }} />);
      const changes = (): string[] => onChange.mock.calls.map(([board, change]) => `${board} ${change.reason} ${change.value}`);
      // Below the only row of the left board, yet on it: the item stays in it.
      const left = getByTestId("left").getBoundingClientRect();
      const b = getByTestId("b-move").getBoundingClientRect();
      await drag(getByTestId("b-move"), 0, left.bottom - 30 - (b.top + 10), { release: false, steps: 6 });
      await nextFrames();
      expect(getByTestId("left").dataset.state).toBe("dragging");
      await releasePointer();
      await settle();
      expect(boardOf("b")).toBe("left");
      expect(changes()).toEqual([]);

      // Below the only row of the right board, the item goes over to it.
      const right = getByTestId("right").getBoundingClientRect();
      const a = getByTestId("a-move").getBoundingClientRect();
      await drag(getByTestId("a-move"), right.left + 40 - (a.left + 10), right.bottom - 30 - (a.top + 10), { release: false, steps: 12 });
      await nextFrames();
      expect(getByTestId("left").dataset.state).toBe("dragging");
      expect(getByTestId("right").dataset.state).toBe("dropping");
      await releasePointer();
      await settle();
      expect(boardOf("a")).toBe("right");
      expect(changes()).toEqual(["right add a", "left remove a"]);
    });

    it("lets go of the other grid when the drag turns back", async () => {
      const onChange = vi.fn<(board: Board, change: GridLayoutChange) => void>();
      await renderStrict(<Boards onChange={onChange} />);
      const handle = getByTestId("a-move").getBoundingClientRect();
      const right = canvasOf("right");
      await drag(getByTestId("a-move"), right.left + 120 - handle.left, 10, { release: false, steps: 10 });
      await nextFrames();
      expect(getByTestId("right").dataset.state).toBe("dropping");
      await drag(getByTestId("a-move"), 0, 0, { release: false, steps: 1 });
      const left = canvasOf("left");
      await commands.pointer([{ type: "move", x: left.left + 340, y: left.top + 10, steps: 10 }]);
      await nextFrames();
      expect(getByTestId("right").dataset.state).toBe("idle");
      expect(document.querySelector("[data-testid=right-placeholder]")).toBeNull();
      await releasePointer();
      expect(onChange.mock.calls.map(([board, change]) => `${board} ${change.reason}`)).toEqual(["left move"]);
      expect(boardOf("a")).toBe("left");
    });

    it("moves an item past the edge into the next grid with the keyboard and keeps focus on it", async () => {
      const onChange = vi.fn<(board: Board, change: GridLayoutChange) => void>();
      await renderStrict(<Boards onChange={onChange} />);
      getByTestId("b-move").focus();
      await userEvent.keyboard(" ");
      await userEvent.keyboard("{ArrowRight}");
      expect(announcements()).toContain("Card b moved to column 3, row 1.");
      await userEvent.keyboard("{ArrowRight}");
      expect(announcements()).toContain("Card b moved to the right board, column 1, row 1.");
      expect(getByTestId("right").dataset.state).toBe("dropping");
      await userEvent.keyboard("{ArrowRight}");
      expect(announcements()).toContain("Card b moved to column 2, row 1.");
      await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
      expect(announcements()).toContain("Card b moved back to column 3, row 1.");
      expect(getByTestId("right").dataset.state).toBe("idle");
      await userEvent.keyboard("{ArrowRight}");
      await userEvent.keyboard("{Enter}");
      await nextFrames();
      expect(onChange.mock.calls.map(([board, change]) => `${board} ${change.reason} ${change.value}`)).toEqual(["right add b", "left remove b"]);
      expect(boardOf("b")).toBe("right");
      expect(document.activeElement).toBe(getByTestId("b-move"));
      expect(announcements()).toContain("Card b dropped in the right board at column 1, row 1.");
    });
  });
});
