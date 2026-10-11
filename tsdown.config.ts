import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    "dock": "src/dock/index.ts",
    "grid": "src/grid/index.ts",
    "index": "src/index.ts",
    "masonry": "src/masonry/index.ts",
    "overflow": "src/overflow/index.ts",
    "scroll-spy": "src/scroll-spy/index.ts",
    "shell": "src/shell/index.ts",
    "splitter": "src/splitter/index.ts",
    "sticky": "src/sticky/index.ts",
  },
  format: ["esm"],
  platform: "neutral",
  unbundle: true,
  deps: { neverBundle: [/^xlayout\//] },
  dts: true,
  exports: true,
  publint: true,
  attw: { profile: "esm-only" },
});
