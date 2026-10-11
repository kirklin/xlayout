import type { SplitterActions, SplitterLayout } from "xlayout/splitter";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, FileCode2, Folder, ListTree, SquareTerminal } from "lucide-react";
import * as React from "react";
import { Splitter } from "xlayout";
import { Button, Demo, Page, Readout } from "~/components/demo";
import { cn } from "~/lib/cn";

function Handle({ className, ...props }: Splitter.SplitterHandleProps): React.ReactNode {
  return (
    <Splitter.Handle
      className={cn(
        "relative z-10 bg-zinc-200 outline-none transition-colors dark:bg-zinc-800",
        "data-[orientation=vertical]:w-px data-[orientation=horizontal]:h-px",
        "after:absolute data-[orientation=vertical]:after:inset-y-0 data-[orientation=vertical]:after:-inset-x-1.5",
        "data-[orientation=horizontal]:after:inset-x-0 data-[orientation=horizontal]:after:-inset-y-1.5",
        "hover:bg-blue-400 focus-visible:bg-blue-500 data-[dragging]:bg-blue-500",
        className,
      )}
      {...props}
    />
  );
}

function PanelHeader({ icon, title, children }: { icon: React.ReactNode; title: string; children?: React.ReactNode }): React.ReactNode {
  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-zinc-200 px-3 text-xs font-medium text-zinc-500 uppercase dark:border-zinc-800 dark:text-zinc-400">
      {icon}
      <span className="truncate">{title}</span>
      <div className="ml-auto flex items-center gap-1">{children}</div>
    </div>
  );
}

const iconButton = "inline-flex size-6 items-center justify-center rounded text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-100";

const FILES = ["app.tsx", "layout.tsx", "splitter.tsx", "shell.tsx", "dock.tsx", "grid.tsx", "masonry.tsx", "styles.css"];

