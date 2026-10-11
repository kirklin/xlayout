import type { LucideIcon } from "lucide-react";
import type * as React from "react";
import { Columns3, Ellipsis, PanelsTopLeft, Pin } from "lucide-react";
import { OverflowPage } from "~/demos/overflow";
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
  { id: "overflow", label: "Overflow", icon: Ellipsis, page: OverflowPage },
  { id: "sticky", label: "Sticky", icon: Pin, page: StickyPage },
];
