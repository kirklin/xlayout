// Importing the entries by package name keeps each namespace the entry's own module namespace,
// which bundlers can tree-shake; a relative import makes the build assemble a separate object.
export * as Dock from "xlayout/dock";
export * as Grid from "xlayout/grid";
export * as Masonry from "xlayout/masonry";
export * as Overflow from "xlayout/overflow";
export * as ScrollSpy from "xlayout/scroll-spy";
export * as Shell from "xlayout/shell";
export * as Splitter from "xlayout/splitter";
export * as Sticky from "xlayout/sticky";
