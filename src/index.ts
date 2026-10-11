// Each component entry is a client module; importing it by package name keeps the namespace
// a module namespace, so Server Components can render `Splitter.Root` and friends.
export * as Overflow from "xlayout/overflow";
export * as ScrollSpy from "xlayout/scroll-spy";
export * as Shell from "xlayout/shell";
export * as Splitter from "xlayout/splitter";
export * as Sticky from "xlayout/sticky";
