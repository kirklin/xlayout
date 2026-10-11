import type { OverflowProps, OverflowState } from "./index";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { nextFrames } from "../../test/pointer";
import { getByTestId, renderError, renderStrict, widthOf } from "../../test/render";
import * as Overflow from "./index";

const ITEM_STYLE: React.CSSProperties = { width: 100, height: 30 };

function HiddenList(): React.ReactNode {
  const overflow = Overflow.useOverflow();
  return <span data-testid="hidden">{overflow.hidden.join(",")}</span>;
}

interface ToolbarItem {
  value: string;
  priority?: number;
  pinned?: boolean;
  group?: string;
  width?: number;
}

interface ToolbarProps extends Partial<OverflowProps> {
  width: number;
  items?: ToolbarItem[];
  dividers?: boolean;
  dividerStyle?: React.CSSProperties;
  indicatorStyle?: React.CSSProperties;
}

function Toolbar({ width, items, dividers = false, dividerStyle, indicatorStyle, ...rootProps }: ToolbarProps): React.ReactNode {
  const list = items ?? [{ value: "a" }, { value: "b" }, { value: "c" }];
  return (
    <Overflow.Root data-testid="root" style={{ width, gap: 10 }} {...rootProps}>
      {list.map((item, index) => {
        const previousGroup = list[index - 1]?.group;
        return (
          <React.Fragment key={item.value}>
            {dividers && previousGroup !== undefined && previousGroup !== item.group && (
              <Overflow.Divider group={previousGroup} data-testid={`divider-${previousGroup}`} style={{ width: 20, height: 30, ...dividerStyle }} />
            )}
            <Overflow.Item
              value={item.value}
              priority={item.priority}
              pinned={item.pinned}
              group={item.group}
              data-testid={item.value}
              style={{ ...ITEM_STYLE, width: item.width ?? 100 }}
            >
              <button type="button" data-testid={`${item.value}-button`}>{item.value}</button>
            </Overflow.Item>
          </React.Fragment>
        );
      })}
      <Overflow.Indicator data-testid="indicator" style={{ width: 40, height: 30, ...indicatorStyle }}>
        <button type="button" data-testid="more">More</button>
        <HiddenList />
      </Overflow.Indicator>
    </Overflow.Root>
  );
}

function stateOf(testId: string): string | undefined {
  return getByTestId(testId).dataset.state;
}

function statesOf(...testIds: string[]): (string | undefined)[] {
  return testIds.map(stateOf);
}

