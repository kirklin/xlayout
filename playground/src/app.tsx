import type * as React from "react";
import { useSyncExternalStore } from "react";
import { SplitterPage } from "~/demos/splitter";
import { cn } from "~/lib/cn";

interface Route {
  id: string;
  label: string;
  page: () => React.ReactNode;
}

const ROUTES: Route[] = [
  { id: "splitter", label: "Splitter", page: SplitterPage },
];

function subscribeToHash(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function useRoute(): Route {
  const hash = useSyncExternalStore(subscribeToHash, () => window.location.hash.slice(1), () => "");
  return ROUTES.find(route => route.id === hash) ?? ROUTES[0]!;
}

export function App(): React.ReactNode {
  const route = useRoute();
  const Page = route.page;
  return (
    <div className="grid h-full grid-cols-[220px_1fr]">
      <nav aria-label="Components" className="flex flex-col gap-1 border-r border-zinc-200 p-4 dark:border-zinc-800">
        <a href="#" className="mb-4 px-2 text-lg font-semibold tracking-tight">xlayout</a>
        {ROUTES.map(item => (
          <a
            key={item.id}
            href={`#${item.id}`}
            aria-current={item.id === route.id ? "page" : undefined}
            className={cn(
              "rounded-md px-2 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900",
              item.id === route.id && "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100",
            )}
          >
            {item.label}
          </a>
        ))}
      </nav>
      <main className="overflow-auto">
        <Page />
      </main>
    </div>
  );
}
