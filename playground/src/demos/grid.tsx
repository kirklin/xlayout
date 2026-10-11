import type { LucideIcon } from "lucide-react";
import type { GridDrop, GridLayoutChange, GridLayouts } from "xlayout/grid";
import type { Series, Share, Spark } from "~/components/charts";
import type { NoteContent } from "~/lib/notes";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, GripVertical, MoveDiagonal2, RotateCcw } from "lucide-react";
import * as React from "react";
import { Grid } from "xlayout";
import { AreaChart, BarChart, BarList, Legend, LineChart, Ring, SparkBars, Trend } from "~/components/charts";
import { Button, Demo, Page, Readout } from "~/components/demo";
import { NoteView } from "~/components/notes";
import { cn } from "~/lib/cn";
import { NOTE_KINDS, noteKind, sampleNote } from "~/lib/notes";

const iconButton = cn(
  "inline-flex shrink-0 items-center justify-center rounded-md text-zinc-400 outline-none",
  "hover:bg-zinc-100 hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-blue-500",
  "data-[state=picked]:bg-blue-600 data-[state=picked]:text-white",
  "dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
);

const cardItem = cn(
  "group/card relative rounded-xl border border-zinc-200 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900",
  "data-[state=dragging]:z-10 data-[state=dragging]:shadow-xl data-[state=resizing]:z-10 data-[state=resizing]:shadow-xl",
);

const placeholder = "rounded-xl border-2 border-dashed border-blue-400 bg-blue-50/60 dark:border-blue-500 dark:bg-blue-950/40";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];

const REVENUE: Series[] = [
  { name: "Online", values: [18640, 30520, 23710, 27350, 20930, 31420], fill: "bg-blue-600 dark:bg-blue-500" },
  { name: "In store", values: [8020, 20140, 12090, 19230, 13110, 14280], fill: "bg-blue-400 dark:bg-blue-300" },
];

const VISITS = [12, 18, 15, 22, 19, 27, 24, 30, 26, 33, 29, 36, 34, 41];

const CONVERSION: Spark[] = [2.6, 3.1, 2.8, 3.4, 3, 3.6, 3.3, 3.9, 3.5, 3.7, 3.8, 3.4].map((value, index) => ({ label: `Week ${index + 1}`, value }));

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const ORDERS: Series[] = [
  { name: "This week", values: [120, 186, 154, 232, 278, 205, 248], fill: "bg-blue-600 dark:bg-blue-500", stroke: "text-blue-600 dark:text-blue-500" },
  { name: "Last week", values: [96, 140, 172, 150, 196, 236, 180], fill: "bg-blue-300 dark:bg-blue-700", stroke: "text-blue-300 dark:text-blue-700", dashed: true },
];

const REGIONS: Share[] = [
  { name: "Europe", value: 38 },
  { name: "North America", value: 27 },
  { name: "Asia", value: 19 },
  { name: "South America", value: 9 },
  { name: "Oceania", value: 7 },
];

function Kpi({ value, children }: { value: string; children: React.ReactNode }): React.ReactNode {
  return (
    <div className="flex min-h-0 flex-1 items-end justify-between gap-4">
      <span className="text-3xl font-semibold tracking-tight tabular-nums">{value}</span>
      <div className="h-full max-h-20 w-1/2 min-w-0">{children}</div>
    </div>
  );
}

interface Widget {
  value: string;
  title: string;
  description?: string;
  legend?: readonly Series[];
  /** Change over the last period in percent, shown beside the title. */
  change?: number;
  body: React.ReactNode;
}

const WIDGETS: Widget[] = [
  {
    value: "revenue",
    title: "Revenue",
    description: "January – June 2026",
    legend: REVENUE,
    body: <BarChart labels={MONTHS} series={REVENUE} format={value => currency.format(value)} />,
  },
  {
    value: "visitors",
    title: "Visitors",
    change: 8.1,
    body: <Kpi value="24,310"><AreaChart values={VISITS} /></Kpi>,
  },
  {
    value: "conversion",
    title: "Conversion",
    change: -0.4,
    body: <Kpi value="3.42%"><SparkBars sparks={CONVERSION} /></Kpi>,
  },
  {
    value: "orders",
    title: "Orders",
    legend: ORDERS,
    body: <LineChart labels={DAYS} series={ORDERS} />,
  },
  {
    value: "regions",
    title: "Regions",
    description: "Share of visitors",
    body: <div className="min-h-0 flex-1"><BarList shares={REGIONS} /></div>,
  },
  {
    value: "goal",
    title: "June goal",
    description: `${currency.format(43200)} of ${currency.format(60000)}`,
    body: <div className="flex min-h-0 flex-1 justify-center"><Ring value={72} caption="reached" /></div>,
  },
];

