export interface Shortcut {
  key: string;
  /** Command on Apple platforms, Control elsewhere. */
  mod: boolean;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
}

/**
 * Parses shortcuts such as `"mod+b"`, `"ctrl+shift+e"` or `"alt+\\"`. `mod` is Command on
 * Apple platforms and Control elsewhere.
 */
export function parseShortcut(value: string): Shortcut {
  const parts = value.toLowerCase().split("+").map(part => part.trim());
  const key = parts.pop();
  if (!key) {
    throw new TypeError(`Invalid shortcut "${value}".`);
  }
  const shortcut: Shortcut = { key, mod: false, ctrl: false, meta: false, alt: false, shift: false };
  for (const modifier of parts) {
    switch (modifier) {
      case "mod":
      case "ctrl":
      case "meta":
      case "alt":
      case "shift": {
        shortcut[modifier] = true;
        break;
      }
      case "cmd":
      case "command": {
        shortcut.meta = true;
        break;
      }
      case "control": {
        shortcut.ctrl = true;
        break;
      }
      case "option": {
        shortcut.alt = true;
        break;
      }
      default: {
        throw new TypeError(`Unknown modifier "${modifier}" in shortcut "${value}".`);
      }
    }
  }
  return shortcut;
}

export function isApplePlatform(navigatorLike: { platform?: string; userAgent: string }): boolean {
  return /mac|iphone|ipad|ipod/i.test(navigatorLike.platform || navigatorLike.userAgent);
}

interface KeyboardEventLike {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/**
 * Whether the event presses exactly this shortcut. Letters also match by physical key, so
 * the shortcut works with keyboard layouts that do not produce Latin letters.
 */
export function matchesShortcut(event: KeyboardEventLike, shortcut: Shortcut, apple: boolean): boolean {
  const wantsCtrl = shortcut.ctrl || (shortcut.mod && !apple);
  const wantsMeta = shortcut.meta || (shortcut.mod && apple);
  if (event.ctrlKey !== wantsCtrl || event.metaKey !== wantsMeta || event.altKey !== shortcut.alt || event.shiftKey !== shortcut.shift) {
    return false;
  }
  if (event.key.toLowerCase() === shortcut.key) {
    return true;
  }
  return /^[a-z]$/.test(shortcut.key) && event.code === `Key${shortcut.key.toUpperCase()}`;
}

function formatVariant(shortcut: Shortcut, apple: boolean): string {
  const modifiers: string[] = [];
  if (shortcut.ctrl || (shortcut.mod && !apple)) {
    modifiers.push("Control");
  }
  if (shortcut.meta || (shortcut.mod && apple)) {
    modifiers.push("Meta");
  }
  if (shortcut.alt) {
    modifiers.push("Alt");
  }
  if (shortcut.shift) {
    modifiers.push("Shift");
  }
  const key = shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key;
  return [...modifiers, key].join("+");
}

/**
 * The shortcut in the format of `aria-keyshortcuts`. `mod` lists both platform variants, so
 * the value is the same on the server and in every browser.
 */
export function formatAriaShortcut(shortcut: Shortcut): string {
  if (!shortcut.mod) {
    return formatVariant(shortcut, false);
  }
  return `${formatVariant(shortcut, false)} ${formatVariant(shortcut, true)}`;
}
