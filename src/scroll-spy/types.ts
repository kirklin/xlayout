/**
 * How a link click navigates. `"native"` follows the link, which adds a history entry;
 * `"replace"` scrolls to the section and replaces the URL's hash; `"none"` scrolls to the
 * section and leaves the URL alone, for apps that route on the hash.
 */
export type ScrollSpyNavigation = "native" | "replace" | "none";

/** What is active before scrolling reaches the first section: the first section, or nothing. */
export type ScrollSpyFallback = "first" | "none";

/** Where the sections are relative to the scrollport, along the block axis. */
export interface SectionMeasurement {
  /** For each section, the scroll position that brings its start to the top of the scrollport. */
  positions: number[];
  scrollPosition: number;
  scrollportSize: number;
  /** How far the scroller can scroll. */
  scrollRange: number;
  /** Whether each section shows in the scrollport. */
  visible: boolean[];
  /** Whether each section ends above the scrollport's top, after scroll padding. */
  passed: boolean[];
}
