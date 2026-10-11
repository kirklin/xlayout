import type { MasonryAssignment, MasonryLayoutInfo, MasonryNative } from "xlayout/masonry";
import { Plus, Shuffle, TrendingUp } from "lucide-react";
import * as React from "react";
import { Masonry } from "xlayout";
import { Button, Demo, Page, Readout } from "~/components/demo";

interface Photo {
  /** The file in assets/photos, without its extension. */
  name: string;
  width: number;
  height: number;
  alt: string;
}

const GALLERY: Photo[] = [
  { name: "curved-white-wall", width: 720, height: 1080, alt: "A curved white wall rising above a still pool" },
  { name: "desert-panorama", width: 1440, height: 960, alt: "A wide desert under a blue sky" },
  { name: "white-ceramics", width: 720, height: 540, alt: "White ceramic bowls and a bottle on a white table" },
  { name: "sand-ripples", width: 720, height: 1080, alt: "Ripples in the sand and a person's shadow" },
  { name: "concrete-building", width: 720, height: 1080, alt: "A white concrete building under a blue sky" },
  { name: "pink-vases", width: 720, height: 480, alt: "Three pink vases side by side" },
  { name: "yellow-wall", width: 720, height: 979, alt: "A pale yellow wall with a round window" },
  { name: "golden-dunes", width: 720, height: 1080, alt: "Golden dunes with long shadows under a low sun" },
  { name: "green-ceramics", width: 720, height: 480, alt: "Green and white ceramic mugs" },
  { name: "white-planes", width: 720, height: 1083, alt: "White planes of a building against a pale sky" },
  { name: "pink-sand", width: 720, height: 900, alt: "Soft pink desert sand" },
  { name: "trees-and-wall", width: 720, height: 960, alt: "Two trees beside a long white wall" },
  { name: "dune-rows", width: 1440, height: 960, alt: "Rows of dunes in the desert" },
  { name: "concrete-stairs", width: 720, height: 1080, alt: "Concrete stairs casting geometric shadows" },
];

const MORE: Photo[] = [
  { name: "white-building", width: 720, height: 1080, alt: "A white building cut sharply against the sky" },
  { name: "white-steps", width: 720, height: 912, alt: "White steps of a building rising into a blue sky" },
  { name: "colorful-vases", width: 720, height: 405, alt: "Vases in many colors on a table" },
  { name: "desert-doorway", width: 720, height: 1080, alt: "The desert seen through an open doorway" },
  { name: "brown-dunes", width: 720, height: 1008, alt: "Brown dunes under a blue sky" },
  { name: "distant-dunes", width: 720, height: 1080, alt: "Dunes stretching into the distance" },
  { name: "curved-facades", width: 720, height: 480, alt: "Curved white facades seen from below" },
  { name: "teal-sky", width: 720, height: 1093, alt: "The edge of a white building under a teal sky" },
  { name: "copper-facade", width: 720, height: 1078, alt: "A curved copper facade under a blue sky" },
  { name: "dune-ridge", width: 720, height: 1080, alt: "A dune ridge at sunrise" },
  { name: "sea-of-dunes", width: 720, height: 900, alt: "A sea of sand dunes" },
  { name: "ceramic-cup", width: 720, height: 1079, alt: "A brown ceramic cup on a white saucer" },
  { name: "clay-pots", width: 720, height: 480, alt: "Clay pots in many colors" },
];

/** Wide photos of the gallery that span two columns. */
const FEATURED = new Set(["desert-panorama", "dune-rows"]);

const FILES = import.meta.glob<string>("../assets/photos/*.webp", { eager: true, query: "?url", import: "default" });

interface Card {
  key: number;
  photo: Photo;
  featured: boolean;
  /** How much taller than the photo the card is cropped, as when a larger picture loads. */
  stretch: number;
}

function photoUrl(photo: Photo): string {
  const url = FILES[`../assets/photos/${photo.name}.webp`];
  if (url === undefined) {
    throw new Error(`There is no photo named ${photo.name}.`);
  }
  return url;
}

function makeCard(key: number, photo: Photo): Card {
  return { key, photo, featured: FEATURED.has(photo.name), stretch: 1 };
}

