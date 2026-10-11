import type { MasonryLayoutInfo, MasonryProps, MasonryVirtualProps } from "./index";
import * as React from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { nextFrames } from "../../test/pointer";
import { getByTestId, renderError, renderStrict } from "../../test/render";
import * as Masonry from "./index";
import { computeMasonryLayout } from "./index";

interface GalleryProps extends Partial<MasonryProps> {
  items: (number | { height: number; span?: number; order?: number; key?: string })[];
}

function Gallery({ items, style, ...rootProps }: GalleryProps): React.ReactNode {
  // Items without a key are named by their position, which never changes within a test.
  const entries = items.map((item, position) => ({ key: String(position), ...(typeof item === "number" ? { height: item } : item) }));
  return (
    <Masonry.Root data-testid="root" native="never" columns={3} style={{ width: 300, gap: 0, fontSize: 16, ...style }} {...rootProps}>
      {entries.map(({ key, height, span, order }) => (
        <Masonry.Item key={key} span={span} data-testid={`item-${key}`} style={{ height, order }} />
      ))}
    </Masonry.Root>
  );
}

function boxOf(testId: string): { x: number; y: number; width: number } {
  const root = getByTestId("root").getBoundingClientRect();
  const rect = getByTestId(testId).getBoundingClientRect();
  return { x: rect.left - root.left, y: rect.top - root.top, width: rect.width };
}

function boxes(count: number): { x: number; y: number }[] {
  return Array.from({ length: count }, (_, index) => {
    const { x, y } = boxOf(`item-${index}`);
    return { x, y };
  });
}

const EXAMPLE = [100, 50, 80, 30, 60];
const EXAMPLE_BOXES = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }, { x: 100, y: 50 }, { x: 200, y: 80 }];

