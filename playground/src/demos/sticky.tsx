import type { StickySide } from "xlayout/sticky";
import { Archive, Trash2 } from "lucide-react";
import * as React from "react";
import { Sticky } from "xlayout";
import { Button, Demo, Page, Readout } from "~/components/demo";
import { cn } from "~/lib/cn";

const frame = "rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900";

const CHAPTERS = [
  { id: "frame", title: "The frame", paragraphs: 4 },
  { id: "panels", title: "Panels that resize", paragraphs: 3 },
  { id: "overflow", title: "Rows that run out of room", paragraphs: 4 },
  { id: "sticky", title: "Headers that stay", paragraphs: 5 },
  { id: "scroll", title: "Knowing where you are", paragraphs: 3 },
];

const PARAGRAPH = "A layout primitive owns the geometry and the state of a pattern and leaves every pixel of its look to you. It measures, it reports, and it gets out of the way, so the same parts serve a dense admin screen and a quiet reading view.";

function ArticleBar(): React.ReactNode {
  const { isStuck } = Sticky.useSticky();
  return (
    <>
      <span className="text-sm font-semibold">Layout notes</span>
      <span className="text-xs text-zinc-500 dark:text-zinc-400">{isStuck ? "Reading" : "Scroll the article"}</span>
    </>
  );
}

