import * as React from "react";

/** The nonce the page's content security policy allows style elements with, when it is given one. */
export const CspContext = React.createContext<string | undefined>(undefined);

/** Marks an element whose styles a style element carries, while the server markup shows. */
export const STYLE_KEY_ATTRIBUTE = "data-xlayout-css";

function subscribeToNothing(): () => void {
  return () => {};
}

function onClient(): boolean {
  return false;
}

function onServer(): boolean {
  return true;
}

/**
 * Whether this render writes server markup or hydrates it. It turns `false` right after the
 * component hydrated, and is `false` from the start for components mounted on the client.
 */
export function useServerMarkup(): boolean {
  return React.useSyncExternalStore(subscribeToNothing, onClient, onServer);
}

/**
 * The rule that gives the element with `key` its styles. The selector counts as an id, so the
 * rule wins over class rules the way the `style` attribute it stands in for would.
 */
export function styleRule(key: string, declarations: string): string {
  return `:is([${STYLE_KEY_ATTRIBUTE}="${key}"],#xlayout-css){${declarations}}`;
}
