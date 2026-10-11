import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
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
