import type { LucideIcon } from "lucide-react";
import {
  Archive,
  Bold,
  Calendar,
  Check,
  ChevronRight,
  Code,
  Ellipsis,
  File,
  Heading1,
  Heading2,
  Highlighter,
  House,
  Image,
  Inbox,
  Italic,
  Link,
  List,
  ListOrdered,
  Quote,
  Send,
  Settings,
  Star,
  Strikethrough,
  Table,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignJustify,
  TextAlignStart,
  Trash2,
  Underline,
  Users,
} from "lucide-react";
import * as React from "react";
import { Overflow } from "xlayout";
import { Demo, Page, Readout } from "~/components/demo";
import { cn } from "~/lib/cn";

const MENU_WIDTH = 192;
const VIEWPORT_MARGIN = 8;

const frame = "max-w-full rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900";

const toolButton = cn(
  "inline-flex size-8 items-center justify-center rounded-md text-zinc-600 outline-none",
  "hover:bg-zinc-100 hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-blue-500",
  "aria-pressed:bg-zinc-200 aria-pressed:text-zinc-900",
  "dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 dark:aria-pressed:bg-zinc-700 dark:aria-pressed:text-zinc-100",
);

const menuItem = cn(
  "flex h-8 w-full items-center gap-2 rounded-md px-2 text-start text-sm text-zinc-700 outline-none",
  "hover:bg-zinc-100 focus-visible:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:focus-visible:bg-zinc-800",
);

interface SizeSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

function SizeSlider({ label, value, min, max, onChange }: SizeSliderProps): React.ReactNode {
  return (
    <label className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
      {label}
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={event => onChange(Number(event.target.value))}
        className="w-36 accent-blue-600"
      />
      <span className="w-14 tabular-nums">{`${value}px`}</span>
    </label>
  );
}

interface OverflowMenuProps {
  /** Names the menu, and the trigger when it shows no text. */
  label: string;
  trigger: React.ReactNode;
  triggerClassName?: string;
  showTriggerLabel?: boolean;
  children: React.ReactNode;
}

