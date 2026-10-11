import type { MasonryLayoutInfo, MasonryProps } from "./index";
import * as React from "react";
import { describe, expect, it } from "vitest";
import { nextFrames } from "../../test/pointer";
import { getByTestId, renderError, renderStrict } from "../../test/render";
import * as Masonry from "./index";

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
    await renderStrict(<Gallery items={[40]} />);
    expect(getByTestId("item-0").dataset.placed).toBeUndefined();
    await nextFrames(2);
    expect(getByTestId("item-0").dataset.placed).toBe("");
  });

  it("rejects conflicting column options and spans below 1", async () => {
    const both = await renderError(<Masonry.Root columns={3} minColumnWidth={100} />);
    expect(both.message).toContain("takes columns or minColumnWidth");
    const span = await renderError(<Masonry.Root columns={2}><Masonry.Item span={0} /></Masonry.Root>);
    expect(span.message).toContain("span must be a whole number of at least 1, not 0");
  });
});
