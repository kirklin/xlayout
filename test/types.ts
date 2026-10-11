export type PointerAction
  = | { type: "move"; x: number; y: number; steps?: number }
    | { type: "down"; button?: "left" | "right" | "middle" }
    | { type: "up"; button?: "left" | "right" | "middle" };

declare module "vitest/browser" {
  interface BrowserCommands {
    pointer: (actions: PointerAction[]) => Promise<void>;
  }
}
