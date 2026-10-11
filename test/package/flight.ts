// @env node
import type { ClientManifest, ClientReferenceEntry } from "react-server-dom-webpack/static";
import process from "node:process";
import { createElement } from "react";
import { prerenderToNodeStream } from "react-server-dom-webpack/static";
import { Page } from "./page.ts";

// The loader names each client reference "<module url>#<export>"; the rendering side imports the url.
const manifest: ClientManifest = new Proxy<Record<string, ClientReferenceEntry>>({}, {
  get(_, reference) {
    if (typeof reference !== "string") {
      return undefined;
    }
    const hash = reference.lastIndexOf("#");
    if (hash === -1) {
      throw new Error(`The client reference "${reference}" names no export.`);
    }
    return { id: reference.slice(0, hash), chunks: [], name: reference.slice(hash + 1), async: true };
  },
});

/** Prints the Server Components payload of the page, rendered with the nonce given as the first argument, if any. */
async function main(): Promise<void> {
  const { prelude } = await prerenderToNodeStream(createElement(Page, { nonce: process.argv[2] }), manifest, {
    onError(error) {
      console.error(error);
      process.exitCode = 1;
    },
  });
  prelude.pipe(process.stdout);
}

main();
