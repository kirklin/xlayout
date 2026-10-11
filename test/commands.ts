// @env node
import type { CDPSession, Frame, Page } from "playwright";
import type { BrowserCommand, BrowserCommandContext } from "vitest/node";
import type { PointerAction, TouchAction } from "./types.ts";

/** One DevTools session per page, so a touch can go on over several commands. */
const touchSessions = new WeakMap<Page, Promise<CDPSession>>();
/** Where the finger of the touch going on in each page is, in page coordinates. */
const lastTouch = new WeakMap<Page, [number, number]>();
/** When the finger of each page last went down, moved or lifted, in milliseconds since the epoch. */
const lastTouchTime = new WeakMap<Page, number>();

/** Milliseconds between the events of a moving finger: touch screens report it every frame. */
const TOUCH_INTERVAL = 16;

function touchSessionOf(page: Page): Promise<CDPSession> {
  let session = touchSessions.get(page);
  if (!session) {
    session = page.context().newCDPSession(page);
    touchSessions.set(page, session);
  }
  return session;
}

/** Converts client coordinates of the test page to coordinates of the browser page that holds it. */
async function pageCoordinates(context: BrowserCommandContext): Promise<(x: number, y: number) => [number, number]> {
  const frame: Frame = await context.frame();
  const frameElement = await frame.frameElement();
  const box = await frameElement.boundingBox();
  if (!box) {
    throw new Error("The test iframe is not visible.");
  }
  const innerWidth = await frame.evaluate(() => window.innerWidth);
  const scale = box.width / innerWidth;
  return (x, y) => [box.x + x * scale, box.y + y * scale];
}

/**
 * Replays pointer actions with the real mouse of the browser, so pointer capture, cursor
 * hit testing and event ordering behave as they do for users. Coordinates are client
 * coordinates of the test page.
 */
export const pointer: BrowserCommand<[actions: PointerAction[]]> = async (context, actions) => {
  if (context.provider.name !== "playwright") {
    throw new Error(`The pointer command needs the playwright provider, not ${context.provider.name}.`);
  }
  const toPage = await pageCoordinates(context);
  const { mouse } = context.page;

  for (const action of actions) {
    switch (action.type) {
      case "move": {
        const [x, y] = toPage(action.x, action.y);
        await mouse.move(x, y, { steps: action.steps ?? 1 });
        break;
      }
      case "down": {
        await mouse.down({ button: action.button ?? "left" });
        break;
      }
      case "up": {
        await mouse.up({ button: action.button ?? "left" });
        break;
      }
      default: {
        action satisfies never;
      }
    }
  }
};

/**
 * Replays a one finger touch as the touch screen of the browser would send it, so touch-action,
 * scrolling and the pointer events of touches behave as they do for users. Only Chromium takes
 * touches from outside, through the DevTools protocol. Coordinates are client coordinates of
 * the test page.
 */
export const touch: BrowserCommand<[actions: TouchAction[]]> = async (context, actions) => {
  if (context.provider.name !== "playwright") {
    throw new Error(`The touch command needs the playwright provider, not ${context.provider.name}.`);
  }
  const { page } = context;
  const browserName = page.context().browser()?.browserType().name();
  if (browserName !== "chromium") {
    throw new Error(`Touches are replayed through the Chrome DevTools protocol, which ${browserName} does not have.`);
  }
  const toPage = await pageCoordinates(context);
  const session = await touchSessionOf(page);
  // Every event carries the time the finger got there, a frame after its last event, so how fast
  // the finger moves does not depend on how long the browser takes over each event. The finger
  // rests between commands, so the first event of one comes now at the earliest.
  let time = Math.max(Date.now(), (lastTouchTime.get(page) ?? 0) + TOUCH_INTERVAL);
  const send = async (type: "touchStart" | "touchMove" | "touchEnd", point: [number, number] | null): Promise<void> => {
    // An event never comes before the time it carries.
    const early = time - Date.now();
    if (early > 0) {
      await page.waitForTimeout(early);
    }
    await session.send("Input.dispatchTouchEvent", {
      type,
      // A small contact area keeps the browser's touch adjustment from moving the touch onto a
      // nearby target, so tests see where the library takes a touch.
      touchPoints: point ? [{ x: point[0], y: point[1], id: 1, radiusX: 1, radiusY: 1, force: 1 }] : [],
      timestamp: time / 1000,
    });
    lastTouchTime.set(page, time);
    time += TOUCH_INTERVAL;
  };
  for (const action of actions) {
    switch (action.type) {
      case "start": {
        lastTouch.set(page, toPage(action.x, action.y));
        await send("touchStart", lastTouch.get(page)!);
        break;
      }
      case "move": {
        const target = toPage(action.x, action.y);
        const steps = action.steps ?? 1;
        const from = lastTouch.get(page);
        if (!from) {
          throw new Error("A touch moves only after it started.");
        }
        for (let step = 1; step <= steps; step++) {
          const point: [number, number] = [from[0] + ((target[0] - from[0]) * step) / steps, from[1] + ((target[1] - from[1]) * step) / steps];
          lastTouch.set(page, point);
          await send("touchMove", point);
        }
        break;
      }
      case "end": {
        lastTouch.delete(page);
        await send("touchEnd", null);
        break;
      }
      case "wait": {
        await page.waitForTimeout(action.ms);
        time += action.ms;
        break;
      }
      default: {
        action satisfies never;
      }
    }
  }
};

export const commands = { pointer, touch };
