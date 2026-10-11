export const ROOT_NAME = "Masonry";
export const ITEM_NAME = "Masonry.Item";

/** Used when neither a column count nor a minimum column width is given. */
export const DEFAULT_MIN_COLUMN_WIDTH = 240;

/** Pixels beyond each end of the scrollport in which a virtual root renders items too. */
export const DEFAULT_OVERSCAN = 800;
/** Items a virtual root renders before it knows its columns, as on the server. */
export const DEFAULT_INITIAL_COUNT = 12;
/** Items between the saved column ends that placing a long list starts again from. */
export const CHECKPOINT_INTERVAL = 256;

/** The names browsers have given the grid lanes tolerance property, newest first. */
export const NATIVE_TOLERANCE_PROPERTIES = ["fit-tolerance", "flow-tolerance"] as const;