function PhotoCard({ card }: { card: Card }): React.ReactNode {
  const { photo } = card;
  return (
    <figure className="group relative overflow-hidden rounded-xl bg-zinc-200/70 dark:bg-zinc-800">
      <img
        src={photoUrl(photo)}
        alt={photo.alt}
        loading="lazy"
        decoding="async"
        className="block w-full object-cover"
        style={{ aspectRatio: `${photo.width} / ${photo.height * card.stretch}` }}
      />
      <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/60 to-transparent px-3 pt-10 pb-2.5 text-sm text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        {photo.alt}
      </figcaption>
    </figure>
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
  const [cards, setCards] = React.useState(() => GALLERY.map((photo, index) => makeCard(index, photo)));
  const [native, setNative] = React.useState<MasonryNative>("auto");
  const [layout, setLayout] = React.useState<MasonryLayoutInfo | null>(null);
  const add = (): void => {
    setCards(current => [...current, makeCard(current.length, MORE[(current.length - GALLERY.length) % MORE.length]!)]);
  };
  const shuffle = (): void => {
    setCards(current => [...current].sort((a, b) => ((a.key * 31 + current.length) % 17) - ((b.key * 31 + current.length) % 17)));
  };
  return (
    <Demo
      title="Gallery"
      description="Columns at least 200px wide, at most four. Wide photos span two columns. Photos glide to their new places with a transition on translate, which applies only once a photo was placed. Photos from Unsplash."
      actions={(
        <>
          <Button onClick={add}>
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
            key={card.key}
            span={card.featured ? 2 : 1}
            className="data-[placed]:transition-[translate] data-[placed]:duration-300 motion-reduce:transition-none"
          >
            <PhotoCard card={card} />
          </Masonry.Item>
        ))}
      </Masonry.Root>
      <Readout>{describeLayout(layout)}</Readout>
    </Demo>
  );
}

function GrowDemo(): React.ReactNode {
  const [cards, setCards] = React.useState(() => MORE.slice(0, 12).map((photo, index) => ({ ...makeCard(index, photo), featured: false })));
  const [assignment, setAssignment] = React.useState<MasonryAssignment>("stable");
  const [grown, setGrown] = React.useState(0);
  const grow = (): void => {
    const target = (grown * 5 + 2) % cards.length;
    setCards(current => current.map((card, index) => (index === target ? { ...card, stretch: card.stretch * 1.6 } : card)));
    setGrown(count => count + 1);
  };
  return (
    <Demo
      title="Cards that grow"
      description="Pictures that load late make cards grow. With stable assignment every card keeps its column and only moves down; balanced assignment places every card afresh."
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
          <Masonry.Item key={card.key} className="data-[placed]:transition-[translate] data-[placed]:duration-300 motion-reduce:transition-none">
            <PhotoCard card={card} />
          </Masonry.Item>
        ))}
      </Masonry.Root>
      <Readout>{`${assignment} assignment · ${grown} grown`}</Readout>
    </Demo>
  );
}

const PHOTOS = [...GALLERY, ...MORE];
const FEED_COUNT = 10_000;

function photoAt(index: number): Photo {
  return PHOTOS[index % PHOTOS.length]!;
}

function spanAt(index: number): number {
  return FEATURED.has(photoAt(index).name) ? 2 : 1;
}

/** A photo not shown yet is taken to be as high as its aspect ratio makes it at the column width. */
function estimateAt(index: number, columnWidth: number): number {
  const photo = photoAt(index);
  return (columnWidth * spanAt(index) * photo.height) / photo.width;
}

function FeedDemo(): React.ReactNode {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [layout, setLayout] = React.useState<MasonryLayoutInfo | null>(null);
  const [rendered, setRendered] = React.useState(0);
  React.useEffect(() => {
    const root = rootRef.current!;
    const count = (): void => setRendered(root.childElementCount);
    count();
    const observer = new MutationObserver(count);
    observer.observe(root, { childList: true });
    return () => observer.disconnect();
  }, []);
  return (
    <Demo
      title="Ten thousand photos"
      description="Given a count, the root renders only the photos near the scrollport, from a function, and measures each one as it shows; the others take their height from their aspect ratio. Photos measured above what you look at keep it in place."
    >
      <div className="h-[560px] overflow-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <Masonry.Root
          ref={rootRef}
          count={FEED_COUNT}
          minColumnWidth={180}
          maxColumns={5}
          getItemSpan={spanAt}
          estimateHeight={estimateAt}
          onLayout={setLayout}
          className="gap-3 p-3"
        >
          {index => (
            <Masonry.Item>
              <PhotoCard card={{ key: index, photo: photoAt(index), featured: false, stretch: 1 }} />
            </Masonry.Item>
          )}
        </Masonry.Root>
      </div>
      <Readout>{`${rendered} of ${FEED_COUNT.toLocaleString("en-US")} photos rendered · ${describeLayout(layout)}`}</Readout>
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
      <FeedDemo />
    </Page>
  );
}