const LAYOUTS: GridLayouts = {
  wide: [
    { value: "revenue", x: 0, y: 0, w: 8, h: 2, minW: 4, minH: 2 },
    { value: "visitors", x: 8, y: 0, w: 4, h: 1, minW: 3 },
    { value: "conversion", x: 8, y: 1, w: 4, h: 1, minW: 3 },
    { value: "orders", x: 0, y: 2, w: 4, h: 2, minW: 3, minH: 2 },
    { value: "regions", x: 4, y: 2, w: 5, h: 2, minW: 3, minH: 2 },
    { value: "goal", x: 9, y: 2, w: 3, h: 2, minW: 2, minH: 2 },
  ],
  // Scaled down to four columns, the cards beside each other would be too narrow for what they show.
  narrow: [
    { value: "revenue", x: 0, y: 0, w: 4, h: 2, minW: 3, minH: 2 },
    { value: "visitors", x: 0, y: 2, w: 4, h: 1, minW: 3 },
    { value: "conversion", x: 0, y: 3, w: 4, h: 1, minW: 3 },
    { value: "orders", x: 0, y: 4, w: 4, h: 2, minW: 3, minH: 2 },
    { value: "regions", x: 0, y: 6, w: 4, h: 2, minW: 3, minH: 2 },
    { value: "goal", x: 0, y: 8, w: 4, h: 2, minW: 2, minH: 2 },
  ],
};

const ARROWS: { direction: "start" | "end" | "up" | "down"; label: string; icon: LucideIcon }[] = [
  { direction: "start", label: "toward the start", icon: ArrowLeft },
  { direction: "up", label: "up", icon: ArrowUp },
  { direction: "down", label: "down", icon: ArrowDown },
  { direction: "end", label: "toward the end", icon: ArrowRight },
];

function Card({ widget }: { widget: Widget }): React.ReactNode {
  const item = Grid.useGridItem();
  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden rounded-xl px-4 pt-3 pb-4">
      <header className="flex shrink-0 flex-col">
        <div className="flex h-7 items-center gap-1">
          <h3 className="min-w-0 flex-1 truncate text-sm font-medium">{widget.title}</h3>
          <div className="hidden items-center group-focus-within/card:flex group-hover/card:flex">
            {ARROWS.map(({ direction, label, icon: Icon }) => (
              <button key={direction} type="button" aria-label={`Move ${widget.title} ${label}`} onClick={() => item.move(direction)} className={cn(iconButton, "size-7")}>
                <Icon className="size-3.5 rtl:-scale-x-100" />
              </button>
            ))}
          </div>
          {/* The arrows take the badge's place, leaving room for the title. */}
          {widget.change !== undefined && <Trend change={widget.change} className="group-focus-within/card:hidden group-hover/card:hidden" />}
          <Grid.DragHandle aria-label={`Move ${widget.title}`} className={cn(iconButton, "-me-2 size-7 cursor-grab")}>
            <GripVertical className="size-4" />
          </Grid.DragHandle>
        </div>
        {(widget.description || widget.legend) && (
          <div className="flex items-center justify-between gap-3">
            {widget.description && <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{widget.description}</p>}
            {widget.legend && <Legend series={widget.legend} />}
          </div>
        )}
      </header>
      {widget.body}
      <Grid.ResizeHandle
        aria-label={`Resize ${widget.title}`}
        className={cn(
          iconButton,
          "absolute end-0.5 bottom-0.5 size-5 cursor-nwse-resize opacity-0 rtl:cursor-nesw-resize",
          "group-hover/card:opacity-100 group-data-[state=resizing]/card:opacity-100 focus-visible:opacity-100",
        )}
      >
        <MoveDiagonal2 className="size-3 rtl:-scale-x-100" />
      </Grid.ResizeHandle>
    </div>
  );
}

const VERBS: Record<GridLayoutChange["reason"], string> = { move: "moved", resize: "resized", add: "added", remove: "removed" };

/** Sits below the grid, out of its flow, since everything inside the grid takes part in its layout. */
function Status({ change }: { change: GridLayoutChange | null }): React.ReactNode {
  const { breakpoint, columns } = Grid.useGrid();
  const last = change ? ` · last ${VERBS[change.reason]} ${change.value} at ${change.breakpoint}` : "";
  return (
    <div className="absolute start-0 top-full mt-4">
      <Readout>{`${breakpoint ?? "…"} · ${columns ?? "…"} columns${last}`}</Readout>
    </div>
  );
}

