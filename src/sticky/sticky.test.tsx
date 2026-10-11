import type { StickySide } from "./index";
import * as React from "react";
import { describe, expect, it } from "vitest";
import { nextFrames } from "../../test/pointer";
import { getByTestId, renderError, renderStrict } from "../../test/render";
import * as Sticky from "./index";

async function scrollTo(testId: string, position: ScrollToOptions): Promise<void> {
  getByTestId(testId).scrollTo({ ...position, behavior: "instant" });
  await nextFrames(3);
}

function stuckOf(testId: string): string | undefined {
  return getByTestId(testId).dataset.stuck;
}

function topWithin(testId: string, scrollerTestId: string): number {
  return getByTestId(testId).getBoundingClientRect().top - getByTestId(scrollerTestId).getBoundingClientRect().top;
}

describe("sticky", () => {
  it("sticks to the top and reports when it does", async () => {
    const changes: StickySide[][] = [];
    await renderStrict(
      <div data-testid="scroller" style={{ height: 200, overflow: "auto" }}>
        <div style={{ height: 50 }} />
        <Sticky.Root data-testid="header" onStuckChange={sides => changes.push(sides)} style={{ height: 30 }}>Header</Sticky.Root>
        <div style={{ height: 1000 }} />
      </div>,
    );
    const header = getByTestId("header");
    expect(header.style.position).toBe("sticky");
    expect(header.style.top).toBe("0px");
    expect(header.dataset.side).toBe("top");
    expect(stuckOf("header")).toBeUndefined();
    await scrollTo("scroller", { top: 40 });
    expect(stuckOf("header")).toBeUndefined();
    await scrollTo("scroller", { top: 120 });
    expect(stuckOf("header")).toBe("top");
    expect(topWithin("header", "scroller")).toBe(0);
    await scrollTo("scroller", { top: 0 });
    expect(stuckOf("header")).toBeUndefined();
    expect(changes).toEqual([["top"], []]);
  });

  it("keeps its offset from the edge, in pixels or as any CSS length", async () => {
    function Page({ offset }: { offset: number | string }): React.ReactNode {
      return (
        <div data-testid="scroller" style={{ height: 200, overflow: "auto" }}>
          <div style={{ height: 50 }} />
          <Sticky.Root data-testid="header" offset={offset} style={{ height: 30 }} />
          <div style={{ height: 1000 }} />
        </div>
      );
    }
    const view = await renderStrict(<Page offset={20} />);
    expect(getByTestId("header").style.top).toBe("20px");
    await scrollTo("scroller", { top: 25 });
    expect(stuckOf("header")).toBeUndefined();
    await scrollTo("scroller", { top: 40 });
    expect(stuckOf("header")).toBe("top");
    expect(topWithin("header", "scroller")).toBe(20);
    await view.rerender(<Page offset="2rem" />);
    await nextFrames(3);
    expect(getByTestId("header").style.top).toBe("2rem");
    expect(topWithin("header", "scroller")).toBe(32);
    expect(stuckOf("header")).toBe("top");
  });

  it("sticks to the bottom while its place in the flow is past the edge", async () => {
    const changes: StickySide[][] = [];
    await renderStrict(
      <div data-testid="scroller" style={{ height: 200, overflow: "auto" }}>
        <div style={{ height: 400 }} />
        <Sticky.Root data-testid="footer" side="bottom" onStuckChange={sides => changes.push(sides)} style={{ height: 30 }} />
        <div style={{ height: 100 }} />
      </div>,
    );
    expect(stuckOf("footer")).toBe("bottom");
    expect(topWithin("footer", "scroller")).toBe(170);
    await scrollTo("scroller", { top: 400 });
    expect(stuckOf("footer")).toBeUndefined();
    expect(changes).toEqual([["bottom"], []]);
  });

  it("sticks to the inline start in either reading direction", async () => {
    for (const dir of ["ltr", "rtl"] as const) {
      const view = await renderStrict(
        <div dir={dir} data-testid="scroller" style={{ width: 200, overflow: "auto" }}>
          <div style={{ width: 1100 }}>
            <Sticky.Root data-testid="label" side="inline-start" style={{ width: 40, height: 20, marginInlineStart: 50 }} />
          </div>
        </div>,
      );
      const label = getByTestId("label");
      expect(label.style.insetInlineStart).toBe("0px");
      expect(getComputedStyle(label)[dir === "rtl" ? "right" : "left"]).toBe("0px");
      expect(stuckOf("label")).toBeUndefined();
      await scrollTo("scroller", { left: dir === "rtl" ? -120 : 120 });
      expect(stuckOf("label")).toBe("inline-start");
      await view.unmount();
    }
  });

  it("sticks to several sides at once", async () => {
    await renderStrict(
      <div data-testid="scroller" style={{ width: 200, height: 200, overflow: "auto" }}>
        <div style={{ height: 50 }} />
        <div style={{ display: "flex" }}>
          <div style={{ width: 50, flexShrink: 0 }} />
          <Sticky.Root data-testid="corner" side={["top", "left"]} style={{ width: 40, height: 40, flexShrink: 0 }} />
          <div style={{ width: 1000, height: 1000, flexShrink: 0 }} />
        </div>
      </div>,
    );
    await scrollTo("scroller", { top: 100 });
    expect(stuckOf("corner")).toBe("top");
    await scrollTo("scroller", { top: 100, left: 100 });
    expect(stuckOf("corner")).toBe("top left");
  });

  it("follows content that changes before it", async () => {
    function Page({ spacer }: { spacer: number }): React.ReactNode {
      return (
        <div data-testid="scroller" style={{ height: 200, overflow: "auto" }}>
          <div style={{ height: spacer }} />
          <Sticky.Root data-testid="header" style={{ height: 30 }} />
          <div style={{ height: 1000 }} />
        </div>
      );
    }
    const view = await renderStrict(<Page spacer={100} />);
    await scrollTo("scroller", { top: 60 });
    expect(stuckOf("header")).toBeUndefined();
    await view.rerender(<Page spacer={40} />);
    await nextFrames(3);
    expect(stuckOf("header")).toBe("top");
  });

  it("follows hundreds of section headers in one list", async () => {
    function List({ grown }: { grown: number }): React.ReactNode {
      return (
        // Without scroll anchoring the scroll position stays when content above it grows.
        <div data-testid="scroller" style={{ height: 300, overflow: "auto", overflowAnchor: "none" }}>
          {Array.from({ length: 300 }, (_, section) => (
            <section key={section}>
              <Sticky.Root data-testid={`header-${section}`} style={{ height: 20 }}>{`Section ${section}`}</Sticky.Root>
              {[0, 1, 2].map(row => <div key={row} style={{ height: section === grown && row === 0 ? 200 : 40 }} />)}
            </section>
          ))}
        </div>
      );
    }
    const view = await renderStrict(<List grown={-1} />);
    // Headers of the sections scrolled past stay moved to the ends of their sections, so the
    // last stuck header is the one at the top.
    const lastStuck = (): string | undefined => [...document.querySelectorAll<HTMLElement>("[data-stuck]")].at(-1)?.dataset.testid;
    // Each section is 140px, so 14,010 is 10px into section 100.
    await scrollTo("scroller", { top: 14_010 });
    expect(lastStuck()).toBe("header-100");
    expect(topWithin("header-100", "scroller")).toBe(0);
    // A row growing 160px in section 50 moves every header after it.
    await view.rerender(<List grown={50} />);
    await nextFrames(3);
    expect(lastStuck()).toBe("header-98");
    await scrollTo("scroller", { top: 14_170 });
    expect(lastStuck()).toBe("header-100");
    expect(stuckOf("header-101")).toBeUndefined();
  });

  it("tells its content whether it is stuck", async () => {
    function Title(): React.ReactNode {
      const { isStuck, stuckSides } = Sticky.useSticky();
      return <span data-testid="title">{isStuck ? `stuck ${stuckSides.join(" ")}` : "in place"}</span>;
    }
    await renderStrict(
      <div data-testid="scroller" style={{ height: 200, overflow: "auto" }}>
        <div style={{ height: 50 }} />
        <Sticky.Root style={{ height: 30 }}><Title /></Sticky.Root>
        <div style={{ height: 1000 }} />
      </div>,
    );
    expect(getByTestId("title").textContent).toBe("in place");
    await scrollTo("scroller", { top: 100 });
    expect(getByTestId("title").textContent).toBe("stuck top");
  });

  it("sticks table cells to the top and to the start", async () => {
    const columns = ["a", "b", "c", "d"];
    const rows = [1, 2, 3, 4, 5, 6, 7, 8];
    await renderStrict(
      <div data-testid="scroller" style={{ width: 240, height: 150, overflow: "auto" }}>
        <table style={{ borderCollapse: "collapse", borderSpacing: 0 }}>
          <thead>
            <tr>
              <Sticky.Root asChild side={["top", "left"]} data-testid="corner">
                <th style={{ minWidth: 80, height: 30, padding: 0 }}>Name</th>
              </Sticky.Root>
              {columns.map(column => (
                <Sticky.Root key={column} asChild data-testid={`head-${column}`}>
                  <th style={{ minWidth: 120, padding: 0 }}>{column}</th>
                </Sticky.Root>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row}>
                <Sticky.Root asChild side="left" data-testid={`row-${row}`}>
                  <th style={{ height: 30, padding: 0 }}>{row}</th>
                </Sticky.Root>
                {columns.map(column => <td key={column} style={{ padding: 0 }}>{`${column}${row}`}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
    expect(stuckOf("corner")).toBeUndefined();
    await scrollTo("scroller", { top: 60, left: 60 });
    expect(stuckOf("corner")).toBe("top left");
    expect(stuckOf("head-b")).toBe("top");
    expect(stuckOf("row-4")).toBe("left");
  });

  it("stacks the layers of a group and exposes how far they reach", async () => {
    function Page({ header }: { header: number }): React.ReactNode {
      return (
        <div data-testid="scroller" style={{ height: 300, overflow: "auto" }}>
          <Sticky.Group data-testid="group">
            <Sticky.Root data-testid="header" style={{ height: header }} />
            <section>
              <Sticky.Root data-testid="toolbar" layer={1} offset={8} style={{ height: 30 }} />
              <div style={{ height: 600 }} />
            </section>
            <Sticky.Root data-testid="footer" side="bottom" style={{ height: 20 }} />
          </Sticky.Group>
        </div>
      );
    }
    const view = await renderStrict(<Page header={40} />);
    const group = getByTestId("group");
    expect(getComputedStyle(getByTestId("toolbar")).top).toBe("48px");
    expect(group.style.getPropertyValue("--xlayout-sticky-top")).toBe("78px");
    expect(group.style.getPropertyValue("--xlayout-sticky-bottom")).toBe("20px");
    await scrollTo("scroller", { top: 200 });
    expect(stuckOf("header")).toBe("top");
    expect(stuckOf("toolbar")).toBe("top");
    expect(topWithin("toolbar", "scroller")).toBe(48);
    await view.rerender(<Page header={50} />);
    await nextFrames(3);
    expect(getComputedStyle(getByTestId("toolbar")).top).toBe("58px");
    expect(group.style.getPropertyValue("--xlayout-sticky-top")).toBe("88px");
    expect(topWithin("toolbar", "scroller")).toBe(58);
  });

  it("rejects the same side twice and offsets that are not lengths", async () => {
    const twice = await renderError(<Sticky.Root side={["left", "inline-start"]} />);
    expect(twice.message).toContain("names the same side more than once");
    const length = await renderError(<Sticky.Root offset="nowhere" />);
    expect(length.message).toContain("is not a CSS length");
  });
});
