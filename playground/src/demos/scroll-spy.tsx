import { Check } from "lucide-react";
import * as React from "react";
import { ScrollSpy, Sticky } from "xlayout";
import { Demo, Page, Readout } from "~/components/demo";
import { cn } from "~/lib/cn";

const frame = "rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900";

interface Topic {
  value: string;
  title: string;
  paragraphs: number;
  topics?: Topic[];
}

const GUIDE: Topic[] = [
  { value: "spy-overview", title: "Overview", paragraphs: 2 },
  {
    value: "spy-install",
    title: "Installation",
    paragraphs: 1,
    topics: [
      { value: "spy-install-package", title: "The package", paragraphs: 2 },
      { value: "spy-install-styles", title: "Styles", paragraphs: 2 },
    ],
  },
  { value: "spy-anatomy", title: "Anatomy", paragraphs: 3 },
  {
    value: "spy-reading",
    title: "Reading position",
    paragraphs: 1,
    topics: [
      { value: "spy-reading-start", title: "Where a section begins", paragraphs: 2 },
      { value: "spy-reading-end", title: "Near the end", paragraphs: 1 },
    ],
  },
  { value: "spy-accessibility", title: "Accessibility", paragraphs: 1 },
  { value: "spy-questions", title: "Questions", paragraphs: 1 },
];

const PARAGRAPH = "The links follow the reader through the text. A section counts as reached once its start passes the top of the scroll area, below anything that sticks there, and the last few short sections near the end of the page take turns over the last stretch of scrolling, so every one of them can be marked.";

function Paragraphs({ count }: { count: number }): React.ReactNode {
  return Array.from({ length: count }, (_, index) => (
    <p key={index} className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{PARAGRAPH}</p>
  ));
}

function TopicSection({ topic, depth }: { topic: Topic; depth: number }): React.ReactNode {
  const Heading = depth === 0 ? "h3" : "h4";
  return (
    <ScrollSpy.Section value={topic.value} className="flex scroll-mt-10 flex-col gap-3 pt-6 outline-none">
      <Heading className={cn("font-semibold", depth === 0 ? "text-lg" : "text-base")}>{topic.title}</Heading>
      <Paragraphs count={topic.paragraphs} />
      {topic.topics?.map(child => <TopicSection key={child.value} topic={child} depth={depth + 1} />)}
    </ScrollSpy.Section>
  );
}

const tocLink = cn(
  "block rounded px-2 py-1 text-zinc-500 outline-none transition-colors hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-blue-500",
  "data-[active-trail]:text-zinc-900 data-[state=active]:font-medium data-[state=active]:text-blue-600",
  "dark:text-zinc-400 dark:hover:text-zinc-100 dark:data-[active-trail]:text-zinc-100 dark:data-[state=active]:text-blue-400",
);

function TopicItem({ topic }: { topic: Topic }): React.ReactNode {
  return (
    <ScrollSpy.Item value={topic.value}>
      <ScrollSpy.Link className={tocLink}>{topic.title}</ScrollSpy.Link>
      {topic.topics && (
        <ScrollSpy.List className="flex flex-col gap-0.5 ps-3">
          {topic.topics.map(child => <TopicItem key={child.value} topic={child} />)}
        </ScrollSpy.List>
      )}
    </ScrollSpy.Item>
  );
}

function ReadingState(): React.ReactNode {
  const { value, visible } = ScrollSpy.useScrollSpy();
  return <Readout>{`active ${value ?? "none"} · in view ${visible.join(", ")}`}</Readout>;
}