function DashboardDemo(): React.ReactNode {
  const [layouts, setLayouts] = React.useState(LAYOUTS);
  const [change, setChange] = React.useState<GridLayoutChange | null>(null);
  return (
    <Demo
      title="Dashboard"
      description="Twelve columns from 960px, eight from 640px and four below. The wide and narrow layouts are written; the medium one is scaled from the wide one until you change it. Drag the grip or the corner, or focus either and use Space and the arrow keys; the arrows in a card's header move it without dragging."
      actions={(
        <Button onClick={() => {
          setLayouts(LAYOUTS);
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

const noteItem = cn(
  "relative rounded-xl border border-zinc-200 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900",
  "data-[state=dragging]:z-10 data-[state=dragging]:shadow-xl",
);

const notePlaceholder = "rounded-xl border-2 border-dashed border-yellow-400 bg-yellow-50/70 dark:border-yellow-500 dark:bg-yellow-950/30";

type Note = NoteContent & { value: string };

const FIRST_NOTES: Note[] = [
  { value: "note-1", ...sampleNote("checklist", []) },
  { value: "note-2", ...sampleNote("text", []) },
];

function PaletteDemo(): React.ReactNode {
  const [notes, setNotes] = React.useState(FIRST_NOTES);
  const [layouts, setLayouts] = React.useState<GridLayouts>({
    base: [{ value: "note-1", x: 0, y: 0, w: 2, h: 2 }, { value: "note-2", x: 2, y: 0, w: 2, h: 2 }],
  });
  const dropNote = (drop: GridDrop, event: React.DragEvent<HTMLDivElement>): void => {
    const note = { value: `note-${notes.length + 1}`, ...sampleNote(noteKind(event.dataTransfer.getData(NOTE_TYPE)), notes) };
    setNotes(current => [...current, note]);
    setLayouts(current => ({ ...current, [drop.breakpoint]: [...drop.layout, { value: note.value, ...drop.cell }] }));
  };
  return (
    <Demo title="Dropping in" description="Drag a note, a checklist or a table into the grid. The grid shows where it will land and moves the other notes out of the way.">
      <div className="flex flex-wrap gap-2">
        {NOTE_KINDS.map(({ kind, label, icon: Icon }) => (
          <div
            key={kind}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData(NOTE_TYPE, kind);
              event.dataTransfer.effectAllowed = "copy";
            }}
            className="flex cursor-grab items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium shadow-xs active:cursor-grabbing dark:border-zinc-800 dark:bg-zinc-900"
          >
            <Icon className="size-4 text-yellow-500" />
            {label}
          </div>
        ))}
      </div>
      <Grid.Root
        columns={6}
        rowHeight={84}
        gap={12}
        layouts={layouts}
        onLayoutsChange={setLayouts}
        dropSize={{ w: 2, h: 2 }}
        acceptDrop={event => event.dataTransfer.types.includes(NOTE_TYPE)}
        onDropItem={dropNote}
        className={cn(
          "min-h-96 rounded-2xl border border-dashed border-zinc-300 p-3 transition-colors dark:border-zinc-700",
          "data-[state=dropping]:border-yellow-400 data-[state=dropping]:bg-yellow-50/40 dark:data-[state=dropping]:bg-yellow-950/20",
        )}
      >
        {notes.map(note => (
          <Grid.Item key={note.value} value={note.value} label={note.title} className={noteItem}>
            <NoteView
              note={note}
              handle={(
                <Grid.DragHandle aria-label={`Move ${note.title}`} className={cn(iconButton, "-me-1.5 size-7 cursor-grab")}>
                  <GripVertical className="size-4" />
                </Grid.DragHandle>
              )}
            />
          </Grid.Item>
        ))}
        <Grid.Placeholder className={notePlaceholder} />
      </Grid.Root>
    </Demo>
  );
}

type BoardName = "today" | "later";

interface Task {
  title: string;
  tag: string;
  /** The color of the tag's dot. */
  tone: string;
}

const TASKS: Record<string, Task> = {
  "plan-sprint": { title: "Plan the sprint", tag: "Planning", tone: "bg-violet-500" },
  "review-designs": { title: "Review the new designs", tag: "Design", tone: "bg-pink-500" },
  "fix-login": { title: "Fix the login redirect", tag: "Bug", tone: "bg-red-500" },
  "release-notes": { title: "Write the release notes", tag: "Docs", tone: "bg-amber-500" },
  "update-packages": { title: "Update packages", tag: "Chore", tone: "bg-zinc-400" },
  "interviews": { title: "Five user interviews", tag: "Research", tone: "bg-emerald-500" },
  "speed-budget": { title: "Set a speed budget", tag: "Engineering", tone: "bg-blue-500" },
};

const BOARDS: { name: BoardName; label: string }[] = [{ name: "today", label: "Today" }, { name: "later", label: "Later" }];

const FIRST_BOARDS: Record<BoardName, GridLayouts> = {
  today: {
    base: [
      { value: "plan-sprint", x: 0, y: 0, w: 2, h: 1 },
      { value: "review-designs", x: 2, y: 0, w: 2, h: 2 },
      { value: "fix-login", x: 0, y: 1, w: 2, h: 1 },
    ],
  },
  later: {
    base: [
      { value: "release-notes", x: 0, y: 0, w: 2, h: 1 },
      { value: "update-packages", x: 2, y: 0, w: 1, h: 1 },
      { value: "interviews", x: 3, y: 0, w: 1, h: 2 },
      { value: "speed-budget", x: 0, y: 1, w: 3, h: 1 },
    ],
  },
};

const taskItem = cn(cardItem, "transition-opacity data-[leaving]:opacity-50");

const edgeHandle = cn(
  "absolute z-10 rounded-full outline-none transition-colors",
  "hover:bg-blue-500/70 focus-visible:bg-blue-500 data-[state=picked]:bg-blue-500",
);

function TaskCard({ task }: { task: Task }): React.ReactNode {
  return (
    <div className="flex h-full items-start gap-1.5 overflow-hidden px-2 py-2.5">
      <Grid.DragHandle aria-label={`Move ${task.title}`} className={cn(iconButton, "size-6 cursor-grab")}>
        <GripVertical className="size-4" />
      </Grid.DragHandle>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-sm font-medium">{task.title}</span>
        <span className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          <span className={cn("size-2 shrink-0 rounded-full", task.tone)} />
          <span className="truncate">{task.tag}</span>
        </span>
      </div>
      <Grid.ResizeHandle edge="start" aria-label={`Resize ${task.title} from the start`} className={cn(edgeHandle, "inset-y-3 start-0 w-1 cursor-ew-resize")} />
      <Grid.ResizeHandle edge="end" aria-label={`Resize ${task.title} from the end`} className={cn(edgeHandle, "inset-y-3 end-0 w-1 cursor-ew-resize")} />
      <Grid.ResizeHandle edge="bottom" aria-label={`Resize ${task.title} from the bottom`} className={cn(edgeHandle, "inset-x-3 bottom-0 h-1 cursor-ns-resize")} />
    </div>
  );
}

function BoardsDemo(): React.ReactNode {
  const [boards, setBoards] = React.useState(FIRST_BOARDS);
  // An item that goes to the other board arrives there before it leaves here, so this knows where it went.
  const boardsRef = React.useRef(FIRST_BOARDS);
  const [last, setLast] = React.useState<string | null>(null);
  const report = (name: BoardName, label: string, next: GridLayouts, change: GridLayoutChange): void => {
    const current = { ...boardsRef.current, [name]: next };
    boardsRef.current = current;
    setBoards(current);
    const title = `“${TASKS[change.value]?.title ?? change.value}”`;
    if (change.reason === "remove") {
      const elsewhere = BOARDS.some(board => board.name !== name && current[board.name].base?.some(item => item.value === change.value));
      if (!elsewhere) {
        setLast(`Removed ${title}`);
      }
      return;
    }
    setLast(change.reason === "add" ? `Moved ${title} to ${label}` : `${change.reason === "move" ? "Moved" : "Resized"} ${title} in ${label}`);
  };
  return (
    <Demo
      title="Boards"
      description="Two boards in one group share their tasks. Drag a task onto the other board, or off both to remove it; with the keyboard, Space picks it up, the arrows carry it past the edge into the other board and Delete removes it. The bars on a task's sides and bottom resize it from that edge."
      actions={(
        <Button onClick={() => {
          boardsRef.current = FIRST_BOARDS;
          setBoards(FIRST_BOARDS);
          setLast(null);
        }}
        >
          <RotateCcw className="size-4" />
          Reset
        </Button>
      )}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {BOARDS.map(({ name, label }) => (
          <section key={name} className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{label}</h3>
            <Grid.Root
              aria-label={label}
              group="planning"
              removable
              columns={4}
              rowHeight={56}
              gap={8}
              layouts={boards[name]}
              onLayoutsChange={(next, change) => report(name, label, next, change)}
              className={cn(
                "min-h-56 rounded-2xl border border-zinc-200 bg-zinc-100/60 p-2 transition-colors dark:border-zinc-800 dark:bg-zinc-900/60",
                "data-[state=dropping]:border-blue-400 data-[state=dropping]:bg-blue-50/60 dark:data-[state=dropping]:bg-blue-950/30",
                "data-[state=removing]:border-red-300 data-[state=removing]:bg-red-50/60 dark:data-[state=removing]:border-red-900 dark:data-[state=removing]:bg-red-950/30",
              )}
            >
              {(boards[name].base ?? []).map(item => (
                <Grid.Item key={item.value} value={item.value} label={TASKS[item.value]!.title} className={taskItem}>
                  <TaskCard task={TASKS[item.value]!} />
                </Grid.Item>
              ))}
              <Grid.Placeholder className={placeholder} />
            </Grid.Root>
          </section>
        ))}
      </div>
      <Readout>{last ?? "Nothing moved yet"}</Readout>
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
      <BoardsDemo />
      <PaletteDemo />
    </Page>
  );
}
