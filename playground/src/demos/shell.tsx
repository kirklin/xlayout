import type * as React from "react";
import { PanelRight, X } from "lucide-react";
import { Shell } from "xlayout";
import { Button, Demo, Page, Readout } from "~/components/demo";
import { cn } from "~/lib/cn";

function PageSidebarDemo(): React.ReactNode {
  const sidebar = Shell.useShellSidebar("nav");
  const shell = Shell.useShell();
  return (
    <Demo
      title="This page"
      description="The navigation on the left is a Shell sidebar: it narrows to icons, resizes from its edge, toggles with Cmd or Ctrl and B, and becomes a drawer on narrow screens, which a finger swipes closed."
      actions={(
        <>
          <Button onClick={() => sidebar?.toggle()}>Toggle</Button>
          <Button onClick={() => sidebar?.setWidth(320)}>320px wide</Button>
          <Button onClick={() => sidebar?.resetWidth()}>Reset width</Button>
        </>
      )}
    >
      <Readout>
        {sidebar
          ? `mode ${sidebar.mode} · state ${sidebar.state} · width ${sidebar.width} · offset ${sidebar.offset} · mobile ${shell.isMobile}`
          : "…"}
      </Readout>
    </Demo>
  );
}

const MESSAGES = [
  { from: "Kirk", subject: "Layout review", preview: "The splitter handles feel right; can we check the drawer on phones?" },
  { from: "张三", subject: "Release notes", preview: "Drafted the notes for the next version, please take a look." },
  { from: "李四", subject: "Design tokens", preview: "Updated the spacing scale and the sidebar widths." },
  { from: "王五", subject: "Accessibility pass", preview: "Landmarks, skip link and focus order all check out." },
];

function InspectorDemo(): React.ReactNode {
  return (
    <Demo
      title="Inspector"
      description="A second Shell inside a frame with a resizable sidebar on the end side that slides away completely."
    >
      <Shell.Root className="group/inner relative flex h-[420px] overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex min-w-0 flex-1 flex-col">
          <Shell.Header asChild>
            <div className="flex h-11 shrink-0 items-center gap-2 border-b border-zinc-200 px-3 dark:border-zinc-800">
              <span className="text-sm font-medium">Inbox</span>
              <Shell.SidebarTrigger
                sidebar="inspector"
                aria-label="Toggle details"
                className="ms-auto inline-flex size-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 data-[state=expanded]:text-blue-600 dark:hover:bg-zinc-800"
              >
                <PanelRight className="size-4 rtl:-scale-x-100" />
              </Shell.SidebarTrigger>
            </div>
          </Shell.Header>
          <Shell.Main asChild>
            <ul aria-label="Messages" className="flex-1 divide-y divide-zinc-100 overflow-auto dark:divide-zinc-800">
              {MESSAGES.map(message => (
                <li key={message.subject} className="flex flex-col gap-0.5 px-4 py-3">
                  <span className="text-sm font-medium">{message.subject}</span>
                  <span className="text-xs text-zinc-500">{`${message.from} · ${message.preview}`}</span>
                </li>
              ))}
            </ul>
          </Shell.Main>
        </div>
        <Shell.Sidebar
          id="inspector"
          side="end"
          defaultWidth="18rem"
          minWidth="14rem"
          maxWidth="26rem"
          aria-label="Details"
          className={cn(
            "drawer relative shrink-0 overflow-hidden border-s border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950",
            "w-(--xlayout-shell-sidebar-offset) group-data-[hydrated]/inner:transition-[width] data-[resizing]:transition-none",
            "max-md:absolute max-md:inset-y-0 max-md:end-0 max-md:z-20 max-md:w-64 max-md:shadow-xl",
            "max-md:translate-x-full rtl:max-md:-translate-x-full max-md:data-[mode=modal]:data-[state=expanded]:translate-x-0",
          )}
        >
          <Shell.SidebarResizer
            aria-label="Resize details"
            className="absolute inset-y-0 start-0 z-10 w-1.5 -translate-x-1/2 cursor-col-resize outline-none hover:bg-blue-400/60 focus-visible:bg-blue-500 data-[state=dragging]:bg-blue-500 rtl:translate-x-1/2"
          />
          <div className="flex h-11 items-center justify-between border-b border-zinc-200 px-4 dark:border-zinc-800">
            <span className="text-sm font-medium">Details</span>
            <Shell.SidebarTrigger sidebar="inspector" aria-label="Close details" className="inline-flex size-7 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-200/60">
              <X className="size-4" />
            </Shell.SidebarTrigger>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 p-4 text-sm">
            <dt className="text-zinc-500">From</dt>
            <dd>Kirk</dd>
            <dt className="text-zinc-500">Subject</dt>
            <dd>Layout review</dd>
            <dt className="text-zinc-500">Labels</dt>
            <dd>Design, Review</dd>
          </dl>
        </Shell.Sidebar>
        <Shell.SidebarOverlay sidebar="inspector" className="drawer-overlay absolute inset-0 z-10 bg-zinc-950/30" />
      </Shell.Root>
    </Demo>
  );
}

export function ShellPage(): React.ReactNode {
  return (
    <Page title="Shell" description="Application frame: header, main content, footer and any number of sidebars that collapse, resize, persist and turn into drawers on narrow screens.">
      <PageSidebarDemo />
      <InspectorDemo />
    </Page>
  );
}
