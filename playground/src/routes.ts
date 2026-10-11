import type { LucideIcon } from "lucide-react";
import type * as React from "react";
import { Columns3, Ellipsis, LayoutDashboard, LayoutGrid, PanelsTopLeft, Pin, TableOfContents } from "lucide-react";
import { GridPage } from "~/demos/grid";
import { MasonryPage } from "~/demos/masonry";
import { OverflowPage } from "~/demos/overflow";
import { ScrollSpyPage } from "~/demos/scroll-spy";
import { ShellPage } from "~/demos/shell";
import { SplitterPage } from "~/demos/splitter";
import { StickyPage } from "~/demos/sticky";

export interface Route {
  id: string;
  label: string;
  icon: LucideIcon;
  page: () => React.ReactNode;
}

export const ROUTES: Route[] = [
  { id: "shell", label: "Shell", icon: PanelsTopLeft, page: ShellPage },
  { id: "splitter", label: "Splitter", icon: Columns3, page: SplitterPage },
  { id: "grid", label: "Grid", icon: LayoutGrid, page: GridPage },
  { id: "masonry", label: "Masonry", icon: LayoutDashboard, page: MasonryPage },
  { id: "overflow", label: "Overflow", icon: Ellipsis, page: OverflowPage },
  { id: "sticky", label: "Sticky", icon: Pin, page: StickyPage },
  { id: "scroll-spy", label: "Scroll spy", icon: TableOfContents, page: ScrollSpyPage },
];
