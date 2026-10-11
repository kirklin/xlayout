import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { commands } from "./test/commands.ts";

// The page is larger than the tested viewport so the test frame is never scaled.
const contextOptions = { viewport: { width: 1600, height: 1000 } };

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "package",
          environment: "node",
          include: ["test/package/*.test.ts"],
          globalSetup: ["./test/package/build.ts"],
        },
      },
      {
        // Optimizing a dependency first imported during a run reloads the page and fails the file.
        optimizeDeps: { include: ["react-dom/server"] },
        test: {
          name: "browser",
          include: ["src/**/*.test.tsx"],
          setupFiles: ["./test/setup.ts"],
          // Pages of one browser take focus from each other; focus and drag tests need it.
          fileParallelism: false,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({ contextOptions }),
            viewport: { width: 1200, height: 800 },
            instances: [
              { browser: "chromium" },
              {
                browser: "firefox",
                // Firefox would send requests for the local test server through a system proxy.
                provider: playwright({ contextOptions, launchOptions: { firefoxUserPrefs: { "network.proxy.type": 0 } } }),
              },
              { browser: "webkit" },
            ],
            commands,
          },
        },
      },
    ],
  },
});
