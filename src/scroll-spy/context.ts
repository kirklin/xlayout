import * as React from "react";
import { createRequiredContext } from "../shared/context";
import { ITEM_NAME, NAV_NAME, ROOT_NAME } from "./constants";

export interface SectionEntry {
  value: string;
  element: HTMLElement;
}

export interface ItemEntry {
  value: string;
  /** The value of the item this one is nested in. */
  parent: string | null;
}

export interface ScrollSpyContextValue {
  active: string | null;
  visible: ReadonlySet<string>;
  passed: ReadonlySet<string>;
  /** The items the active item is nested in. */
  trail: ReadonlySet<string>;
  ariaCurrent: "true" | "location";
  registerSection: (entry: SectionEntry) => () => void;
  registerItem: (entry: ItemEntry) => () => void;
  /** Scrolls to a section; a link passes its click, which native navigation follows. */
  navigate: (value: string, event?: React.MouseEvent<HTMLAnchorElement>) => void;
}

export const [ScrollSpyContext, useScrollSpyContext] = createRequiredContext<ScrollSpyContextValue>(ROOT_NAME);

export interface ItemContextValue {
  value: string;
  depth: number;
}

/** Optional: lists at the top level sit in no item. */
export const ItemContext = React.createContext<ItemContextValue | null>(null);
ItemContext.displayName = `${ITEM_NAME}Context`;

export interface NavContextValue {
  /** Tells the nav which of its links is active; returns a function that takes it back. */
  showActiveLink: (element: HTMLElement) => () => void;
}

/** Optional: links outside a nav have no indicator to move. */
export const NavContext = React.createContext<NavContextValue | null>(null);
NavContext.displayName = `${NAV_NAME}Context`;
