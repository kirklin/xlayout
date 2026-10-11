import type { ScrollSpyProps } from "./index";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextFrames } from "../../test/pointer";
import { getByTestId, renderError, renderStrict } from "../../test/render";
import * as ScrollSpy from "./index";

const VALUES = ["a", "b", "c", "d", "e", "f", "g", "h"];

interface DocProps extends Partial<ScrollSpyProps> {
  intro?: number;
  scroller?: React.CSSProperties;
  section?: React.CSSProperties;
  nav?: React.CSSProperties;
}

/** Eight sections of 150px in a 400px scroller: positions 0 to 1050, scroll range 800. */
function Doc({ intro = 0, scroller, section, nav, children, ...rootProps }: DocProps): React.ReactNode {
  return (
    <ScrollSpy.Root {...rootProps}>
      {children}
      <ScrollSpy.Nav aria-label="On this page" data-testid="nav" style={nav}>
        <ScrollSpy.List data-testid="list" style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {VALUES.map(value => (
            <ScrollSpy.Item key={value} value={value} data-testid={`item-${value}`}>
              <ScrollSpy.Link data-testid={`link-${value}`} style={{ display: "block", height: 30 }}>{value}</ScrollSpy.Link>
            </ScrollSpy.Item>
          ))}
        </ScrollSpy.List>
      </ScrollSpy.Nav>
      <div data-testid="scroller" style={{ height: 400, overflow: "auto", ...scroller }}>
        {intro > 0 && <div style={{ height: intro }} />}
        {VALUES.map(value => (
          <ScrollSpy.Section key={value} value={value} data-testid={`section-${value}`} style={{ height: 150, ...section }}>
            {value}
          </ScrollSpy.Section>
        ))}
      </div>
    </ScrollSpy.Root>
  );
}

async function scrollTo(top: number): Promise<void> {
  getByTestId("scroller").scrollTo({ top, behavior: "instant" });
  await nextFrames(3);
}

function activeLink(): string | undefined {
  return document.querySelector<HTMLElement>("[aria-current]")?.textContent ?? undefined;
}

async function waitFor(milliseconds: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, milliseconds));
}

const initialUrl = window.location.href;