/** A menu in the top layer, so the root's clipping never cuts it off. */
function OverflowMenu({ label, trigger, triggerClassName, showTriggerLabel = false, children }: OverflowMenuProps): React.ReactNode {
  const { isOverflowing } = Overflow.useOverflow();
  const menuId = React.useId();
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);
  const [position, setPosition] = React.useState({ top: 0, left: 0 });

  const place = React.useCallback(() => {
    const button = buttonRef.current;
    if (!button) {
      return;
    }
    const rect = button.getBoundingClientRect();
    const left = Math.min(Math.max(VIEWPORT_MARGIN, rect.right - MENU_WIDTH), window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN);
    setPosition({ top: rect.bottom + 4, left });
  }, []);

  React.useEffect(() => {
    if (!open) {
      return;
    }
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  // Once everything fits, the trigger hides and its menu has nothing left to list.
  React.useEffect(() => {
    const menu = menuRef.current;
    if (!isOverflowing && menu?.matches(":popover-open")) {
      menu.hidePopover();
    }
  }, [isOverflowing]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        popoverTarget={menuId}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={showTriggerLabel ? undefined : label}
        className={triggerClassName}
      >
        {trigger}
      </button>
      <div
        ref={menuRef}
        id={menuId}
        popover="auto"
        role="menu"
        aria-label={label}
        onBeforeToggle={(event) => {
          if (event.newState === "open") {
            place();
          }
        }}
        onToggle={event => setOpen(event.newState === "open")}
        onClick={(event) => {
          if (event.target instanceof Element && event.target.closest("[role^=menuitem]")) {
            event.currentTarget.hidePopover();
          }
        }}
        style={{ top: position.top, left: position.left, width: MENU_WIDTH }}
        className="fixed inset-auto m-0 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
      >
        {children}
      </div>
    </>
  );
}

interface Action {
  value: string;
  label: string;
  icon: LucideIcon;
}

interface ActionGroup {
  name: string;
  priority: number;
  actions: Action[];
}

const TOOLBAR: ActionGroup[] = [
  {
    name: "text",
    priority: 1,
    actions: [
      { value: "bold", label: "Bold", icon: Bold },
      { value: "italic", label: "Italic", icon: Italic },
      { value: "underline", label: "Underline", icon: Underline },
      { value: "strikethrough", label: "Strikethrough", icon: Strikethrough },
      { value: "highlight", label: "Highlight", icon: Highlighter },
    ],
  },
  {
    name: "blocks",
    priority: 0,
    actions: [
      { value: "heading-1", label: "Heading 1", icon: Heading1 },
      { value: "heading-2", label: "Heading 2", icon: Heading2 },
      { value: "quote", label: "Quote", icon: Quote },
      { value: "bulleted-list", label: "Bulleted list", icon: List },
      { value: "numbered-list", label: "Numbered list", icon: ListOrdered },
    ],
  },
  {
    name: "align",
    priority: 0,
    actions: [
      { value: "align-start", label: "Align start", icon: TextAlignStart },
      { value: "align-center", label: "Align center", icon: TextAlignCenter },
      { value: "align-end", label: "Align end", icon: TextAlignEnd },
      { value: "align-justify", label: "Justify", icon: TextAlignJustify },
    ],
  },
  {
    name: "insert",
    priority: 0,
    actions: [
      { value: "link", label: "Link", icon: Link },
      { value: "image", label: "Image", icon: Image },
      { value: "table", label: "Table", icon: Table },
      { value: "code", label: "Code block", icon: Code },
    ],
  },
];

function HiddenActions({ pressed, onToggle }: { pressed: ReadonlySet<string>; onToggle: (value: string) => void }): React.ReactNode {
  const { hidden } = Overflow.useOverflow();
  return TOOLBAR.map((group) => {
    const actions = group.actions.filter(action => hidden.includes(action.value));
    if (actions.length === 0) {
      return null;
    }
    return (
      <div key={group.name} role="group" className="border-zinc-100 py-1 not-first:border-t first:pt-0 last:pb-0 dark:border-zinc-800">
        {actions.map((action) => {
          const Icon = action.icon;
          const checked = pressed.has(action.value);
          return (
            <button key={action.value} type="button" role="menuitemcheckbox" aria-checked={checked} onClick={() => onToggle(action.value)} className={menuItem}>
              <Icon className="size-4 text-zinc-500" />
              {action.label}
              {checked && <Check className="ms-auto size-4 text-blue-600" />}
            </button>
          );
        })}
      </div>
    );
  });
}

function ToolbarDemo(): React.ReactNode {
  const [width, setWidth] = React.useState(560);
  const [pressed, setPressed] = React.useState<ReadonlySet<string>>(() => new Set(["bold", "align-start"]));
  const [hidden, setHidden] = React.useState<string[]>([]);
  const toggle = (value: string): void => {
    setPressed((current) => {
      const next = new Set(current);
      if (!next.delete(value)) {
        next.add(value);
      }
      return next;
    });
  };
  return (
    <Demo
      title="Toolbar"
      description="Groups with dividers. Text formatting stays longest, everything else hides from the end, and the menu button keeps to the end with an auto margin."
      actions={<SizeSlider label="Width" value={width} min={160} max={720} onChange={setWidth} />}
    >
      <div className={cn(frame, "p-1")} style={{ width }}>
        <Overflow.Root role="group" aria-label="Formatting" onOverflowChange={state => setHidden(state.hidden)} className="items-center gap-0.5">
          {TOOLBAR.map((group, index) => (
            <React.Fragment key={group.name}>
              {index > 0 && (
                <Overflow.Divider
                  group={TOOLBAR[index - 1]!.name}
                  role="separator"
                  aria-orientation="vertical"
                  className="mx-1 h-5 w-px bg-zinc-200 dark:bg-zinc-700"
                />
              )}
              {group.actions.map((action) => {
                const Icon = action.icon;
                return (
                  <Overflow.Item key={action.value} value={action.value} group={group.name} priority={group.priority} asChild>
                    <button type="button" aria-label={action.label} aria-pressed={pressed.has(action.value)} onClick={() => toggle(action.value)} className={toolButton}>
                      <Icon className="size-4" />
                    </button>
                  </Overflow.Item>
                );
              })}
            </React.Fragment>
          ))}
          <Overflow.Indicator className="ms-auto">
            <OverflowMenu label="More formatting" trigger={<Ellipsis className="size-4" />} triggerClassName={toolButton}>
              <HiddenActions pressed={pressed} onToggle={toggle} />
            </OverflowMenu>
          </Overflow.Indicator>
        </Overflow.Root>
      </div>
      <Readout>{hidden.length > 0 ? `hidden: ${hidden.join(", ")}` : "everything fits"}</Readout>
    </Demo>
  );
}

const PAGES = [
  { value: "projects", label: "Projects" },
  { value: "xlayout", label: "xlayout" },
  { value: "src", label: "src" },
  { value: "overflow", label: "overflow" },
  { value: "file", label: "overflow.tsx" },
];

const crumbLink = "rounded px-1 text-zinc-500 outline-none hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-zinc-400 dark:hover:text-zinc-100";

function CrumbSeparator(): React.ReactNode {
  return <ChevronRight aria-hidden className="size-3.5 shrink-0 text-zinc-400 rtl:-scale-x-100" />;
}

function HiddenPages(): React.ReactNode {
  const { hidden } = Overflow.useOverflow();
  return PAGES.filter(page => hidden.includes(page.value)).map(page => (
    <a key={page.value} href="#overflow" role="menuitem" className={menuItem}>{page.label}</a>
  ));
}

function BreadcrumbsDemo(): React.ReactNode {
  const [width, setWidth] = React.useState(520);
  return (
    <Demo
      title="Breadcrumbs"
      description="Home and the current page are pinned. The pages between them hide from the start, and the menu takes their place."
      actions={<SizeSlider label="Width" value={width} min={200} max={720} onChange={setWidth} />}
    >
      <nav aria-label="Breadcrumb" className={cn(frame, "px-3 py-2")} style={{ width }}>
        <Overflow.Root overflowDirection="start" asChild className="items-center gap-1 text-sm">
          <ol>
            <Overflow.Item value="home" pinned asChild>
              <li className="flex items-center">
                <a href="#overflow" className={cn(crumbLink, "flex items-center gap-1.5")}>
                  <House className="size-3.5" />
                  Home
                </a>
              </li>
            </Overflow.Item>
            <Overflow.Indicator asChild>
              <li className="flex items-center gap-1">
                <CrumbSeparator />
                <OverflowMenu label="Hidden pages" trigger={<Ellipsis className="size-4" />} triggerClassName={cn(crumbLink, "flex h-6 items-center")}>
                  <HiddenPages />
                </OverflowMenu>
              </li>
            </Overflow.Indicator>
            {PAGES.map((page, index) => {
              const current = index === PAGES.length - 1;
              return (
                <Overflow.Item key={page.value} value={page.value} pinned={current} asChild>
                  <li className="flex items-center gap-1">
                    <CrumbSeparator />
                    {current
                      ? <span aria-current="page" className="px-1 font-medium">{page.label}</span>
                      : <a href="#overflow" className={crumbLink}>{page.label}</a>}
                  </li>
                </Overflow.Item>
              );
            })}
          </ol>
        </Overflow.Root>
      </nav>
    </Demo>
  );
}

const TABS = ["Overview", "Activity", "Pull requests", "Issues", "Discussions", "Actions", "Projects", "Wiki", "Security", "Insights", "Settings"];

function HiddenTabs({ onSelect }: { onSelect: (tab: string) => void }): React.ReactNode {
  const { hidden } = Overflow.useOverflow();
  return hidden.map(tab => (
    <button key={tab} type="button" role="menuitem" onClick={() => onSelect(tab)} className={menuItem}>{tab}</button>
  ));
}

function TabsDemo(): React.ReactNode {
  const [width, setWidth] = React.useState(600);
  const [selected, setSelected] = React.useState("Overview");
  return (
    <Demo
      title="Navigation tabs"
      description="The selected tab is pinned, so choosing a hidden one from the menu brings it into view and pushes another out."
      actions={<SizeSlider label="Width" value={width} min={220} max={900} onChange={setWidth} />}
    >
      <nav aria-label="Repository" className={cn(frame, "px-2")} style={{ width }}>
        <Overflow.Root className="h-11 items-stretch gap-1">
          {TABS.map(tab => (
            <Overflow.Item key={tab} value={tab} pinned={tab === selected} asChild>
              <a
                href="#overflow"
                aria-current={tab === selected ? "page" : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  setSelected(tab);
                }}
                className={cn(
                  "flex items-center border-b-2 border-transparent px-2.5 text-sm whitespace-nowrap text-zinc-500 outline-none",
                  "hover:text-zinc-900 focus-visible:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:focus-visible:bg-zinc-800",
                  "aria-[current=page]:border-blue-600 aria-[current=page]:font-medium aria-[current=page]:text-zinc-900 dark:aria-[current=page]:text-zinc-100",
                )}
              >
                {tab}
              </a>
            </Overflow.Item>
          ))}
          <Overflow.Indicator className="flex items-center">
            <OverflowMenu
              label="More tabs"
              showTriggerLabel
              trigger={(
                <>
                  More
                  <Ellipsis className="size-4" />
                </>
              )}
              triggerClassName={cn(toolButton, "w-auto gap-1.5 px-2.5 text-sm")}
            >
              <HiddenTabs onSelect={setSelected} />
            </OverflowMenu>
          </Overflow.Indicator>
        </Overflow.Root>
      </nav>
    </Demo>
  );
}