function GuideDemo(): React.ReactNode {
  return (
    <Demo
      title="Table of contents"
      description="Nested links mark the active section and the trail above it, and the bar beside them follows the active link. The article's title sticks, and sections keep clear of it with scroll-margin-top. The links scroll without touching the URL, since this page routes on the hash."
    >
      <ScrollSpy.Root navigation="none">
        <div className={cn(frame, "grid h-[480px] grid-cols-[1fr_15rem] overflow-hidden max-md:grid-cols-1")}>
          <div className="overflow-auto">
            <Sticky.Root className="z-10 flex h-10 items-center border-b border-zinc-200 bg-white/90 px-5 text-sm font-semibold backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
              Using scroll spy
            </Sticky.Root>
            <div className="px-5 pb-6">
              {GUIDE.map(topic => <TopicSection key={topic.value} topic={topic} depth={0} />)}
            </div>
          </div>
          <ScrollSpy.Nav aria-label="On this page" className="group/nav relative overflow-auto border-s border-zinc-200 p-4 max-md:hidden dark:border-zinc-800">
            <div
              aria-hidden
              className={cn(
                "absolute start-2 hidden w-0.5 rounded-full bg-blue-600 transition-[top,height] duration-200 group-data-[active]/nav:block dark:bg-blue-400",
                "top-(--xlayout-scroll-spy-indicator-top) h-(--xlayout-scroll-spy-indicator-height)",
              )}
            />
            <p className="px-2 pb-2 text-xs font-medium tracking-wide text-zinc-400 uppercase">On this page</p>
            <ScrollSpy.List className="flex flex-col gap-0.5 text-sm">
              {GUIDE.map(topic => <TopicItem key={topic.value} topic={topic} />)}
            </ScrollSpy.List>
          </ScrollSpy.Nav>
        </div>
        <ReadingState />
      </ScrollSpy.Root>
    </Demo>
  );
}

const STEPS = [
  { value: "step-account", title: "Account", detail: "Sign in or continue as a guest." },
  { value: "step-address", title: "Address", detail: "Where the order goes." },
  { value: "step-delivery", title: "Delivery", detail: "Standard, express or pick-up." },
  { value: "step-payment", title: "Payment", detail: "Card, transfer or invoice." },
  { value: "step-gift", title: "Gift wrap", detail: "Paper, ribbon and a note." },
  { value: "step-review", title: "Review", detail: "Everything at a glance." },
  { value: "step-confirm", title: "Confirm", detail: "Place the order." },
];

function StepsDemo(): React.ReactNode {
  return (
    <Demo
      title="Steps"
      description="A row of steps above a long form. Passed steps get a check, and the row scrolls on its own to keep the active step in view when it is too narrow."
    >
      <ScrollSpy.Root navigation="none">
        <div className={cn(frame, "flex h-[420px] flex-col overflow-hidden")}>
          <ScrollSpy.Nav aria-label="Checkout steps" className="shrink-0 overflow-x-auto border-b border-zinc-200 p-2 dark:border-zinc-800">
            <ScrollSpy.List className="flex gap-1.5">
              {STEPS.map(step => (
                <ScrollSpy.Item key={step.value} value={step.value} className="shrink-0">
                  <ScrollSpy.Link
                    className={cn(
                      "group/step flex h-8 items-center gap-1.5 rounded-full border border-zinc-200 px-3 text-sm whitespace-nowrap text-zinc-600 outline-none",
                      "hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800",
                      "data-[state=active]:border-blue-600 data-[state=active]:bg-blue-600 data-[state=active]:text-white",
                    )}
                  >
                    <Check className="hidden size-3.5 group-data-[passed]/step:block" />
                    {step.title}
                  </ScrollSpy.Link>
                </ScrollSpy.Item>
              ))}
            </ScrollSpy.List>
          </ScrollSpy.Nav>
          <div className="flex-1 overflow-auto px-5">
            {STEPS.map((step, index) => (
              <ScrollSpy.Section key={step.value} value={step.value} className="flex min-h-56 flex-col gap-2 border-b border-zinc-100 py-6 outline-none dark:border-zinc-800">
                <span className="text-xs font-medium text-zinc-400">{`Step ${index + 1} of ${STEPS.length}`}</span>
                <h3 className="text-lg font-semibold">{step.title}</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">{step.detail}</p>
                <div className="mt-2 h-9 max-w-sm rounded-md border border-dashed border-zinc-300 dark:border-zinc-700" />
              </ScrollSpy.Section>
            ))}
          </div>
        </div>
      </ScrollSpy.Root>
    </Demo>
  );
}

export function ScrollSpyPage(): React.ReactNode {
  return (
    <Page
      title="Scroll spy"
      description="Follows which section of a scrolling document the reader is at and marks its links, choosing the active section the way CSS chooses the active scroll marker."
    >
      <GuideDemo />
      <StepsDemo />
    </Page>
  );
}