describe("masonry", () => {
  it("puts each item in the column that ends highest", async () => {
    await renderStrict(<Gallery items={EXAMPLE} />);
    const root = getByTestId("root");
    expect(root.dataset.layout).toBe("script");
    expect(root.style.getPropertyValue("--xlayout-masonry-columns")).toBe("3");
    expect(boxes(5)).toEqual(EXAMPLE_BOXES);
    expect(boxOf("item-0").width).toBe(100);
    expect(root.getBoundingClientRect().height).toBe(140);
  });

  it("lets the browser place the items where it has grid lanes, at the same places", async () => {
    await renderStrict(<Gallery items={EXAMPLE} native="auto" />);
    const root = getByTestId("root");
    const native = CSS.supports("display", "grid-lanes");
    expect(root.dataset.layout).toBe(native ? "native" : "script");
    if (native) {
      expect(getComputedStyle(root).display).toBe("grid-lanes");
      expect(root.style.getPropertyValue("fit-tolerance")).toBe("normal");
    }
    expect(boxes(5)).toEqual(EXAMPLE_BOXES);
    expect(root.getBoundingClientRect().height).toBe(140);
  });

  it("uses the root's gaps", async () => {
    await renderStrict(<Gallery items={[50, 30, 40]} columns={2} style={{ width: 212, columnGap: 12, rowGap: 8 }} />);
    expect(boxes(3)).toEqual([{ x: 0, y: 0 }, { x: 112, y: 0 }, { x: 112, y: 38 }]);
    expect(getByTestId("root").getBoundingClientRect().height).toBe(78);
  });

  it("counts columns from the minimum column width and follows the root's width", async () => {
    const reports: MasonryLayoutInfo[] = [];
    const onLayout = (layout: MasonryLayoutInfo): void => {
      reports.push(layout);
    };
    const view = await renderStrict(
      <Gallery items={EXAMPLE} columns={undefined} minColumnWidth={90} style={{ width: 300, columnGap: 10 }} onLayout={onLayout} />,
    );
    const root = getByTestId("root");
    expect(root.style.getPropertyValue("--xlayout-masonry-columns")).toBe("3");
    expect(reports.at(-1)).toEqual({ columns: 3, columnWidth: 280 / 3, height: 140, native: false });
    await view.rerender(<Gallery items={EXAMPLE} columns={undefined} minColumnWidth={90} maxColumns={2} style={{ width: 300, columnGap: 10 }} onLayout={onLayout} />);
    expect(root.style.getPropertyValue("--xlayout-masonry-columns")).toBe("2");
    await view.rerender(<Gallery items={EXAMPLE} columns={undefined} minColumnWidth={90} style={{ width: 180, columnGap: 10 }} onLayout={onLayout} />);
    await nextFrames();
    expect(root.style.getPropertyValue("--xlayout-masonry-columns")).toBe("1");
    expect(boxOf("item-1")).toEqual({ x: 0, y: 100, width: 180 });
  });

  it("places spanning items where all their columns end highest", async () => {
    await renderStrict(<Gallery items={[100, 20, 40, { height: 50, span: 2 }, { height: 10, span: 5 }]} />);
    expect(boxOf("item-3")).toEqual({ x: 100, y: 40, width: 200 });
    expect(boxOf("item-4")).toEqual({ x: 0, y: 100, width: 300 });
  });

  it("follows items that change size", async () => {
    const view = await renderStrict(<Gallery items={EXAMPLE} />);
    await view.rerender(<Gallery items={[100, 200, 80, 30, 60]} />);
    await nextFrames();
    expect(boxes(5).slice(3)).toEqual([{ x: 200, y: 80 }, { x: 0, y: 100 }]);
  });

  it("keeps items in their columns with stable assignment until the layout key changes", async () => {
    const view = await renderStrict(<Gallery items={EXAMPLE} assignment="stable" layoutKey="first" />);
    expect(getByTestId("root").dataset.layout).toBe("script");
    expect(boxes(5)).toEqual(EXAMPLE_BOXES);
    await view.rerender(<Gallery items={[100, 200, 80, 30, 60]} assignment="stable" layoutKey="first" />);
    await nextFrames();
    expect(boxes(5).slice(3)).toEqual([{ x: 100, y: 200 }, { x: 200, y: 80 }]);
    await view.rerender(<Gallery items={[100, 200, 80, 30, 60]} assignment="stable" layoutKey="second" />);
    expect(boxes(5).slice(3)).toEqual([{ x: 200, y: 80 }, { x: 0, y: 100 }]);
  });

  it("places from the right in right-to-left layouts", async () => {
    await renderStrict(<Gallery items={EXAMPLE} dir="rtl" />);
    expect(boxes(3)).toEqual([{ x: 200, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 0 }]);
  });

  it("follows items that React moves and the order property", async () => {
    const view = await renderStrict(<Gallery items={[{ height: 100, key: "a" }, { height: 50, key: "b" }, { height: 80, key: "c" }]} />);
    expect(boxOf("item-c")).toEqual({ x: 200, y: 0, width: 100 });
    await view.rerender(<Gallery items={[{ height: 80, key: "c" }, { height: 100, key: "a" }, { height: 50, key: "b" }]} />);
    await nextFrames();
    expect(boxOf("item-c")).toEqual({ x: 0, y: 0, width: 100 });
    await view.rerender(<Gallery items={[{ height: 80, key: "c" }, { height: 100, key: "a" }, { height: 50, key: "b", order: -1 }]} />);
    await nextFrames();
    expect(boxOf("item-b")).toEqual({ x: 0, y: 0, width: 100 });
  });

  it("marks items placed one frame after they got their place", async () => {
    // The layout is reported in the commit that places the items, before any frame passes.
    const placedWhenLaidOut: (string | undefined)[] = [];
    await renderStrict(<Gallery items={[40]} onLayout={() => placedWhenLaidOut.push(getByTestId("item-0").dataset.placed)} />);
    await nextFrames(2);
    expect(placedWhenLaidOut).toEqual([undefined]);
    expect(getByTestId("item-0").dataset.placed).toBe("");
  });

  it("rejects conflicting column options and spans below 1", async () => {
    const both = await renderError(<Masonry.Root columns={3} minColumnWidth={100} />);
    expect(both.message).toContain("takes columns or minColumnWidth");
    const span = await renderError(<Masonry.Root columns={2}><Masonry.Item span={0} /></Masonry.Root>);
    expect(span.message).toContain("span must be a whole number of at least 1, not 0");
  });
});

interface FeedProps extends Omit<MasonryVirtualProps, "count" | "children"> {
  heights: readonly number[];
  keys?: readonly string[];
  /** The style of the element that scrolls the root; `null` renders the root alone. */
  scroller?: React.CSSProperties | null;
  itemProps?: React.ComponentProps<"div">;
}

function Feed({ heights, keys, scroller = {}, itemProps, style, ...rootProps }: FeedProps): React.ReactNode {
  const getItemKey = React.useCallback((index: number) => keys?.[index] ?? index, [keys]);
  const masonry = (
    <Masonry.Root
      data-testid="root"
      count={heights.length}
      columns={3}
      overscan={50}
      estimateHeight={100}
      getItemKey={getItemKey}
      style={{ width: 300, gap: 0, fontSize: 16, ...style }}
      {...rootProps}
    >
      {index => (
        <Masonry.Item data-testid={`item-${keys?.[index] ?? index}`} {...itemProps} style={{ height: heights[index], ...itemProps?.style }} />
      )}
    </Masonry.Root>
  );
  return scroller === null ? masonry : <div data-testid="scroller" style={{ height: 600, overflow: "auto", ...scroller }}>{masonry}</div>;
}

function renderedIndexes(): number[] {
  return [...getByTestId("root").children].map(element => Number((element as HTMLElement).dataset.index));
}

