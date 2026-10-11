import type { LucideIcon } from "lucide-react";
import type { DockGroupRenderProps, DockLayout, DockPanelDefinition, DockTabRenderProps } from "xlayout/dock";
import { AppWindow, FileCode2, FileText, Folder, ListTree, Maximize2, Minimize2, PanelBottom, PictureInPicture2, RotateCcw, Search, SquareTerminal, X } from "lucide-react";
import * as React from "react";
import { Dock } from "xlayout";
import { Button, Demo, Page, Readout } from "~/components/demo";
import { cn } from "~/lib/cn";

const control = cn(
  "inline-flex size-7 items-center justify-center rounded-md text-zinc-500 outline-none",
  "hover:bg-zinc-200/70 hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-blue-500",
  "dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
);

const FILES = ["app.tsx", "dock.tsx", "grid.tsx", "masonry.tsx", "overflow.tsx", "shell.tsx", "splitter.tsx", "sticky.tsx"];

function Explorer(): React.ReactNode {
  return (
    <ul className="flex flex-col gap-0.5 p-2 text-sm">
      {FILES.map(file => (
        <li key={file} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800/60">
          <FileCode2 className="size-3.5 shrink-0 text-zinc-400" />
          {file}
        </li>
      ))}
    </ul>
  );
}

function SearchPanel(): React.ReactNode {
  const [query, setQuery] = React.useState("");
  const matches = FILES.filter(file => query !== "" && file.includes(query));
  return (
    <div className="flex flex-col gap-2 p-3 text-sm">
      <input
        value={query}
        onChange={event => setQuery(event.target.value)}
        placeholder="Search files"
        aria-label="Search files"
        className="h-8 rounded-md border border-zinc-200 bg-white px-2 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-zinc-800 dark:bg-zinc-900"
      />
      <span className="text-xs text-zinc-500">{query === "" ? "Type to search; the text stays when the panel moves." : `${matches.length} found`}</span>
      {matches.map(file => <span key={file}>{file}</span>)}
    </div>
  );
}

function Code({ text }: { text: string }): React.ReactNode {
  return <pre className="p-4 font-mono text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">{text}</pre>;
}

function Terminal(): React.ReactNode {
  const [lines, setLines] = React.useState([{ id: 0, text: "$ pnpm play" }, { id: 1, text: "  VITE ready in 312 ms" }]);
  return (
    <div className="flex h-full flex-col bg-zinc-950 font-mono text-xs text-zinc-300">
      <div className="flex-1 overflow-auto p-3">
        {lines.map(line => <div key={line.id}>{line.text}</div>)}
      </div>
      <button
        type="button"
        onClick={() => setLines(current => [...current, { id: current.length, text: `$ echo ${current.length}` }, { id: current.length + 1, text: `  ${current.length}` }])}
        className="m-2 self-start rounded border border-zinc-700 px-2 py-1 text-zinc-300 hover:bg-zinc-800"
      >
        Run a command
      </button>
    </div>
  );
}

const CLOCK = `<!doctype html><body style="margin:0;display:grid;place-items:center;height:100vh;font:600 28px system-ui;color:#2563eb;background:#eff6ff">
<div id="time"></div><script>const tick=()=>document.getElementById("time").textContent=new Date().toLocaleTimeString();tick();setInterval(tick,1000)</script></body>`;

function Preview(): React.ReactNode {
  const [loaded] = React.useState(() => new Date().toLocaleTimeString());
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-200 px-3 py-1.5 text-xs text-zinc-500 dark:border-zinc-800">{`Frame loaded at ${loaded}; it keeps running as the panel moves.`}</div>
      <iframe title="Clock" srcDoc={CLOCK} sandbox="allow-scripts" className="w-full flex-1 border-0" />
    </div>
  );
}

const ICONS: Record<string, LucideIcon> = {
  explorer: Folder,
  search: Search,
  outline: ListTree,
  app: FileCode2,
  readme: FileText,
  preview: AppWindow,
  terminal: SquareTerminal,
};

