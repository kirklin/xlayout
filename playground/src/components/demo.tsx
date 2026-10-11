import type * as React from "react";
import { cn } from "~/lib/cn";

interface PageProps {
  title: string;
  description: string;
  children: React.ReactNode;
}

export function Page({ title, description, children }: PageProps): React.ReactNode {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-10 sm:px-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="max-w-2xl text-zinc-500 dark:text-zinc-400">{description}</p>
      </header>
      {children}
    </div>
  );
}

interface DemoProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export function Demo({ title, description, actions, children }: DemoProps): React.ReactNode {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-medium">{title}</h2>
          {description && <p className="text-sm text-zinc-500 dark:text-zinc-400">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function Button({ className, ...props }: React.ComponentProps<"button">): React.ReactNode {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium shadow-xs transition-colors",
        "hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500",
        "disabled:pointer-events-none disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800",
        className,
      )}
      {...props}
    />
  );
}

export function Readout({ children }: { children: React.ReactNode }): React.ReactNode {
  return (
    <code className="rounded-md bg-zinc-100 px-2 py-1 font-mono text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
      {children}
    </code>
  );
}
