import type * as React from "react";
import type { Orientation } from "../shared/types";

export const ROOT_NAME = "Overflow";
export const ITEM_NAME = "Overflow.Item";
export const DIVIDER_NAME = "Overflow.Divider";
export const INDICATOR_NAME = "Overflow.Indicator";

/** Sub-pixel layouts can differ by rounding alone; sizes this close count as equal. */
export const LAYOUT_TOLERANCE = 0.5;

/**
 * Hidden parts leave the line but keep laying out, so they can still be measured; `inert`
 * keeps them away from the pointer, the keyboard and assistive technology. A horizontal part
 * starts one root width before the start, so a part wider than the root is not narrowed to the
 * root's width; a vertical part starts at the start, so its content wraps within the root's
 * width as it does on the line.
 */
export const HIDDEN_STYLES: Record<Orientation, React.CSSProperties> = {
  horizontal: { position: "absolute", insetBlockStart: 0, insetInlineStart: "-100%", visibility: "hidden" },
  vertical: { position: "absolute", insetBlockStart: 0, insetInlineStart: 0, visibility: "hidden" },
};