function StackDemo(): React.ReactNode {
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const groupRef = React.useRef<HTMLDivElement>(null);
  const [extent, setExtent] = React.useState("");
  // The chapter's text lands right below everything stacked at the top.
  const jumpTo = (id: string): void => {
    const scroller = scrollerRef.current;
    const group = groupRef.current;
    const text = document.getElementById(`sticky-chapter-${id}`);
    if (!scroller || !group || !text) {
      return;
    }
    const stacked = Number.parseFloat(getComputedStyle(group).getPropertyValue("--xlayout-sticky-top"));
    scroller.scrollTo({ top: text.offsetTop - stacked, behavior: "smooth" });
  };
  React.useEffect(() => {
    const group = groupRef.current;
    if (!group) {
      return;
    }
    const read = (): void => setExtent(getComputedStyle(group).getPropertyValue("--xlayout-sticky-top"));
    read();
    const observer = new MutationObserver(read);
    observer.observe(group, { attributes: true, attributeFilter: ["style"] });
    return () => observer.disconnect();
  }, []);
  return (
    <Demo
      title="Stacked headers"
      description="The article bar sits on layer 0 and each chapter title on layer 1, so titles stick below the bar and push each other out. The group reports how far its stack reaches."
      actions={CHAPTERS.slice(1).map(chapter => (
        <Button key={chapter.id} onClick={() => jumpTo(chapter.id)}>{chapter.title}</Button>
      ))}
    >
      <div ref={scrollerRef} className={cn(frame, "relative h-[420px] overflow-auto")}>
        <Sticky.Group ref={groupRef}>
          <Sticky.Root className="z-20 flex h-12 items-center justify-between border-b border-zinc-200 bg-white/90 px-4 backdrop-blur data-[stuck]:shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90">
            <ArticleBar />
          </Sticky.Root>
          {CHAPTERS.map(chapter => (
            <section key={chapter.id}>
              <Sticky.Root
                layer={1}
                className={cn(
                  "z-10 flex h-9 items-center border-b border-zinc-200 bg-zinc-50 px-4 text-sm font-medium dark:border-zinc-800 dark:bg-zinc-950",
                  "data-[stuck]:text-blue-600 dark:data-[stuck]:text-blue-400",
                )}
              >
                {chapter.title}
              </Sticky.Root>
              <div id={`sticky-chapter-${chapter.id}`} className="flex flex-col gap-3 p-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                {Array.from({ length: chapter.paragraphs }, (_, index) => <p key={index}>{PARAGRAPH}</p>)}
              </div>
            </section>
          ))}
        </Sticky.Group>
      </div>
      <Readout>{`--xlayout-sticky-top: ${extent}`}</Readout>
    </Demo>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CITIES = ["Beijing", "Shanghai", "Guangzhou", "Shenzhen", "Hangzhou", "Chengdu", "Wuhan", "Nanjing", "Chongqing", "Tianjin", "Suzhou", "Xiamen", "Qingdao", "Dalian"];

function visitors(row: number, column: number): string {
  return (((row + 3) * 7919 + (column + 5) * 104729) % 9000 + 1000).toLocaleString("en-US");
}

const headCell = "border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-start font-medium whitespace-nowrap dark:border-zinc-800 dark:bg-zinc-950";
const rowHead = "border-e border-zinc-200 bg-white px-3 py-2 text-start font-medium whitespace-nowrap dark:border-zinc-800 dark:bg-zinc-900";
const stuckStart = "data-[stuck~=inline-start]:shadow-[4px_0_6px_-4px_rgb(0_0_0/0.25)] rtl:data-[stuck~=inline-start]:shadow-[-4px_0_6px_-4px_rgb(0_0_0/0.25)]";
const stuckTop = "data-[stuck~=top]:shadow-[0_4px_6px_-4px_rgb(0_0_0/0.25)]";

function TableDemo(): React.ReactNode {
  return (
    <Demo
      title="Table"
      description="Column heads stick to the top, row heads to the inline start, and the corner to both. Each cell only casts a shadow while it is stuck on that side."
    >
      <div className={cn(frame, "h-80 overflow-auto")}>
        <table className="border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <Sticky.Root asChild side={["top", "inline-start"]}>
                <th className={cn(headCell, "z-20 border-e", stuckTop, stuckStart)}>City</th>
              </Sticky.Root>
              {MONTHS.map(month => (
                <Sticky.Root key={month} asChild>
                  <th className={cn(headCell, "z-10 min-w-24 text-end", stuckTop)}>{month}</th>
                </Sticky.Root>
              ))}
            </tr>
          </thead>
          <tbody>
            {CITIES.map((city, row) => (
              <tr key={city}>
                <Sticky.Root asChild side="inline-start">
                  <th className={cn(rowHead, stuckStart)}>{city}</th>
                </Sticky.Root>
                {MONTHS.map((month, column) => (
                  <td key={month} className="px-3 py-2 text-end text-zinc-600 tabular-nums dark:text-zinc-400">{visitors(row, column)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Demo>
  );
}

const MESSAGES = Array.from({ length: 14 }, (_, index) => ({ id: index, subject: `Weekly report ${14 - index}`, from: index % 3 === 0 ? "Kirk" : index % 3 === 1 ? "张三" : "李四" }));

function BottomBarDemo(): React.ReactNode {
  const [selected, setSelected] = React.useState<ReadonlySet<number>>(() => new Set([1, 4]));
  const [stuck, setStuck] = React.useState<StickySide[]>([]);
  const toggle = (id: number): void => {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  };
  return (
    <Demo
      title="Bottom bar"
      description="The action bar sticks to the bottom while the end of the list is out of view and settles into place when you reach it."
    >
      <div className={cn(frame, "h-72 overflow-auto")}>
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {MESSAGES.map(message => (
            <li key={message.id}>
              <label className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                <input type="checkbox" checked={selected.has(message.id)} onChange={() => toggle(message.id)} className="accent-blue-600" />
                <span className="flex-1 font-medium">{message.subject}</span>
                <span className="text-zinc-500">{message.from}</span>
              </label>
            </li>
          ))}
        </ul>
        <Sticky.Root
          side="bottom"
          onStuckChange={setStuck}
          className={cn(
            "flex items-center gap-2 border-t border-zinc-200 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900",
            "data-[stuck]:shadow-[0_-4px_8px_-4px_rgb(0_0_0/0.2)]",
          )}
        >
          <span className="flex-1 text-sm text-zinc-500">{`${selected.size} selected`}</span>
          <Button disabled={selected.size === 0}>
            <Archive className="size-4" />
            Archive
          </Button>
          <Button disabled={selected.size === 0}>
            <Trash2 className="size-4" />
            Delete
          </Button>
        </Sticky.Root>
      </div>
      <Readout>{stuck.length > 0 ? `stuck: ${stuck.join(" ")}` : "in place"}</Readout>
    </Demo>
  );
}

export function StickyPage(): React.ReactNode {
  return (
    <Page
      title="Sticky"
      description="Sticky positioning that knows when it is stuck and to which side, with layers that stack headers below one another."
    >
      <StackDemo />
      <TableDemo />
      <BottomBarDemo />
    </Page>
  );
}
