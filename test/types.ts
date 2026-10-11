export type PointerAction
  = | { type: "move"; x: number; y: number; steps?: number }
    | { type: "down"; button?: "left" | "right" | "middle" }
    | { type: "up"; button?: "left" | "right" | "middle" };

export type TouchAction
  = | { type: "start"; x: number; y: number }
    | { type: "move"; x: number; y: number; steps?: number }
    | { type: "end" }
    | { type: "wait"; ms: number };

declare module "vitest/browser" {
  interface BrowserCommands {
    pointer: (actions: PointerAction[]) => Promise<void>;
    touch: (actions: TouchAction[]) => Promise<void>;
  }
}