describe("scroll spy", () => {
  afterEach(() => {
    window.history.replaceState(null, "", initialUrl);
    window.scrollTo({ top: 0, behavior: "instant" });
  });

  it("marks the section scrolling has reached, and its link", async () => {
    const onValueChange = vi.fn();
    await renderStrict(<Doc onValueChange={onValueChange} />);
    expect(activeLink()).toBe("a");
    expect(getByTestId("link-a").getAttribute("aria-current")).toBe("true");
    expect(getByTestId("link-a").dataset.state).toBe("active");
    expect(getByTestId("item-a").dataset.state).toBe("active");
    expect(getByTestId("section-a").dataset.state).toBe("active");
    await scrollTo(148);
    expect(activeLink()).toBe("a");
    await scrollTo(151);
    expect(activeLink()).toBe("b");
    await scrollTo(460);
    expect(activeLink()).toBe("d");
    expect(onValueChange.mock.calls.map(([value]) => value)).toEqual(["a", "b", "d"]);
  });

  it("follows the page when the document scrolls", async () => {
    await renderStrict(
      <ScrollSpy.Root>
        {VALUES.map(value => <ScrollSpy.Section key={value} value={value} data-testid={`section-${value}`} style={{ height: 600 }} />)}
        <ScrollSpy.Nav aria-label="On this page" style={{ position: "fixed", insetBlockStart: 0, insetInlineEnd: 0 }}>
          <ScrollSpy.List>
            {VALUES.map(value => (
              <ScrollSpy.Item key={value} value={value}><ScrollSpy.Link>{value}</ScrollSpy.Link></ScrollSpy.Item>
            ))}
          </ScrollSpy.List>
        </ScrollSpy.Nav>
      </ScrollSpy.Root>,
    );
    const start = getByTestId("section-a").getBoundingClientRect().top + window.scrollY;
    expect(activeLink()).toBe("a");
    window.scrollTo({ top: start + 1300, behavior: "instant" });
    await nextFrames(3);
    expect(activeLink()).toBe("c");
  });

  it("measures from the scroll padding and the scroll margin", async () => {
    const view = await renderStrict(<Doc scroller={{ scrollPaddingTop: 40 }} />);
    await scrollTo(115);
    expect(activeLink()).toBe("b");
    await view.rerender(<Doc section={{ scrollMarginTop: 40 }} />);
    await scrollTo(0);
    await scrollTo(115);
    expect(activeLink()).toBe("b");
    await view.rerender(<Doc />);
    await scrollTo(0);
    await scrollTo(115);
    expect(activeLink()).toBe("a");
  });

  it("spreads the sections the end of the scroll range cannot reach", async () => {
    await renderStrict(<Doc />);
    // Positions 900 and 1050 lie past the scroll range of 800 and move to 775 and 800.
    await scrollTo(760);
    expect(activeLink()).toBe("f");
    await scrollTo(777);
    expect(activeLink()).toBe("g");
    await scrollTo(800);
    expect(activeLink()).toBe("h");
  });

  it("moves on once the previous section started more than half a scrollport above", async () => {
    await renderStrict(<Doc section={{ height: 500 }} />);
    // b starts at 500: reached at 500, or at 301 when a started more than 200 above.
    await scrollTo(290);
    expect(activeLink()).toBe("a");
    await scrollTo(310);
    expect(activeLink()).toBe("b");
  });

  it("marks nothing before the first section when asked to", async () => {
    const view = await renderStrict(<Doc intro={300} fallback="none" />);
    expect(activeLink()).toBeUndefined();
    expect(getByTestId("section-a").dataset.state).toBe("inactive");
    await scrollTo(300);
    expect(activeLink()).toBe("a");
    await view.rerender(<Doc intro={300} />);
    await scrollTo(0);
    expect(activeLink()).toBe("a");
  });

  it("tells which sections show and which the reader has passed", async () => {
    await renderStrict(<Doc />);
    await scrollTo(310);
    expect(VALUES.filter(value => getByTestId(`link-${value}`).dataset.visible !== undefined)).toEqual(["c", "d", "e"]);
    expect(VALUES.filter(value => getByTestId(`link-${value}`).dataset.passed !== undefined)).toEqual(["a", "b"]);
    expect(getByTestId("section-c").dataset.visible).toBe("");
  });

  it("follows links natively and keeps the clicked section until the reader scrolls", async () => {
    await renderStrict(<Doc />);
    getByTestId("link-g").click();
    await nextFrames(3);
    expect(window.location.hash).toBe("#g");
    expect(getByTestId("scroller").scrollTop).toBe(800);
    // Without the hold, the end of the range would mark h.
    expect(activeLink()).toBe("g");
    await waitFor(200);
    await scrollTo(0);
    expect(activeLink()).toBe("a");
  });

  it("ends the hold when the reader turns the wheel", async () => {
    await renderStrict(<Doc />);
    getByTestId("link-g").click();
    await nextFrames(3);
    expect(activeLink()).toBe("g");
    getByTestId("scroller").dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: 10 }));
    await nextFrames(3);
    expect(activeLink()).toBe("h");
  });

  it("scrolls without touching the URL, or replaces its hash, when asked to", async () => {
    const view = await renderStrict(<Doc navigation="none" />);
    const length = window.history.length;
    getByTestId("link-c").click();
    await nextFrames(3);
    expect(window.location.href).toBe(initialUrl);
    expect(getByTestId("scroller").scrollTop).toBe(300);
    expect(document.activeElement).toBe(getByTestId("section-c"));
    expect(activeLink()).toBe("c");
    await view.rerender(<Doc navigation="replace" />);
    getByTestId("link-e").click();
    await nextFrames(3);
    expect(window.location.hash).toBe("#e");
    expect(window.history.length).toBe(length);
    expect(activeLink()).toBe("e");
  });

  it("follows the URL when its hash changes", async () => {
    await renderStrict(<Doc />);
    window.location.hash = "h";
    await nextFrames(3);
    expect(activeLink()).toBe("h");
    window.location.hash = "g";
    await nextFrames(3);
    expect(activeLink()).toBe("g");
  });

  it("puts the active section in the URL once scrolling rests", async () => {
    await renderStrict(<Doc syncHash />);
    const length = window.history.length;
    await scrollTo(310);
    expect(window.location.hash).toBe("");
    await waitFor(400);
    expect(window.location.hash).toBe("#c");
    expect(window.history.length).toBe(length);
  });

  it("marks the trail of nested items", async () => {
    await renderStrict(
      <ScrollSpy.Root>
        <ScrollSpy.Nav aria-label="On this page">
          <ScrollSpy.List data-testid="outer">
            <ScrollSpy.Item value="guide" data-testid="item-guide">
              <ScrollSpy.Link data-testid="link-guide">Guide</ScrollSpy.Link>
              <ScrollSpy.List data-testid="inner">
                <ScrollSpy.Item value="install"><ScrollSpy.Link data-testid="link-install">Install</ScrollSpy.Link></ScrollSpy.Item>
                <ScrollSpy.Item value="usage"><ScrollSpy.Link data-testid="link-usage">Usage</ScrollSpy.Link></ScrollSpy.Item>
              </ScrollSpy.List>
            </ScrollSpy.Item>
          </ScrollSpy.List>
        </ScrollSpy.Nav>
        <div data-testid="scroller" style={{ height: 300, overflow: "auto" }}>
          <ScrollSpy.Section value="guide" style={{ height: 100 }} />
          <ScrollSpy.Section value="install" style={{ height: 100 }} />
          <ScrollSpy.Section value="usage" style={{ height: 600 }} />
        </div>
      </ScrollSpy.Root>,
    );
    expect(getByTestId("outer").dataset.depth).toBe("0");
    expect(getByTestId("inner").dataset.depth).toBe("1");
    expect(getByTestId("link-usage").dataset.depth).toBe("1");
    expect(getByTestId("link-guide").dataset.activeTrail).toBeUndefined();
    await scrollTo(210);
    expect(activeLink()).toBe("Usage");
    expect(getByTestId("link-guide").dataset.activeTrail).toBe("");
    expect(getByTestId("item-guide").dataset.activeTrail).toBe("");
    expect(getByTestId("link-install").dataset.activeTrail).toBeUndefined();
  });

  it("keeps the active link in a scrolling nav in view and places the indicator on it", async () => {
    await renderStrict(<Doc nav={{ height: 100, overflow: "auto", position: "relative" }} />);
    const nav = getByTestId("nav");
    expect(nav.dataset.active).toBe("");
    expect(nav.style.getPropertyValue("--xlayout-scroll-spy-indicator-top")).toBe("0px");
    expect(nav.style.getPropertyValue("--xlayout-scroll-spy-indicator-height")).toBe("30px");
    await scrollTo(800);
    expect(activeLink()).toBe("h");
    expect(nav.scrollTop).toBe(140);
    expect(nav.style.getPropertyValue("--xlayout-scroll-spy-indicator-top")).toBe("210px");
  });

  it("keeps the active link of a row in view", async () => {
    await renderStrict(
      <ScrollSpy.Root>
        <ScrollSpy.Nav aria-label="Steps" data-testid="nav" style={{ width: 100, overflowX: "auto" }}>
          <ScrollSpy.List style={{ display: "flex", margin: 0, padding: 0, listStyle: "none" }}>
            {VALUES.map(value => (
              <ScrollSpy.Item key={value} value={value} style={{ flexShrink: 0 }}>
                <ScrollSpy.Link style={{ display: "block", width: 60 }}>{value}</ScrollSpy.Link>
              </ScrollSpy.Item>
            ))}
          </ScrollSpy.List>
        </ScrollSpy.Nav>
        <div data-testid="scroller" style={{ height: 400, overflow: "auto" }}>
          {VALUES.map(value => <ScrollSpy.Section key={value} value={value} style={{ height: 150 }} />)}
        </div>
      </ScrollSpy.Root>,
    );
    await scrollTo(800);
    expect(activeLink()).toBe("h");
    // Link h spans 420 to 480 in a nav 100 wide.
    expect(getByTestId("nav").scrollLeft).toBe(380);
  });

  it("can be controlled", async () => {
    const onValueChange = vi.fn();
    await renderStrict(<Doc value="c" onValueChange={onValueChange} />);
    expect(activeLink()).toBe("c");
    expect(onValueChange).toHaveBeenLastCalledWith("a");
    await scrollTo(460);
    expect(onValueChange).toHaveBeenLastCalledWith("d");
    expect(onValueChange).toHaveBeenCalledTimes(2);
    expect(activeLink()).toBe("c");
  });

  it("navigates from code", async () => {
    function Jump(): React.ReactNode {
      const { navigate, value } = ScrollSpy.useScrollSpy();
      return <button type="button" data-testid="jump" onClick={() => navigate("e")}>{value}</button>;
    }
    await renderStrict(<Doc navigation="none"><Jump /></Doc>);
    expect(getByTestId("jump").textContent).toBe("a");
    getByTestId("jump").click();
    await nextFrames(3);
    expect(getByTestId("scroller").scrollTop).toBe(600);
    expect(getByTestId("jump").textContent).toBe("e");
  });

  it("rejects duplicate sections, links outside items and sections in different scrollers", async () => {
    const duplicate = await renderError(
      <ScrollSpy.Root>
        <ScrollSpy.Section value="a" />
        <ScrollSpy.Section value="a" />
      </ScrollSpy.Root>,
    );
    expect(duplicate.message).toContain("already has a ScrollSpy.Section with the value \"a\"");
    const link = await renderError(<ScrollSpy.Root><ScrollSpy.Link>a</ScrollSpy.Link></ScrollSpy.Root>);
    expect(link.message).toContain("`ScrollSpy.Link` must be used within `ScrollSpy.Item`");
    const scrollers = await renderError(
      <ScrollSpy.Root>
        <div style={{ height: 100, overflow: "auto" }}><ScrollSpy.Section value="a" /></div>
        <div style={{ height: 100, overflow: "auto" }}><ScrollSpy.Section value="b" /></div>
      </ScrollSpy.Root>,
    );
    expect(scrollers.message).toContain("must scroll in the same container");
  });
});
