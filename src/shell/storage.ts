import type { PersistedSidebar, ShellState } from "./types";
import { STORAGE_VERSION } from "./constants";

interface StoredShell {
  version: typeof STORAGE_VERSION;
  sidebars: ShellState;
}

function isPersistedSidebar(value: unknown): value is PersistedSidebar {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<PersistedSidebar>;
  return typeof candidate.open === "boolean"
    && (candidate.width === undefined || (typeof candidate.width === "number" && Number.isFinite(candidate.width)));
}

/** Turns sidebar state into the string persisted in storage or a cookie. */
export function serializeShellState(state: ShellState): string {
  const stored: StoredShell = { version: STORAGE_VERSION, sidebars: state };
  return JSON.stringify(stored);
}

/**
 * Reads a string written by `serializeShellState`, for example from a cookie on the server,
 * so the first render already shows the persisted sidebars.
 */
export function parseShellState(serialized: string | null | undefined): ShellState | undefined {
  if (serialized === null || serialized === undefined || serialized === "") {
    return undefined;
  }
  const parsed = JSON.parse(serialized) as Partial<StoredShell> | null;
  const valid = typeof parsed === "object" && parsed !== null
    && parsed.version === STORAGE_VERSION
    && typeof parsed.sidebars === "object" && parsed.sidebars !== null
    && Object.values(parsed.sidebars).every(isPersistedSidebar);
  if (!valid) {
    throw new TypeError("The persisted value is not shell state.");
  }
  return parsed.sidebars as ShellState;
}
