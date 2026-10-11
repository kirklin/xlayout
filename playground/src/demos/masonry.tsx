import type { MasonryAssignment, MasonryLayoutInfo, MasonryNative } from "xlayout/masonry";
import { Plus, Shuffle, TrendingUp } from "lucide-react";
import * as React from "react";
import { Masonry } from "xlayout";
import { Button, Demo, Page, Readout } from "~/components/demo";

interface Card {
  id: number;
  height: number;
  hue: number;
  featured: boolean;
}

function makeCard(id: number): Card {
  // A fixed sequence, so the page looks the same on every load.
  return { id, height: 90 + ((id * 53) % 7) * 28, hue: (id * 47) % 360, featured: id % 9 === 4 };
}

function CardBody({ card }: { card: Card }): React.ReactNode {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-end p-3 text-sm font-semibold text-white" style={{ height: card.height, background: `oklch(0.62 0.13 ${card.hue})` }}>
        {`#${card.id}`}
      </div>
      <div className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">{card.featured ? "Featured, spans two columns" : `${card.height}px tall`}</div>
    </div>
  );
}

function describeLayout(layout: MasonryLayoutInfo | null): string {
  if (!layout) {
    return "…";
  }
  const mode = layout.native ? "display: grid-lanes" : "placed by script";
  return `${layout.columns} columns · ${Math.round(layout.columnWidth)}px each · ${Math.round(layout.height)}px tall · ${mode}`;
}

function GalleryDemo(): React.ReactNode {
  const [cards, setCards] = React.useState(() => Array.from({ length: 14 }, (_, index) => makeCard(index + 1)));
  const [native, setNative] = React.useState<MasonryNative>("auto");
  const [layout, setLayout] = React.useState<MasonryLayoutInfo | null>(null);
  const shuffle = (): void => {
    setCards(current => [...current].sort((a, b) => ((a.id * 31 + current.length) % 17) - ((b.id * 31 + current.length) % 17)));
  };
  return (
    <Demo
      title="Gallery"
      description="Columns at least 200px wide, at most four. Featured cards span two columns. Cards glide to their new places with a transition on translate, which applies only once a card was placed."
      actions={(
        <>
          <Button onClick={() => setCards(current => [...current, makeCard(current.length + 1)])}>
            <Plus className="size-4" />
            Add
          </Button>
          <Button onClick={shuffle}>
            <Shuffle className="size-4" />
            Shuffle
          </Button>
          <Button onClick={() => setNative(current => (current === "auto" ? "never" : "auto"))}>
            {native === "auto" ? "Place by script" : "Use grid lanes"}
          </Button>
        </>
      )}
    >
      <Masonry.Root minColumnWidth={200} maxColumns={4} native={native} onLayout={setLayout} className="gap-3">
        {cards.map(card => (
          <Masonry.Item
            key={card.id}
            span={card.featured ? 2 : 1}
            className="data-[placed]:transition-[translate] data-[placed]:duration-300 motion-reduce:transition-none"
          >
            <CardBody card={card} />
          </Masonry.Item>
        ))}
      </Masonry.Root>
      <Readout>{describeLayout(layout)}</Readout>
    </Demo>
  );
}

function GrowDemo(): React.ReactNode {
  const [cards, setCards] = React.useState(() => Array.from({ length: 12 }, (_, index) => ({ ...makeCard(index + 20), featured: false })));
  const [assignment, setAssignment] = React.useState<MasonryAssignment>("stable");
  const [grown, setGrown] = React.useState(0);
  const grow = (): void => {
    const target = (grown * 5 + 2) % cards.length;
    setCards(current => current.map((card, index) => (index === target ? { ...card, height: card.height + 120 } : card)));
    setGrown(count => count + 1);
  };
  return (
    <Demo
      title="Cards that grow"
      description="Images that load late make cards grow. With stable assignment every card keeps its column and only moves down; balanced assignment places every card afresh."
      actions={(
        <>
          <Button onClick={grow}>
            <TrendingUp className="size-4" />
            Grow a card
          </Button>
          <Button onClick={() => setAssignment(current => (current === "stable" ? "balanced" : "stable"))}>
            {assignment === "stable" ? "Switch to balanced" : "Switch to stable"}
          </Button>
        </>
      )}
    >
      <Masonry.Root columns={3} assignment={assignment} className="gap-3">
        {cards.map(card => (
          <Masonry.Item key={card.id} className="data-[placed]:transition-[translate] data-[placed]:duration-300 motion-reduce:transition-none">
            <CardBody card={card} />
          </Masonry.Item>
        ))}
      </Masonry.Root>
      <Readout>{`${assignment} assignment · ${grown} grown`}</Readout>
    </Demo>
  );
}

export function MasonryPage(): React.ReactNode {
  return (
    <Page
      title="Masonry"
      description="Items in columns, each going to the column that ends highest, the way CSS grid lanes place them. Browsers with display: grid-lanes do the placing themselves."
    >
      <GalleryDemo />
      <GrowDemo />
    </Page>
  );
}
