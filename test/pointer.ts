// @env browser
import type { PointerAction } from "./types";
import { commands } from "vitest/browser";

export interface DragOptions {
  /** Where on the element the pointer goes down, as a fraction of its size. */
  from?: { x: number; y: number };
  /** Number of intermediate pointer moves. */
  steps?: number;
  /** Release the pointer at the end; `false` leaves it pressed for further moves. */
  release?: boolean;
}

export function centerOf(element: Element): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** Presses the real mouse on `element` and moves it by `deltaX` and `deltaY` pixels. */
export async function drag(element: Element, deltaX: number, deltaY: number, options: DragOptions = {}): Promise<void> {
  const rect = element.getBoundingClientRect();
  const from = options.from ?? { x: 0.5, y: 0.5 };
  const startX = rect.left + rect.width * from.x;
  const startY = rect.top + rect.height * from.y;
  const actions: PointerAction[] = [
    { type: "move", x: startX, y: startY },
    { type: "down" },
    { type: "move", x: startX + deltaX, y: startY + deltaY, steps: options.steps ?? 8 },
  ];
  if (options.release ?? true) {
    actions.push({ type: "up" });
  }
  await commands.pointer(actions);
}

export interface TouchDragOptions {
  /** Milliseconds the finger rests where it went down before it moves. */
  hold?: number;
  /** Number of intermediate touch moves. */
  steps?: number;
  /** Keep the finger down at the end; `false` lifts it. */
  release?: boolean;
}

/** Puts a finger down at the client point `from` and moves it by `deltaX` and `deltaY` pixels. */
export async function touchDrag(from: { x: number; y: number }, deltaX: number, deltaY: number, options: TouchDragOptions = {}): Promise<void> {
  await commands.touch([
    { type: "start", x: from.x, y: from.y },
    ...(options.hold ? [{ type: "wait" as const, ms: options.hold }] : []),
    { type: "move", x: from.x + deltaX, y: from.y + deltaY, steps: options.steps ?? 8 },
    ...(options.release ?? true ? [{ type: "end" as const }] : []),
  ]);
}

export async function movePointer(x: number, y: number, steps = 8): Promise<void> {
  await commands.pointer([{ type: "move", x, y, steps }]);
}

export async function releasePointer(): Promise<void> {
  await commands.pointer([{ type: "up" }]);
}

/** Waits until React and the browser have flushed pending frames. */
export async function nextFrames(count = 2): Promise<void> {
  for (let index = 0; index < count; index++) {
    await new Promise(resolve => requestAnimationFrame(resolve));
  }
}

/** Waits for React to render and then for every animation to finish, so boxes are where the layout put them. */
export async function settle(): Promise<void> {
  await nextFrames();
  await Promise.allSettled(document.getAnimations().map(animation => animation.finished));
  await nextFrames();
}
