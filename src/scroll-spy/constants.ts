export const ROOT_NAME = "ScrollSpy";
export const NAV_NAME = "ScrollSpy.Nav";
export const LIST_NAME = "ScrollSpy.List";
export const ITEM_NAME = "ScrollSpy.Item";
export const LINK_NAME = "ScrollSpy.Link";
export const SECTION_NAME = "ScrollSpy.Section";

/** Scroll positions land on fractions of a pixel; a section this close counts as reached. */
export const POSITION_TOLERANCE = 1;

/** How long scrolling must rest before the URL follows the active section. */
export const HASH_SYNC_DELAY = 300;

/**
 * A scroll that starts this long after the last one is the reader's own, which ends the hold
 * a link click puts on its section.
 */
export const NAVIGATION_SETTLE_TIME = 150;

/** Keys that scroll, which also end that hold. */
export const SCROLL_KEYS: ReadonlySet<string> = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);
