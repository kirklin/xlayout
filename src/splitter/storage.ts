import type { LayoutStorage, StoredLayout } from "./types";

const STORAGE_VERSION = 1;

interface StoredLayouts {
  version: typeof STORAGE_VERSION;
  /** Keyed by the panel ids of a group, so conditional panels restore their own layout. */
  layouts: Record<string, StoredLayout>;
}

function getPanelSetKey(panelIds: readonly string[]): string {
  return JSON.stringify(panelIds);
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && Object.values(value).every(size => typeof size === "number" && Number.isFinite(size));
}

function isStoredLayout(value: unknown): value is StoredLayout {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<StoredLayout>;
  return isNumberRecord(candidate.layout)
    && typeof candidate.panelSpace === "number" && Number.isFinite(candidate.panelSpace)
    && isNumberRecord(candidate.expandSizes);
}

function readStoredLayouts(storage: LayoutStorage, storageKey: string): StoredLayouts {
  const raw = storage.getItem(storageKey);
  if (raw === null) {
    return { version: STORAGE_VERSION, layouts: {} };
  }
  const parsed = JSON.parse(raw) as Partial<StoredLayouts> | null;
  const valid = typeof parsed === "object" && parsed !== null
    && parsed.version === STORAGE_VERSION
    && typeof parsed.layouts === "object" && parsed.layouts !== null
    && Object.values(parsed.layouts).every(isStoredLayout);
  if (!valid) {
    throw new TypeError(`The value stored under "${storageKey}" is not a splitter layout.`);
  }
  return parsed as StoredLayouts;
}

export function readStoredLayout(storage: LayoutStorage, storageKey: string, panelIds: readonly string[]): StoredLayout | undefined {
  return readStoredLayouts(storage, storageKey).layouts[getPanelSetKey(panelIds)];
}

export function writeStoredLayout(storage: LayoutStorage, storageKey: string, panelIds: readonly string[], stored: StoredLayout): void {
  const value = readStoredLayouts(storage, storageKey);
  value.layouts[getPanelSetKey(panelIds)] = stored;
  storage.setItem(storageKey, JSON.stringify(value));
}
