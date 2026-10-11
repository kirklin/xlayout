// @env node
import type * as React from "react";
import process from "node:process";
import { text } from "node:stream/consumers";
import { createElement, use } from "react";
import { prerenderToNodeStream } from "react-dom/static";
import { createFromNodeStream } from "react-server-dom-webpack/client";
import { Page } from "./page.ts";

/** What this script prints: the markup and the client modules a payload made it load. */
export interface Rendered {
  html: string;
  modules: string[];
}

const modules = new Map<string, Promise<unknown>>();

// Flight requires the modules of client components through the bundler's runtime.
Object.assign(globalThis, {
  __webpack_require__(id: string): Promise<unknown> {
    let loading = modules.get(id);
    if (!loading) {
      loading = import(id);
      modules.set(id, loading);
    }
    return loading;
  },
});

/** The page rendered directly, or turned into elements from the Server Components payload on stdin. */
function content(source: string | undefined): React.ReactNode {
  if (source === "page") {
    return createElement(Page);
  }
  if (source === "payload") {
    const payload = createFromNodeStream<React.ReactNode>(process.stdin, { moduleMap: null, serverModuleMap: null, moduleLoading: null });
    const FromPayload = (): React.ReactNode => use(payload);
    return createElement(FromPayload);
  }
  throw new Error(`Render "page" or "payload", not "${source}".`);
}

/** Prints the HTML of the page rendered from the source named by the first argument. */
async function main(): Promise<void> {
  const { prelude } = await prerenderToNodeStream(content(process.argv[2]), {
    onError(error) {
      console.error(error);
      process.exitCode = 1;
    },
  });
  const rendered: Rendered = { html: await text(prelude), modules: [...modules.keys()] };
  process.stdout.write(JSON.stringify(rendered));
}

main();
