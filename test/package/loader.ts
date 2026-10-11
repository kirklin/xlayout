// @env node
import type { LoadHook } from "node:module";
import { load as loadFlight } from "react-server-dom-webpack/node-loader";

export { resolve } from "react-server-dom-webpack/node-loader";

/** Turns modules marked "use client" into client references, reading sources as text as the Flight loader expects. */
export const load: LoadHook = async (url, context, nextLoad) => loadFlight(url, context, async (sourceUrl, sourceContext) => {
  const loaded = await nextLoad(sourceUrl, sourceContext);
  if (loaded.format !== "module" || typeof loaded.source === "string" || loaded.source === undefined) {
    return loaded;
  }
  return { ...loaded, source: new TextDecoder().decode(loaded.source) };
});
