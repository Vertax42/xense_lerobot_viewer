// User-curated tags layered on top of LeRobot datasets. Lives at
// `<dataset>/meta/xense_tags.json` — the `xense_` prefix keeps it from ever
// colliding with upstream LeRobot fields, and the per-dataset location means
// the tags travel with the data when it is rsynced / mounted elsewhere.

export type DatasetTags = {
  task: string | null;
  scene: string | null;
  objects: string[];
  notes?: string;
  updated_at?: string;
};

export const EMPTY_TAGS: DatasetTags = {
  task: null,
  scene: null,
  objects: [],
};

// Suggested vocabularies — surfaced in dropdowns/datalists. Users can still
// type custom values; these are pure UX defaults, not a closed enum.
export const SUGGESTED_TASKS: readonly string[] = [
  "pick_and_place",
  "peeling",
  "assembly",
  "tie_shoelaces",
  "folding",
  "insertion",
  "pouring",
  "wiping",
  "stacking",
  "sorting",
];

export const SUGGESTED_SCENES: readonly string[] = [
  "tabletop",
  "kitchen",
  "industrial_bench",
  "lab_bench",
  "outdoor",
  "drawer",
];

export const SUGGESTED_OBJECTS: readonly string[] = [
  "cube",
  "cucumber",
  "knife",
  "box",
  "phone_stand",
  "towel",
  "shoe",
  "shoelace",
  "bottle",
  "cup",
  "plate",
  "spoon",
  "block",
];

// Constraints — kept generous but bounded so a stray paste doesn't write a
// 10 MB file. Validation runs both client-side (form) and server-side (route).
export const TAG_LIMITS = {
  MAX_TAG_LENGTH: 50,
  MAX_OBJECTS: 20,
  MAX_NOTES_LENGTH: 500,
} as const;

/**
 * Normalize a single tag value: trim, lowercase, replace whitespace with `_`.
 * Returns null for empty input — callers treat null as "unset".
 */
export function normalizeSingleTag(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase().replace(/\s+/g, "_");
  if (!trimmed) return null;
  if (trimmed.length > TAG_LIMITS.MAX_TAG_LENGTH) {
    return trimmed.slice(0, TAG_LIMITS.MAX_TAG_LENGTH);
  }
  return trimmed;
}

/**
 * Parse + validate untrusted input (from API body or JSON file on disk) into
 * a clean DatasetTags. Drops fields that fail validation; never throws so a
 * single bad field can't make the whole dataset un-listable.
 */
export function normalizeTags(input: unknown): DatasetTags {
  if (!input || typeof input !== "object") return { ...EMPTY_TAGS };
  const raw = input as Record<string, unknown>;

  const objects = Array.isArray(raw.objects)
    ? raw.objects
        .map((o) => normalizeSingleTag(o))
        .filter((o): o is string => !!o)
        .slice(0, TAG_LIMITS.MAX_OBJECTS)
    : [];
  // Deduplicate while preserving order.
  const seen = new Set<string>();
  const dedupObjects: string[] = [];
  for (const o of objects) {
    if (!seen.has(o)) {
      seen.add(o);
      dedupObjects.push(o);
    }
  }

  const notesRaw = typeof raw.notes === "string" ? raw.notes.trim() : "";
  const notes = notesRaw
    ? notesRaw.slice(0, TAG_LIMITS.MAX_NOTES_LENGTH)
    : undefined;

  const result: DatasetTags = {
    task: normalizeSingleTag(raw.task),
    scene: normalizeSingleTag(raw.scene),
    objects: dedupObjects,
  };
  if (notes) result.notes = notes;
  if (typeof raw.updated_at === "string") result.updated_at = raw.updated_at;
  return result;
}

export function tagsAreEmpty(tags: DatasetTags): boolean {
  return !tags.task && !tags.scene && tags.objects.length === 0 && !tags.notes;
}
