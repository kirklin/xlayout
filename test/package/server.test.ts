// @env node
import type { Rendered } from "./html.ts";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const DIRECTORY = fileURLToPath(new URL(".", import.meta.url));

/** Runs a script of this directory with the current Node.js and returns what it prints. */
function node(args: string[], input?: string): string {
  const result = spawnSync(process.execPath, args, { cwd: DIRECTORY, input, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`node ${args.join(" ")} exited with ${result.status}:\n${result.stderr}`);
  }
  return result.stdout;
}

function render(source: "page" | "payload", payload?: string): Rendered {
  return JSON.parse(node(["html.ts", source], payload)) as Rendered;
}

/** The path of a module url within the package. */
function packagePath(url: string): string {
  return url.slice(url.lastIndexOf("/dist/") + 1);
}

describe("the built package on the server", () => {
  it("renders every component to HTML", () => {
    const { html, modules } = render("page");
    expect(modules).toEqual([]);
    // The sidebar shows the state its cookie carries.
    expect(html).toMatch(/<div id="start"[^>]* data-state="collapsed"[^>]*--xlayout-shell-sidebar-width:280px/);
    expect(html).toContain("<a href=\"#splitter\" aria-current=\"true\"");
    expect(html).toContain("<div id=\"list\" data-state=\"expanded\" data-orientation=\"horizontal\" style=\"flex-grow:0;flex-shrink:1;flex-basis:30%");
    expect(html).toContain("[data-xlayout-grid-item=\"chart\"]{--xlayout-grid-x:0;--xlayout-grid-y:0;--xlayout-grid-w:3;--xlayout-grid-h:2}");
    expect(html).toMatch(/role="separator"[^>]* aria-valuenow="30" data-dock-handle=""/);
    expect(html.match(/<span data-dock-tab-title="">(\w+)<\/span>/g)).toHaveLength(3);
    expect(html).toContain("grid-template-columns:repeat(3, minmax(0, 1fr))");
    expect(html).toContain("<div data-state=\"hidden\" inert=\"\"");
    expect(html).toContain("<div data-side=\"bottom\" style=\"position:sticky;overflow-anchor:none;bottom:0px\">Actions</div>");
  });

  it("renders the components as client components of Server Components, which call its helpers", () => {
    const payload = node(["--conditions=react-server", "--import", "./register.ts", "flight.ts"]);
    const fromPayload = render("payload", payload);
    expect(fromPayload.modules.map(packagePath).sort()).toEqual([
      "dist/dock/dock.js",
      "dist/grid/grid.js",
      "dist/masonry/masonry.js",
      "dist/overflow/overflow.js",
      "dist/scroll-spy/scroll-spy.js",
      "dist/shell/shell.js",
      "dist/splitter/splitter.js",
      "dist/sticky/sticky.js",
    ]);
    expect(fromPayload.html).toBe(render("page").html);
  });
});