async function scrollTo(target: Element | Window, top: number): Promise<void> {
  target.scrollTo({ top, behavior: "instant" });
  await nextFrames(3);
}

/** How far below the top of the scrollport the item is. */
function topInView(testId: string): number {
  return getByTestId(testId).getBoundingClientRect().top - getByTestId("scroller").getBoundingClientRect().top;
}

/** Checks that items cover every column of the root across the scrollport, from `top` to `bottom` of it. */
function expectCovered(port: DOMRect, top: number, bottom: number): void {
  const root = getByTestId("root");
  const rootBox = root.getBoundingClientRect();
  for (const x of [50, 150, 250]) {
    for (const y of [top + 5, (top + bottom) / 2, bottom - 5]) {
      const hit = document.elementFromPoint(rootBox.left + x, port.top + y);
      expect(hit?.parentElement).toBe(root);
    }
  }
}

const FEED = Array.from({ length: 3000 }, (_, index) => 40 + (index * 37) % 120);

describe("virtual masonry", () => {
  it("renders only the items near the scrollport, where all of them would go", async () => {
    await renderStrict(<Feed heights={FEED} />);
    expect(getByTestId("root").dataset.layout).toBe("virtual");
    const rendered = renderedIndexes();
    expect(rendered.length).toBeLessThan(60);
    const layout = computeMasonryLayout({ columns: 3, gap: 0, tolerance: 16, items: FEED.map(height => ({ span: 1, height })) });
    const inView = layout.placements.flatMap((placement, index) => (placement.y <= 600 && placement.y + FEED[index]! >= 0 ? [index] : []));
    expect(rendered).toEqual(expect.arrayContaining(inView));
    for (const index of inView) {
      expect(boxOf(`item-${index}`)).toEqual({ x: layout.placements[index]!.column * 100, y: layout.placements[index]!.y, width: 100 });
    }
  });

  it("renders the items in view wherever it scrolls to", async () => {
    await renderStrict(<Feed heights={FEED} />);
    const scroller = getByTestId("scroller");
    for (const top of [4000, 30_000, 900, 0]) {
      await scrollTo(scroller, top);
      expect(scroller.scrollTop).toBe(top);
      expectCovered(scroller.getBoundingClientRect(), 0, 600);
      expect(renderedIndexes().length).toBeLessThan(60);
    }
    // The height is estimated until the last items are placed, so the end may move once.
    await scrollTo(scroller, scroller.scrollHeight);
    await scrollTo(scroller, scroller.scrollHeight);
    expect(renderedIndexes().at(-1)).toBe(FEED.length - 1);
    const root = getByTestId("root").getBoundingClientRect();
    const last = getByTestId(`item-${FEED.length - 1}`).getBoundingClientRect();
    expect(last.bottom).toBeLessThanOrEqual(root.bottom);
  });

  it("keeps what the reader sees in place when an item above it changes height", async () => {
    const heights = Array.from<number>({ length: 200 }).fill(100);
    const view = await renderStrict(<Feed heights={heights} columns={1} style={{ width: 100 }} overscan={300} />);
    const scroller = getByTestId("scroller");
    await scrollTo(scroller, 5000);
    expect(topInView("item-50")).toBe(0);
    await view.rerender(<Feed heights={heights.with(48, 250)} columns={1} style={{ width: 100 }} overscan={300} />);
    await nextFrames(3);
    expect(scroller.scrollTop).toBe(5150);
    expect(topInView("item-50")).toBe(0);
    // An item in view growing moves the items after it only.
    await view.rerender(<Feed heights={heights.with(48, 250).with(51, 160)} columns={1} style={{ width: 100 }} overscan={300} />);
    await nextFrames(3);
    expect(scroller.scrollTop).toBe(5150);
    expect(topInView("item-52")).toBe(260);
  });

  it("keeps what the reader sees in place when items come before it", async () => {
    const keys = Array.from({ length: 200 }, (_, index) => `k${index}`);
    const heights = Array.from<number>({ length: 210 }).fill(100);
    const view = await renderStrict(<Feed heights={heights.slice(10)} keys={keys} columns={1} style={{ width: 100 }} overscan={300} />);
    const scroller = getByTestId("scroller");
    await scrollTo(scroller, 5000);
    expect(topInView("item-k50")).toBe(0);
    const added = Array.from({ length: 10 }, (_, index) => `new${index}`);
    await view.rerender(<Feed heights={heights} keys={[...added, ...keys]} columns={1} style={{ width: 100 }} overscan={300} />);
    await nextFrames(3);
    expect(scroller.scrollTop).toBe(6000);
    expect(topInView("item-k50")).toBe(0);
  });

  it("keeps the item holding focus rendered while it scrolls away", async () => {
    await renderStrict(
      <>
        <button type="button" data-testid="outside">Outside</button>
        <Feed heights={FEED} itemProps={{ tabIndex: 0 }} />
      </>,
    );
    const scroller = getByTestId("scroller");
    getByTestId("item-1").focus();
    await scrollTo(scroller, 8000);
    expect(document.activeElement).toBe(getByTestId("item-1"));
    expect(renderedIndexes()).toContain(1);
    getByTestId("outside").focus();
    await scrollTo(scroller, 8100);
    expect(renderedIndexes()).not.toContain(1);
  });

  it("measures the items again at a new column width", async () => {
    const square = { style: { height: undefined, aspectRatio: "1" } };
    const view = await renderStrict(<Feed heights={FEED} itemProps={square} estimateHeight={50} />);
    expect(boxOf("item-3")).toEqual({ x: 0, y: 100, width: 100 });
    await view.rerender(<Feed heights={FEED} itemProps={square} estimateHeight={50} style={{ width: 450 }} />);
    await nextFrames(3);
    expect(boxOf("item-3")).toEqual({ x: 0, y: 150, width: 150 });
    expect(boxOf("item-10")).toEqual({ x: 150, y: 450, width: 150 });
  });

  it("follows the scrolling of the root itself and of the page", async () => {
    const view = await renderStrict(<Feed heights={FEED} scroller={null} style={{ height: 600, overflow: "auto" }} />);
    const root = getByTestId("root");
    await scrollTo(root, 20_000);
    expectCovered(root.getBoundingClientRect(), 0, 600);
    await view.rerender(<Feed heights={FEED} scroller={null} />);
    await scrollTo(window, 20_000);
    expectCovered(new DOMRect(0, 0, window.innerWidth, window.innerHeight), 0, window.innerHeight);
    expect(renderedIndexes().length).toBeLessThan(80);
    await scrollTo(window, 0);
  });

  it("places spanning items and takes their spans from getItemSpan only", async () => {
    const spanOf = (index: number): number => (index % 5 === 0 ? 2 : 1);
    await renderStrict(<Feed heights={FEED} getItemSpan={spanOf} />);
    const layout = computeMasonryLayout({ columns: 3, gap: 0, tolerance: 16, items: FEED.slice(0, 10).map((height, index) => ({ span: spanOf(index), height })) });
    for (let index = 0; index < 10; index++) {
      const { column, span, y } = layout.placements[index]!;
      expect(boxOf(`item-${index}`)).toEqual({ x: column * 100, y, width: span * 100 });
    }
    const error = await renderError(<Masonry.Root count={1}>{() => <Masonry.Item span={2} />}</Masonry.Root>);
    expect(error.message).toContain("takes its span from getItemSpan");
  });

  it("keeps measured items in their columns with stable assignment", async () => {
    const reports: MasonryLayoutInfo[] = [];
    const view = await renderStrict(<Feed heights={EXAMPLE} scroller={null} assignment="stable" onLayout={layout => reports.push(layout)} />);
    expect(boxes(5)).toEqual(EXAMPLE_BOXES);
    expect(reports.at(-1)).toEqual({ columns: 3, columnWidth: 100, height: 140, native: false });
    await view.rerender(<Feed heights={[100, 200, 80, 30, 60]} scroller={null} assignment="stable" />);
    await nextFrames(3);
    expect(boxes(5).slice(3)).toEqual([{ x: 100, y: 200 }, { x: 200, y: 80 }]);
  });

  it("hydrates the first items the server rendered, then renders the items in view", async () => {
    const container = document.createElement("div");
    container.innerHTML = renderToString(<Feed heights={FEED} initialCount={4} />);
    document.body.append(container);
    expect(renderedIndexes()).toEqual([0, 1, 2, 3]);
    const errors: unknown[] = [];
    const root = hydrateRoot(container, <Feed heights={FEED} initialCount={4} />, { onRecoverableError: error => errors.push(error) });
    await nextFrames(3);
    expect(errors).toEqual([]);
    expect(renderedIndexes().length).toBeGreaterThan(4);
    expect(boxOf("item-3")).toEqual({ x: 0, y: FEED[0], width: 100 });
    root.unmount();
    container.remove();
  });

  it("renders the first items in a plain grid until it knows its columns, and fewer when the count drops", async () => {
    const view = await renderStrict(<Feed heights={FEED} initialCount={4} />);
    expect(renderedIndexes().length).toBeGreaterThan(4);
    await view.rerender(<Feed heights={FEED.slice(0, 2)} initialCount={4} />);
    expect(renderedIndexes()).toEqual([0, 1]);
    await view.rerender(<Feed heights={[]} initialCount={4} />);
    expect(renderedIndexes()).toEqual([]);
    expect(getByTestId("root").getBoundingClientRect().height).toBe(0);
  });
});