describe("overflow", () => {
  it("shows everything and hides the indicator when items fit", async () => {
    await renderStrict(<Toolbar width={340} />);
    expect(statesOf("a", "b", "c")).toEqual(["visible", "visible", "visible"]);
    expect(stateOf("indicator")).toBe("hidden");
    expect(getByTestId("indicator").inert).toBe(true);
    expect(getByTestId("root").dataset.overflowing).toBeUndefined();
  });

  it("hides items from the end and makes them unreachable", async () => {
    await renderStrict(<Toolbar width={300} />);
    expect(statesOf("a", "b", "c")).toEqual(["visible", "visible", "hidden"]);
    const hidden = getByTestId("c");
    expect(hidden.inert).toBe(true);
    expect(getComputedStyle(hidden).visibility).toBe("hidden");
    expect(getComputedStyle(hidden).position).toBe("absolute");
    expect(stateOf("indicator")).toBe("visible");
    expect(getByTestId("hidden").textContent).toBe("c");
    expect(getByTestId("root").dataset.overflowing).toBe("");
    expect(getByTestId("root").style.getPropertyValue("--xlayout-overflow-hidden-count")).toBe("1");
  });

  it("hides lower priorities first, keeps pinned items and can start from the start", async () => {
    const view = await renderStrict(<Toolbar width={300} items={[{ value: "a" }, { value: "b", priority: -1 }, { value: "c", priority: 1 }]} />);
    expect(statesOf("a", "b", "c")).toEqual(["visible", "hidden", "visible"]);
    await view.rerender(<Toolbar width={150} items={[{ value: "a" }, { value: "b" }, { value: "c", pinned: true }]} />);
    expect(statesOf("a", "b", "c")).toEqual(["hidden", "hidden", "visible"]);
    expect(getByTestId("c").dataset.pinned).toBe("");
    await view.rerender(<Toolbar width={300} overflowDirection="start" />);
    expect(statesOf("a", "b", "c")).toEqual(["hidden", "visible", "visible"]);
  });

  it("follows the root and the items as they resize", async () => {
    const view = await renderStrict(<Toolbar width={340} />);
    expect(stateOf("c")).toBe("visible");
    await view.rerender(<Toolbar width={200} />);
    await nextFrames();
    expect(statesOf("a", "b", "c")).toEqual(["visible", "hidden", "hidden"]);
    await view.rerender(<Toolbar width={340} />);
    await nextFrames();
    expect(statesOf("a", "b", "c")).toEqual(["visible", "visible", "visible"]);
    await view.rerender(<Toolbar width={340} items={[{ value: "a", width: 160 }, { value: "b" }, { value: "c" }]} />);
    await nextFrames();
    expect(statesOf("a", "b", "c")).toEqual(["visible", "visible", "hidden"]);
  });

  it("fills the space a flex row leaves it", async () => {
    await renderStrict(
      <div style={{ display: "flex", width: 400 }}>
        <div style={{ width: 100, flexShrink: 0 }} />
        <Overflow.Root style={{ flex: 1, gap: 10 }}>
          {["a", "b", "c"].map(value => <Overflow.Item key={value} value={value} data-testid={value} style={ITEM_STYLE} />)}
          <Overflow.Indicator style={{ width: 40 }} />
        </Overflow.Root>
      </div>,
    );
    expect(statesOf("a", "b", "c")).toEqual(["visible", "visible", "hidden"]);
  });

  it("hides a divider together with the last item of its group", async () => {
    const items = [{ value: "a", group: "one" }, { value: "b", group: "two" }, { value: "c", group: "two" }];
    const view = await renderStrict(<Toolbar width={300} items={items} dividers />);
    expect(stateOf("divider-one")).toBe("visible");
    expect(getByTestId("divider-one").dataset.groupState).toBe("visible");
    await view.rerender(<Toolbar width={200} items={items} dividers />);
    await nextFrames();
    expect(statesOf("a", "b", "c")).toEqual(["visible", "hidden", "hidden"]);
    expect(stateOf("divider-one")).toBe("visible");
    await view.rerender(<Toolbar width={60} items={items} dividers />);
    await nextFrames();
    expect(statesOf("a", "b", "c")).toEqual(["hidden", "hidden", "hidden"]);
    expect(stateOf("divider-one")).toBe("hidden");
  });

  it("counts the margins of parts", async () => {
    const items = [{ value: "a", group: "one" }, { value: "b", group: "two" }];
    const view = await renderStrict(<Toolbar width={250} items={items} dividers dividerStyle={{ marginInline: 5 }} />);
    expect(statesOf("a", "b")).toEqual(["visible", "visible"]);
    await view.rerender(<Toolbar width={245} items={items} dividers dividerStyle={{ marginInline: 5 }} />);
    await nextFrames();
    expect(statesOf("a", "b")).toEqual(["visible", "hidden"]);
  });

  it("lets auto margins take the space that is left over", async () => {
    const items = ["a", "b", "c", "d"].map(value => ({ value }));
    const indicatorStyle = { marginInlineStart: "auto" };
    const view = await renderStrict(<Toolbar width={300} items={items} indicatorStyle={indicatorStyle} />);
    expect(statesOf("a", "b", "c", "d")).toEqual(["visible", "visible", "hidden", "hidden"]);
    expect(getByTestId("indicator").getBoundingClientRect().right).toBeCloseTo(getByTestId("root").getBoundingClientRect().right);
    await view.rerender(<Toolbar width={380} items={items} indicatorStyle={indicatorStyle} />);
    await nextFrames();
    expect(statesOf("a", "b", "c", "d")).toEqual(["visible", "visible", "visible", "hidden"]);
    await view.rerender(<Toolbar width={430} items={items} indicatorStyle={indicatorStyle} />);
    await nextFrames();
    expect(statesOf("a", "b", "c", "d")).toEqual(["visible", "visible", "visible", "visible"]);
  });

  it("moves focus to the indicator before hiding the focused item, and back when the indicator hides", async () => {
    const view = await renderStrict(<Toolbar width={340} />);
    getByTestId("c-button").focus();
    await view.rerender(<Toolbar width={300} />);
    await nextFrames();
    expect(stateOf("c")).toBe("hidden");
    expect(document.activeElement).toBe(getByTestId("more"));
    await view.rerender(<Toolbar width={340} />);
    await nextFrames();
    expect(stateOf("indicator")).toBe("hidden");
    expect(document.activeElement).toBe(getByTestId("c-button"));
  });

  it("moves focus to the previous item when the indicator cannot take it", async () => {
    function Bar({ width }: { width: number }): React.ReactNode {
      return (
        <Overflow.Root style={{ width, gap: 10 }}>
          {["a", "b", "c"].map(value => (
            <Overflow.Item key={value} value={value} data-testid={value} style={ITEM_STYLE}>
              <button type="button" data-testid={`${value}-button`}>{value}</button>
            </Overflow.Item>
          ))}
          <Overflow.Indicator style={{ width: 40 }}>…</Overflow.Indicator>
        </Overflow.Root>
      );
    }
    const view = await renderStrict(<Bar width={340} />);
    getByTestId("c-button").focus();
    await view.rerender(<Bar width={300} />);
    await nextFrames();
    expect(stateOf("c")).toBe("hidden");
    expect(document.activeElement).toBe(getByTestId("b-button"));
  });

  it("reports each change once", async () => {
    const onOverflowChange = vi.fn();
    const view = await renderStrict(<Toolbar width={340} onOverflowChange={onOverflowChange} />);
    expect(onOverflowChange).toHaveBeenCalledOnce();
    expect(onOverflowChange).toHaveBeenLastCalledWith({ hidden: [], visible: ["a", "b", "c"], groups: {} } satisfies OverflowState);
    await view.rerender(<Toolbar width={200} onOverflowChange={onOverflowChange} />);
    await nextFrames();
    expect(onOverflowChange).toHaveBeenCalledTimes(2);
    expect(onOverflowChange).toHaveBeenLastCalledWith({ hidden: ["b", "c"], visible: ["a"], groups: {} } satisfies OverflowState);
  });

  it("follows items that React moves", async () => {
    const view = await renderStrict(<Toolbar width={300} />);
    expect(getByTestId("hidden").textContent).toBe("c");
    await view.rerender(<Toolbar width={300} items={[{ value: "c" }, { value: "a" }, { value: "b" }]} />);
    await nextFrames();
    expect(statesOf("c", "a", "b")).toEqual(["visible", "visible", "hidden"]);
    expect(getByTestId("hidden").textContent).toBe("b");
  });

  it("settles before painting when the indicator grows with the hidden count", async () => {
    function Count(): React.ReactNode {
      const { hiddenCount } = Overflow.useOverflow();
      return <span style={{ display: "inline-block", width: 20 + 20 * hiddenCount }} />;
    }
    await renderStrict(
      <Overflow.Root data-testid="root" style={{ width: 200 }}>
        {["a", "b", "c", "d", "e"].map(value => <Overflow.Item key={value} value={value} data-testid={value} style={{ width: 50 }} />)}
        <Overflow.Indicator data-testid="indicator"><Count /></Overflow.Indicator>
      </Overflow.Root>,
    );
    expect(statesOf("a", "b", "c", "d", "e")).toEqual(["visible", "visible", "hidden", "hidden", "hidden"]);
    expect(widthOf(getByTestId("indicator"))).toBe(80);
  });

  it("measures a hidden item at the width its content asks for", async () => {
    await renderStrict(
      <Overflow.Root style={{ width: 150 }}>
        <Overflow.Item value="wide" data-testid="wide">
          <span style={{ display: "inline-block", width: 100 }} />
          {" "}
          <span style={{ display: "inline-block", width: 100 }} />
        </Overflow.Item>
        <Overflow.Indicator data-testid="indicator" style={{ width: 40 }} />
      </Overflow.Root>,
    );
    await nextFrames(4);
    expect(stateOf("wide")).toBe("hidden");
    expect(widthOf(getByTestId("wide"))).toBeGreaterThan(200);
    expect(stateOf("indicator")).toBe("visible");
  });

  it("stacks vertically", async () => {
    await renderStrict(
      <Overflow.Root orientation="vertical" style={{ height: 100 }}>
        {["a", "b", "c"].map(value => (
          <Overflow.Item key={value} value={value} data-testid={value} style={{ height: 40 }} />
        ))}
        <Overflow.Indicator data-testid="indicator" style={{ height: 20 }} />
      </Overflow.Root>,
    );
    expect(statesOf("a", "b", "c")).toEqual(["visible", "visible", "hidden"]);
  });

  it("allows positioned content and display: contents wrappers on the line", async () => {
    await renderStrict(
      <Overflow.Root style={{ width: 300, gap: 10 }}>
        <span style={{ position: "absolute" }}>Badge</span>
        <div style={{ display: "contents" }}>
          {["a", "b", "c"].map(value => <Overflow.Item key={value} value={value} data-testid={value} style={ITEM_STYLE} />)}
        </div>
        <Overflow.Indicator style={{ width: 40 }} />
      </Overflow.Root>,
    );
    expect(statesOf("a", "b", "c")).toEqual(["visible", "visible", "hidden"]);
  });

  it("rejects other content on the line", async () => {
    const element = await renderError(
      <Overflow.Root style={{ width: 300 }}>
        <span>Title</span>
        <Overflow.Item value="a" style={ITEM_STYLE} />
      </Overflow.Root>,
    );
    expect(element.message).toContain("only lays out its parts");
    const text = await renderError(
      <Overflow.Root style={{ width: 300 }}>
        Title
        <Overflow.Item value="a" style={ITEM_STYLE} />
      </Overflow.Root>,
    );
    expect(text.message).toContain("only lays out its parts");
  });

  it("rejects parts that grow or shrink", async () => {
    const error = await renderError(
      <Overflow.Root style={{ width: 300 }}>
        <Overflow.Item value="a" style={{ flexGrow: 1 }} />
      </Overflow.Root>,
    );
    expect(error.message).toContain("must not grow, shrink or set flex-basis");
  });

  it("rejects a root that takes its size from its items", async () => {
    const horizontal = await renderError(
      <div style={{ display: "flex", width: 280 }}>
        <Overflow.Root style={{ gap: 10 }}>
          {["a", "b", "c"].map(value => <Overflow.Item key={value} value={value} style={ITEM_STYLE} />)}
          <Overflow.Indicator style={{ width: 40 }} />
        </Overflow.Root>
      </div>,
    );
    expect(horizontal.message).toContain("takes its width from its items");
    const vertical = await renderError(
      <Overflow.Root orientation="vertical">
        {["a", "b", "c"].map(value => <Overflow.Item key={value} value={value} style={{ height: 40 }} />)}
      </Overflow.Root>,
    );
    expect(vertical.message).toContain("takes its height from its items");
  });

  it("rejects duplicate values", async () => {
    const error = await renderError(
      <Overflow.Root style={{ width: 300 }}>
        <Overflow.Item value="a" />
        <Overflow.Item value="a" />
      </Overflow.Root>,
    );
    expect(error.message).toContain("already has an item with the value \"a\"");
  });
});
