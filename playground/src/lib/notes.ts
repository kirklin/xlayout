import type { LucideIcon } from "lucide-react";
import { ListChecks, SquarePen, Table2 } from "lucide-react";

interface NoteBase {
  title: string;
  /** When the note was last edited, the way Notes shows it in its list. */
  date: string;
}

interface TextNote extends NoteBase {
  kind: "text";
  text: string;
}

interface ChecklistNote extends NoteBase {
  kind: "checklist";
  items: { text: string; done: boolean }[];
}

interface TableNote extends NoteBase {
  kind: "table";
  rows: [string, string][];
}

export type NoteContent = TextNote | ChecklistNote | TableNote;

export type NoteKind = NoteContent["kind"];

export const NOTE_KINDS: { kind: NoteKind; label: string; icon: LucideIcon }[] = [
  { kind: "text", label: "Note", icon: SquarePen },
  { kind: "checklist", label: "Checklist", icon: ListChecks },
  { kind: "table", label: "Table", icon: Table2 },
];

const SAMPLES: Record<NoteKind, NoteContent[]> = {
  text: [
    { kind: "text", title: "Weekend", date: "Yesterday", text: "Flower market in the morning, then lunch by the river and a slow walk home along the water." },
    { kind: "text", title: "Ideas", date: "Monday", text: "A lamp that dims with the sunset. Postcards from every city we visit, pinned up by the door." },
  ],
  checklist: [
    {
      kind: "checklist",
      title: "Groceries",
      date: "9:41 AM",
      items: [
        { text: "Oat milk", done: true },
        { text: "Lemons", done: true },
        { text: "Basil", done: false },
        { text: "Sourdough", done: false },
      ],
    },
    {
      kind: "checklist",
      title: "Packing",
      date: "Today",
      items: [
        { text: "Passport", done: true },
        { text: "Charger", done: false },
        { text: "Sunscreen", done: false },
      ],
    },
  ],
  table: [
    { kind: "table", title: "Budget", date: "Friday", rows: [["Rent", "$1,200"], ["Food", "$420"], ["Travel", "$180"]] },
    { kind: "table", title: "Workouts", date: "Thursday", rows: [["Run", "5 km"], ["Swim", "40 min"], ["Yoga", "30 min"]] },
  ],
};

/** The kind a palette entry carries in a drag. */
export function noteKind(data: string): NoteKind {
  const entry = NOTE_KINDS.find(candidate => candidate.kind === data);
  if (!entry) {
    throw new Error(`There is no kind of note named "${data}".`);
  }
  return entry.kind;
}

/** The next sample of a kind, taking turns with the notes of that kind already there. */
export function sampleNote(kind: NoteKind, existing: readonly NoteContent[]): NoteContent {
  const samples = SAMPLES[kind];
  return samples[existing.filter(note => note.kind === kind).length % samples.length]!;
}