const PANELS: Record<string, DockPanelDefinition> = {
  explorer: { title: "Explorer", content: <Explorer />, closable: false },
  search: { title: "Search", content: <SearchPanel /> },
  outline: { title: "Outline", content: <Code text={"Dock\n  Root\n  Group\n  Tab\n  Split"} />, render: "whenVisible" },
  app: { title: "app.tsx", content: <Code text={"<Dock.Root\n  panels={panels}\n  layout={layout}\n  onLayoutChange={setLayout}\n/>"} /> },
  readme: { title: "README.md", content: <Code text={"# Workbench\n\nDrag tabs between groups, to the edges of a group or of the dock, or out of it to float."} /> },
  preview: { title: "Preview", content: <Preview />, render: "overlay" },
  terminal: { title: "Terminal", content: <Terminal /> },
};

const INITIAL: DockLayout = Dock.createDockLayout({
  root: {
    orientation: "horizontal",
    sizes: [0.22, 0.48, 0.3],
    children: [
      { orientation: "vertical", sizes: [0.6, 0.4], children: [{ panels: ["explorer", "search"] }, { panels: ["outline"] }] },
      { orientation: "vertical", sizes: [0.65, 0.35], children: [{ panels: ["app", "readme"] }, { panels: ["terminal"] }] },
      { panels: ["preview"] },
    ],
  },
});

function TabContent({ panel, title, closable, close }: DockTabRenderProps): React.ReactNode {
  const Icon = ICONS[panel] ?? FileText;
  return (
    <>
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate">{title}</span>
      {closable && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Close ${title}`}
          onPointerDown={event => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            close();
          }}
          className="-me-1.5 inline-flex size-5 items-center justify-center rounded text-zinc-400 hover:bg-zinc-200 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        >
          <X className="size-3" />
        </button>
      )}
    </>
  );
}

function GroupControls({ group, place, active, maximized, api }: DockGroupRenderProps): React.ReactNode {
  return (
    <div className="flex items-center gap-0.5 px-1">
      {place === "main" && (
        <button type="button" aria-label={maximized ? "Restore" : "Maximize"} onClick={() => api.maximize(maximized ? null : group)} className={control}>
          {maximized ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
        </button>
      )}
      {place === "main" && !maximized && (
        <button type="button" aria-label="Float" onClick={() => api.float(active)} className={control}>
          <PictureInPicture2 className="size-3.5" />
        </button>
      )}
      {place !== "popout" && (
        <button type="button" aria-label="Open in a window" onClick={() => api.popout(group)} className={control}>
          <AppWindow className="size-3.5" />
        </button>
      )}
      {place !== "main" && (
        <button type="button" aria-label="Dock" onClick={() => api.dock(group)} className={control}>
          <PanelBottom className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function describe(layout: DockLayout): string {
  const count = (node: DockLayout["root"]): number => (!node ? 0 : node.type === "group" ? 1 : node.children.reduce((sum, child) => sum + count(child), 0));
  return `${count(layout.root)} docked groups · ${layout.floating.length} floating · ${layout.popouts.length} in windows${layout.maximized ? " · maximized" : ""}`;
}

function WorkbenchDemo(): React.ReactNode {
  const [layout, setLayout] = React.useState(INITIAL);
  return (
    <Demo
      title="Workbench"
      description="Drag a tab onto other tabs, near an edge of a group to split it, past an edge of the dock to dock along it, or out of the dock to float. Drag a floating group by its header, with Shift to dock it. On a focused tab, Alt with Shift and M picks a place with the arrow keys. The preview's frame keeps ticking wherever its panel goes."
      actions={(
        <Button onClick={() => setLayout(INITIAL)}>
          <RotateCcw className="size-4" />
          Reset
        </Button>
      )}
    >
      <Dock.Root
        panels={PANELS}
        layout={layout}
        onLayoutChange={setLayout}
        renderTab={tab => <TabContent {...tab} />}
        renderGroupControls={group => <GroupControls {...group} />}
        handleLabel="Resize groups"
        className="workbench h-[520px]"
      />
      <Readout>{describe(layout)}</Readout>
    </Demo>
  );
}

export function DockPage(): React.ReactNode {
  return (
    <Page
      title="Dock"
      description="Panels in tab groups that split the main surface, float above it or open in windows of their own. The layout is plain data, and panel content keeps its state wherever the panel goes."
    >
      <WorkbenchDemo />
    </Page>
  );
}
