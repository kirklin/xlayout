declare module "react-server-dom-webpack/node-loader" {
  import type { LoadHook, ResolveHook } from "node:module";

  export const resolve: ResolveHook;
  export const load: LoadHook;
}

declare module "react-server-dom-webpack/static" {
  import type { Readable } from "node:stream";
  import type { ReactNode } from "react";

  export interface ClientReferenceEntry {
    id: string;
    chunks: string[];
    name: string;
    /** The module is loaded with `import()`, so requiring it returns a promise. */
    async: boolean;
  }

  export type ClientManifest = Readonly<Record<string, ClientReferenceEntry>>;

  export interface PrerenderOptions {
    onError?: (error: unknown) => void;
  }

  export function prerenderToNodeStream(model: ReactNode, manifest: ClientManifest, options?: PrerenderOptions): Promise<{ prelude: Readable }>;
}

declare module "react-server-dom-webpack/client" {
  import type { Readable } from "node:stream";

  /** Without maps, client references load by the ids the server wrote. */
  export interface ServerConsumerManifest {
    moduleMap: null;
    serverModuleMap: null;
    moduleLoading: null;
  }

  export function createFromNodeStream<T>(stream: Readable, manifest: ServerConsumerManifest): PromiseLike<T>;
}
