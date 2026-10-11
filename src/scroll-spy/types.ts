/**
 * How a link click navigates. `"native"` follows the link, which adds a history entry;
 * `"replace"` scrolls to the section and replaces the URL's hash; `"none"` scrolls to the
 * section and leaves the URL alone, for apps that route on the hash.
 */
export type ScrollSpyNavigation = "native" | "replace" | "none";

/** What is active before scrolling reaches the first section: the first section, or nothing. */
export type ScrollSpyFallback = "first" | "none";

/** Where the sections are in the scroller's content along the block axis, which scrolling does not change. */
export interface SectionGeometry {
  /** Where each section starts and ends in the content. */
  tops: Float64Array;
  bottoms: Float64Array;
  /** For each section, the scroll position that brings its start to the top of the scrollport. */
  positions: number[];
  /** The scroller's scroll padding at the top. */
  paddingTop: number;
  scrollportSize: number;
  /** How far the scroller can scroll. */
  scrollRange: number;
}