const PLACES: Action[] = [
  { value: "inbox", label: "Inbox", icon: Inbox },
  { value: "starred", label: "Starred", icon: Star },
  { value: "sent", label: "Sent", icon: Send },
  { value: "drafts", label: "Drafts", icon: File },
  { value: "archive", label: "Archive", icon: Archive },
  { value: "trash", label: "Trash", icon: Trash2 },
  { value: "calendar", label: "Calendar", icon: Calendar },
  { value: "contacts", label: "Contacts", icon: Users },
];

const placeButton = cn(
  "flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-sm text-zinc-600 outline-none",
  "hover:bg-zinc-100 hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-blue-500",
  "dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
);

function HiddenPlaces(): React.ReactNode {
  const { hidden } = Overflow.useOverflow();
  return PLACES.filter(place => hidden.includes(place.value)).map((place) => {
    const Icon = place.icon;
    return (
      <button key={place.value} type="button" role="menuitem" className={menuItem}>
        <Icon className="size-4 text-zinc-500" />
        {place.label}
      </button>
    );
  });
}

function VerticalDemo(): React.ReactNode {
  const [height, setHeight] = React.useState(300);
  return (
    <Demo
      title="Vertical"
      description="A column with a fixed height. Settings is pinned and kept at the bottom with an auto margin; the places above it hide from the end."
      actions={<SizeSlider label="Height" value={height} min={120} max={360} onChange={setHeight} />}
    >
      <div className={cn(frame, "w-60 p-2")} style={{ height }}>
        <Overflow.Root orientation="vertical" role="group" aria-label="Places" className="h-full gap-0.5">
          {PLACES.map((place) => {
            const Icon = place.icon;
            return (
              <Overflow.Item key={place.value} value={place.value} asChild>
                <button type="button" className={placeButton}>
                  <Icon className="size-4" />
                  {place.label}
                </button>
              </Overflow.Item>
            );
          })}
          <Overflow.Indicator>
            <OverflowMenu
              label="More places"
              showTriggerLabel
              trigger={(
                <>
                  <Ellipsis className="size-4" />
                  More
                </>
              )}
              triggerClassName={placeButton}
            >
              <HiddenPlaces />
            </OverflowMenu>
          </Overflow.Indicator>
          <Overflow.Item value="settings" pinned asChild className="mt-auto">
            <button type="button" className={placeButton}>
              <Settings className="size-4" />
              Settings
            </button>
          </Overflow.Item>
        </Overflow.Root>
      </div>
    </Demo>
  );
}

export function OverflowPage(): React.ReactNode {
  return (
    <Page
      title="Overflow"
      description="Keeps a row or a column of items to the space it has. Items that do not fit hide by priority, and an indicator takes their place, usually a menu that lists them."
    >
      <ToolbarDemo />
      <BreadcrumbsDemo />
      <TabsDemo />
      <VerticalDemo />
    </Page>
  );
}
