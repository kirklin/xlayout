import type { Route } from "~/routes";
import { CodeXml, PanelLeft } from "lucide-react";
import * as React from "react";
import { Shell } from "xlayout";
import { cn } from "~/lib/cn";
import { ROUTES } from "~/routes";

function subscribeToHash(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function useRoute(): Route {
  const hash = React.useSyncExternalStore(subscribeToHash, () => window.location.hash.slice(1), () => "");
  return ROUTES.find(route => route.id === hash) ?? ROUTES[0]!;
}

function Navigation({ current }: { current: Route }): React.ReactNode {
  return (
    <nav aria-label="Components" className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
      {ROUTES.map((route) => {
        const Icon = route.icon;
        const active = route.id === current.id;
        return (
          <a
            key={route.id}
            href={`#${route.id}`}
            title={route.label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-9 items-center gap-3 rounded-md px-2.5 text-sm text-zinc-600 outline-none transition-colors",
              "hover:bg-zinc-200/60 hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-blue-500",
              "dark:text-zinc-400 dark:hover:bg-zinc-800/80 dark:hover:text-zinc-100",
              active && "bg-zinc-200/70 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100",
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="truncate group-data-[collapsible=icon]/sidebar:group-data-[state=collapsed]/sidebar:sr-only">
              {route.label}
            </span>
          </a>
        );
      })}
    </nav>
  );
}

export function App(): React.ReactNode {
  const route = useRoute();
  const Page = route.page;
  return (
    <Shell.Root storageKey="playground-shell" className="group/root flex h-full">
      <Shell.SkipLink className="sr-only rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[60]">
        Skip to main content
      </Shell.SkipLink>
      <Shell.Sidebar
        id="nav"
        collapsible="icon"
        shortcut="mod+b"
        minWidth="12rem"
        maxWidth="20rem"
        defaultWidth="15rem"
        aria-label="Components"
        className={cn(
          "group/sidebar relative flex shrink-0 flex-col overflow-hidden border-e border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950",
          "w-(--xlayout-shell-sidebar-offset) group-data-[hydrated]/root:transition-[width] group-data-[hydrated]/root:duration-200 data-[resizing]:transition-none",
          "max-md:fixed max-md:inset-y-0 max-md:start-0 max-md:z-50 max-md:w-72 max-md:shadow-xl",
          "max-md:-translate-x-full rtl:max-md:translate-x-full max-md:data-[mode=modal]:data-[state=expanded]:translate-x-0",
          "max-md:group-data-[hydrated]/root:transition-transform",
        )}
      >
        <div className="flex h-12 shrink-0 items-center px-4">
          <a href="#" className="truncate text-base font-semibold tracking-tight group-data-[state=collapsed]/sidebar:group-data-[collapsible=icon]/sidebar:sr-only">
            xlayout
          </a>
        </div>
        <Navigation current={route} />
        <Shell.SidebarResizer
          aria-label="Resize navigation"
          className="absolute inset-y-0 end-0 z-10 w-1.5 translate-x-1/2 cursor-col-resize outline-none hover:bg-blue-400/60 focus-visible:bg-blue-500 data-[state=dragging]:bg-blue-500 rtl:-translate-x-1/2"
        />
      </Shell.Sidebar>
      <Shell.SidebarOverlay sidebar="nav" className="fixed inset-0 z-40 bg-zinc-950/40 backdrop-blur-[1px]" />
      <div className="flex min-w-0 flex-1 flex-col">
        <Shell.Header className="flex h-12 shrink-0 items-center gap-2 border-b border-zinc-200 px-3 dark:border-zinc-800">
          <Shell.SidebarTrigger
            sidebar="nav"
            aria-label="Toggle navigation"
            className="inline-flex size-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
          >
            <PanelLeft className="size-4 rtl:-scale-x-100" />
          </Shell.SidebarTrigger>
          <span className="text-sm font-medium">{route.label}</span>
          <a
            href="https://github.com/kirklin/xlayout"
            aria-label="Source on GitHub"
            className="ms-auto inline-flex size-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
          >
            <CodeXml className="size-4" />
          </a>
        </Shell.Header>
        <Shell.Main className="flex-1 overflow-auto outline-none">
          <Page />
        </Shell.Main>
      </div>
    </Shell.Root>
  );
}
