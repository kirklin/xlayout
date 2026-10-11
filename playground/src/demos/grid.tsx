import type { LucideIcon } from "lucide-react";
import type { GridDrop, GridItemLayout, GridLayoutChange, GridLayouts } from "xlayout/grid";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, GripVertical, MoveDiagonal2, RotateCcw, StickyNote } from "lucide-react";
import * as React from "react";
import { Grid } from "xlayout";
import { Button, Demo, Page, Readout } from "~/components/demo";
import { cn } from "~/lib/cn";

const iconButton = cn(
  "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-zinc-500 outline-none",
  "hover:bg-zinc-100 hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-blue-500",
  "data-[state=picked]:bg-blue-600 data-[state=picked]:text-white",
  "dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
);

const cardItem = cn(
  "group/card relative rounded-lg border border-zinc-200 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900",
  "data-[state=dragging]:z-10 data-[state=dragging]:shadow-xl data-[state=resizing]:z-10 data-[state=resizing]:shadow-xl",
);

const placeholder = "rounded-lg border-2 border-dashed border-blue-400 bg-blue-50/60 dark:border-blue-500 dark:bg-blue-950/40";

interface Widget {
  value: string;
  title: string;
  hue: number;
}

const WIDGETS: Widget[] = [
  { value: "revenue", title: "Revenue", hue: 250 },
  { value: "visitors", title: "Visitors", hue: 165 },
  { value: "conversion", title: "Conversion", hue: 40 },
  { value: "orders", title: "Orders", hue: 300 },
  { value: "regions", title: "Regions", hue: 120 },
  { value: "notes", title: "Notes", hue: 15 },
];

const WIDE_LAYOUT: GridItemLayout[] = [
  { value: "revenue", x: 0, y: 0, w: 8, h: 2 },
  { value: "visitors", x: 8, y: 0, w: 4, h: 1 },
  { value: "conversion", x: 8, y: 1, w: 4, h: 1 },
  { value: "orders", x: 0, y: 2, w: 4, h: 2, minW: 3 },
  { value: "regions", x: 4, y: 2, w: 5, h: 2 },
  { value: "notes", x: 9, y: 2, w: 3, h: 2 },
];

const ARROWS: { direction: "start" | "end" | "up" | "down"; label: string; icon: LucideIcon }[] = [
  { direction: "start", label: "toward the start", icon: ArrowLeft },
  { direction: "up", label: "up", icon: ArrowUp },
  { direction: "down", label: "down", icon: ArrowDown },
  { direction: "end", label: "toward the end", icon: ArrowRight },
];

function Bars({ hue, count }: { hue: number; count: number }): React.ReactNode {
  return (
    <div className="flex h-full items-end gap-1">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="flex-1 rounded-t"
          style={{ height: `${30 + ((index * 37 + hue) % 60)}%`, background: `oklch(0.7 0.12 ${hue})` }}
        />
      ))}
    </div>
  );
}

