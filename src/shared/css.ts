import type * as React from "react";

/** Properties React writes numbers to without `px`, as listed in React DOM. */
const UNITLESS = new Set(
  "animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(" "),
);

/**
 * The declarations of a style object, written the way React writes a `style` attribute.
 * A `<` would let the text end the style element it goes into, so it is written escaped.
 */
export function styleToCss(style: React.CSSProperties): string {
  const declarations: string[] = [];
  for (const [name, value] of Object.entries(style) as [string, unknown][]) {
    if (value === null || value === undefined || typeof value === "boolean" || value === "") {
      continue;
    }
    let property = name;
    let text: string;
    if (name.startsWith("--")) {
      text = String(value).trim();
    } else {
      property = name.replace(/([A-Z])/g, "-$1").toLowerCase().replace(/^ms-/, "-ms-");
      text = typeof value === "number" && value !== 0 && !UNITLESS.has(name) ? `${value}px` : String(value).trim();
    }
    declarations.push(`${property}:${text}`);
  }
  return declarations.join(";").replaceAll("<", "\\3c ");
}

/** A short name for a text, the same wherever the text is the same: a 53 bit hash in base 36. */
export function hashText(text: string): string {
  let h1 = 0xDEADBEEF;
  let h2 = 0x41C6CE57;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