function Explorer(): React.ReactNode {
  const panel = Splitter.useSplitterPanel();
  if (panel.collapsed) {
    return (
      <div className="flex h-full flex-col items-center gap-2 py-2">
        <Splitter.Trigger panelId="explorer" className={iconButton} aria-label="Expand explorer">
          <ChevronRight className="size-4" />
        </Splitter.Trigger>
        <Folder className="size-4 text-zinc-400" />
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col">
      <PanelHeader icon={<Folder className="size-3.5" />} title="Explorer">
        <Splitter.Trigger panelId="explorer" className={iconButton} aria-label="Collapse explorer">
          <ChevronLeft className="size-4" />
        </Splitter.Trigger>
      </PanelHeader>
      <ul className="flex flex-col gap-0.5 overflow-auto p-2 text-sm">
        {FILES.map(file => (
          <li key={file} className="flex items-center gap-2 truncate rounded px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800/60">
            <FileCode2 className="size-3.5 shrink-0 text-zinc-400" />
            {file}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Terminal(): React.ReactNode {
  const panel = Splitter.useSplitterPanel();
  return (
    <div className="flex h-full flex-col bg-zinc-50 dark:bg-zinc-950">
      <PanelHeader icon={<SquareTerminal className="size-3.5" />} title="Terminal">
        <Splitter.Trigger panelId="terminal" className={iconButton} aria-label={panel.collapsed ? "Expand terminal" : "Collapse terminal"}>
          {panel.collapsed ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </Splitter.Trigger>
      </PanelHeader>
      <pre className="flex-1 overflow-auto p-3 font-mono text-xs text-zinc-600 dark:text-zinc-400">
        {"$ pnpm play\n\n  VITE ready\n\n  ➜  Local:   http://localhost:3420/"}
      </pre>
    </div>
  );
}

function formatLayout(layout: SplitterLayout | null): string {
  if (!layout) {
    return "…";
  }
  return Object.entries(layout).map(([id, size]) => `${id} ${size.toFixed(1)}%`).join(" · ");
}

function EditorDemo(): React.ReactNode {
  const [outerLayout, setOuterLayout] = React.useState<SplitterLayout | null>(null);
  const actionsRef = React.useRef<SplitterActions>(null);
  return (
    <Demo
      title="Editor"
      description="Collapsible panels with pixel limits, a nested group, and handles that cross. The layout is kept in localStorage."
      actions={(
        <>
          <Button onClick={() => actionsRef.current?.isCollapsed("outline") ? actionsRef.current.expand("outline") : actionsRef.current?.collapse("outline")}>
            <ListTree className="size-4" />
            Toggle outline
          </Button>
          <Button onClick={() => actionsRef.current?.setLayout({ explorer: 20, main: 60, outline: 20 })}>Reset</Button>
        </>
      )}
    >
      <Splitter.Root
        storageKey="playground-editor"
        actionsRef={actionsRef}
        onLayoutChange={setOuterLayout}
        className="h-[460px] overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
      >
        <Splitter.Panel id="explorer" defaultSize="220px" minSize="160px" maxSize="40%" collapsible collapsedSize="44px">
          <Explorer />
        </Splitter.Panel>
        <Handle aria-label="Resize explorer" />
        <Splitter.Panel id="main">
          <Splitter.Root orientation="vertical" className="h-full">
            <Splitter.Panel id="editor" minSize="120px">
              <div className="flex h-full flex-col">
                <PanelHeader icon={<FileCode2 className="size-3.5" />} title="splitter.tsx" />
                <pre className="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
                  {`<Splitter.Root orientation="horizontal">\n  <Splitter.Panel id="explorer" collapsible />\n  <Splitter.Handle />\n  <Splitter.Panel id="main" />\n</Splitter.Root>`}
                </pre>
              </div>
            </Splitter.Panel>
            <Handle aria-label="Resize terminal" />
            <Splitter.Panel id="terminal" defaultSize={32} minSize="100px" collapsible collapsedSize="36px">
              <Terminal />
            </Splitter.Panel>
          </Splitter.Root>
        </Splitter.Panel>
        <Handle aria-label="Resize outline" />
        <Splitter.Panel id="outline" defaultSize="20%" minSize="150px" collapsible>
          <div className="flex h-full flex-col">
            <PanelHeader icon={<ListTree className="size-3.5" />} title="Outline" />
            <ul className="flex flex-col gap-1 p-3 text-sm text-zinc-600 dark:text-zinc-400">
              <li>Splitter</li>
              <li className="pl-3">Panel</li>
              <li className="pl-3">Handle</li>
              <li className="pl-3">Trigger</li>
            </ul>
          </div>
        </Splitter.Panel>
      </Splitter.Root>
      <Readout>{formatLayout(outerLayout)}</Readout>
    </Demo>
  );
}

function ControlledDemo(): React.ReactNode {
  const [layout, setLayout] = React.useState<SplitterLayout>({ start: 40, end: 60 });
  return (
    <Demo
      title="Controlled"
      description="The layout lives in React state; buttons write to it directly."
      actions={(
        <>
          <Button onClick={() => setLayout({ start: 25, end: 75 })}>25 / 75</Button>
          <Button onClick={() => setLayout({ start: 50, end: 50 })}>50 / 50</Button>
          <Button onClick={() => setLayout({ start: 75, end: 25 })}>75 / 25</Button>
        </>
      )}
    >
      <Splitter.Root
        layout={layout}
        onLayoutChange={setLayout}
        className="h-40 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
      >
        <Splitter.Panel id="start" minSize={15} className="grid place-items-center text-sm text-zinc-500">
          {`${layout.start?.toFixed(1)}%`}
        </Splitter.Panel>
        <Handle aria-label="Resize" />
        <Splitter.Panel id="end" minSize={15} className="grid place-items-center text-sm text-zinc-500">
          {`${layout.end?.toFixed(1)}%`}
        </Splitter.Panel>
      </Splitter.Root>
    </Demo>
  );
}

function StackDemo(): React.ReactNode {
  return (
    <Demo title="Stacked and right to left" description="Vertical groups use up and down; in right-to-left layouts the left arrow grows the first panel.">
      <div className="grid gap-4 md:grid-cols-2">
        <Splitter.Root orientation="vertical" className="h-72 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          {["One", "Two", "Three"].map((name, index) => (
            <React.Fragment key={name}>
              {index > 0 && <Handle aria-label={`Resize ${name}`} />}
              <Splitter.Panel id={`stack-${name}`} minSize={10} className="grid place-items-center text-sm text-zinc-500">{name}</Splitter.Panel>
            </React.Fragment>
          ))}
        </Splitter.Root>
        <Splitter.Root dir="rtl" className="h-72 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <Splitter.Panel id="rtl-start" defaultSize={35} minSize={20} collapsible className="grid place-items-center text-sm text-zinc-500">بداية</Splitter.Panel>
          <Handle aria-label="Resize" />
          <Splitter.Panel id="rtl-end" className="grid place-items-center text-sm text-zinc-500">نهاية</Splitter.Panel>
        </Splitter.Root>
      </div>
    </Demo>
  );
}

export function SplitterPage(): React.ReactNode {
  return (
    <Page title="Splitter" description="Resizable panel groups following the window splitter pattern: pointer and keyboard resizing, collapsible panels, nested groups and persisted layouts.">
      <EditorDemo />
      <ControlledDemo />
      <StackDemo />
    </Page>
  );
}