function Card({ widget }: { widget: Widget }): React.ReactNode {
  const item = Grid.useGridItem();
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-zinc-100 px-1.5 dark:border-zinc-800">
        <Grid.DragHandle aria-label={`Move ${widget.title}`} className={cn(iconButton, "cursor-grab")}>
          <GripVertical className="size-4" />
        </Grid.DragHandle>
        <span className="flex-1 truncate text-sm font-medium">{widget.title}</span>
        <div className="hidden items-center group-focus-within/card:flex group-hover/card:flex">
          {ARROWS.map(({ direction, label, icon: Icon }) => (
            <button key={direction} type="button" aria-label={`Move ${widget.title} ${label}`} onClick={() => item.move(direction)} className={iconButton}>
              <Icon className="size-3.5 rtl:-scale-x-100" />
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 p-3">
        <Bars hue={widget.hue} count={(item.cell?.w ?? 4) * 2} />
      </div>
      <Grid.ResizeHandle
        aria-label={`Resize ${widget.title}`}
        className={cn(iconButton, "absolute end-0.5 bottom-0.5 size-6 cursor-nwse-resize rtl:cursor-nesw-resize")}
      >
        <MoveDiagonal2 className="size-3.5 rtl:-scale-x-100" />
      </Grid.ResizeHandle>
    </div>
  );
}

/** Sits below the grid, out of its flow, since everything inside the grid takes part in its layout. */
function Status({ change }: { change: GridLayoutChange | null }): React.ReactNode {
  const { breakpoint, columns } = Grid.useGrid();
  const last = change ? ` · last ${change.reason === "move" ? "moved" : "resized"} ${change.value} at ${change.breakpoint}` : "";
  return (
    <div className="absolute start-0 top-full mt-4">
      <Readout>{`${breakpoint ?? "…"} · ${columns ?? "…"} columns${last}`}</Readout>
    </div>
  );
}

function DashboardDemo(): React.ReactNode {
  const [layouts, setLayouts] = React.useState<GridLayouts>({ wide: WIDE_LAYOUT });
  const [change, setChange] = React.useState<GridLayoutChange | null>(null);
  return (
    <Demo
      title="Dashboard"
      description="Twelve columns from 960px, eight from 640px and four below; only the widest layout is written and the others are scaled from it until you change them. Drag the grip or the corner, or focus either and use Space and the arrow keys; the arrows in a card's header move it without dragging."
      actions={(
        <Button onClick={() => {
          setLayouts({ wide: WIDE_LAYOUT });
          setChange(null);
        }}
        >
          <RotateCcw className="size-4" />
          Reset
        </Button>
      )}
    >
      <Grid.Root
        breakpoints={{ wide: 960, medium: 640, narrow: 0 }}
        columns={{ wide: 12, medium: 8, narrow: 4 }}
        rowHeight={120}
        gap={12}
        layouts={layouts}
        onLayoutsChange={(next, details) => {
          setLayouts(next);
          setChange(details);
        }}
        className="pb-12"
      >
        {WIDGETS.map(widget => (
          <Grid.Item key={widget.value} value={widget.value} label={widget.title} className={cardItem}>
            <Card widget={widget} />
          </Grid.Item>
        ))}
        <Grid.Placeholder className={placeholder} />
        <Status change={change} />
      </Grid.Root>
    </Demo>
  );
}

const NOTE_TYPE = "application/x-xlayout-note";
const NOTE_COLORS = [
  { name: "Yellow", hue: 95 },
  { name: "Pink", hue: 350 },
  { name: "Blue", hue: 240 },
];

interface Note {
  value: string;
  hue: number;
}

function PaletteDemo(): React.ReactNode {
  const [notes, setNotes] = React.useState<Note[]>([{ value: "note-1", hue: 95 }]);
  const [layouts, setLayouts] = React.useState<GridLayouts>({ base: [{ value: "note-1", x: 0, y: 0, w: 2, h: 1 }] });
  const dropNote = (drop: GridDrop, event: React.DragEvent<HTMLDivElement>): void => {
    const hue = Number(event.dataTransfer.getData(NOTE_TYPE));
    const value = `note-${notes.length + 1}`;
    setNotes(current => [...current, { value, hue }]);
    setLayouts(current => ({ ...current, [drop.breakpoint]: [...drop.layout, { value, ...drop.cell }] }));
  };
  return (
    <Demo title="Dropping in" description="Drag a note from the palette into the grid. The grid shows where it will land and moves the other notes out of the way.">
      <div className="flex flex-wrap gap-2">
        {NOTE_COLORS.map(color => (
          <div
            key={color.name}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData(NOTE_TYPE, String(color.hue));
              event.dataTransfer.effectAllowed = "copy";
            }}
            className="flex cursor-grab items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm shadow-xs dark:border-zinc-800 dark:bg-zinc-900"
          >
            <StickyNote className="size-4" style={{ color: `oklch(0.7 0.15 ${color.hue})` }} />
            {`${color.name} note`}
          </div>
        ))}
      </div>
      <Grid.Root
        columns={6}
        rowHeight={72}
        gap={10}
        layouts={layouts}
        onLayoutsChange={setLayouts}
        dropSize={{ w: 2, h: 1 }}
        acceptDrop={event => event.dataTransfer.types.includes(NOTE_TYPE)}
        onDropItem={dropNote}
        className="min-h-48 rounded-xl border border-dashed border-zinc-300 p-2 dark:border-zinc-700"
      >
        {notes.map(note => (
          <Grid.Item key={note.value} value={note.value} className="group/card relative">
            <div className="flex h-full items-start gap-1 rounded-lg p-1.5" style={{ background: `oklch(0.93 0.07 ${note.hue})` }}>
              <Grid.DragHandle aria-label={`Move ${note.value}`} className={cn(iconButton, "cursor-grab text-zinc-700 hover:bg-black/5")}>
                <GripVertical className="size-4" />
              </Grid.DragHandle>
              <span className="pt-1 text-sm text-zinc-800">{note.value}</span>
            </div>
          </Grid.Item>
        ))}
        <Grid.Placeholder className={placeholder} />
      </Grid.Root>
    </Demo>
  );
}

export function GridPage(): React.ReactNode {
  return (
    <Page
      title="Grid"
      description="A dashboard grid with a layout for each width it reaches. Items take whole cells and move or resize by pointer, keyboard or code; others make way, and a single item of the same size swaps once passed halfway."
    >
      <DashboardDemo />
      <PaletteDemo />
    </Page>
  );
}
