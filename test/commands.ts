// @env node
import type { BrowserCommand } from "vitest/node";
import type { PointerAction } from "./types.ts";

/**
 * Replays pointer actions with the real mouse of the browser, so pointer capture, cursor
 * hit testing and event ordering behave as they do for users. Coordinates are client
 * coordinates of the test page.
 */
export const pointer: BrowserCommand<[actions: PointerAction[]]> = async (context, actions) => {
  if (context.provider.name !== "playwright") {
    throw new Error(`The pointer command needs the playwright provider, not ${context.provider.name}.`);
  }
  const frame = await context.frame();
  const frameElement = await frame.frameElement();
  const box = await frameElement.boundingBox();
  if (!box) {
    throw new Error("The test iframe is not visible.");
  }
  const innerWidth = await frame.evaluate(() => window.innerWidth);
  const scale = box.width / innerWidth;
  const toPage = (x: number, y: number): [number, number] => [box.x + x * scale, box.y + y * scale];
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

export const commands = { pointer };
