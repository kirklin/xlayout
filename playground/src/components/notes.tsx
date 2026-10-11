import type * as React from "react";
import type { NoteContent } from "~/lib/notes";
import { Check } from "lucide-react";
import { cn } from "~/lib/cn";

function NoteBody({ note }: { note: NoteContent }): React.ReactNode {
  switch (note.kind) {
    case "text":
      return <p className="line-clamp-4 text-[13px] leading-5 text-zinc-700 dark:text-zinc-300">{note.text}</p>;
    case "checklist":
      return (
        <ul className="flex flex-col gap-1">
          {note.items.map(item => (
            <li key={item.text} className="flex items-center gap-2 text-[13px] leading-5">
              <span
                aria-hidden
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-full",
                  item.done ? "bg-yellow-500 text-white" : "border border-zinc-300 dark:border-zinc-600",
                )}
              >
                {item.done && <Check className="size-3" strokeWidth={3} />}
              </span>
              <span className="truncate">{item.text}</span>
              {item.done && <span className="sr-only">, done</span>}
            </li>
          ))}
        </ul>
      );
    case "table":
      return (
        <table className="w-full border-collapse text-[13px] leading-5">
          <tbody>
            {note.rows.map(([name, value]) => (
              <tr key={name} className="border-b border-zinc-200 last:border-b-0 dark:border-zinc-700">
                <td className="border-e border-zinc-200 py-1 pe-2 dark:border-zinc-700">{name}</td>
                <td className="py-1 ps-2 tabular-nums">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
  }
}

/** A note the way Notes previews it: a bold title, the date in gray and the start of the note. */
export function NoteView({ note, handle }: { note: NoteContent; handle: React.ReactNode }): React.ReactNode {
  return (
    <div className="flex h-full flex-col gap-2 overflow-hidden px-3.5 pt-2.5 pb-3.5">
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1 pt-1">
          <h3 className="truncate text-[15px] leading-5 font-semibold">{note.title}</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{note.date}</p>
        </div>
        {handle}
      </div>
      <NoteBody note={note} />
    </div>
  );
}
