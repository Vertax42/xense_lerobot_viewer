import { describe, expect, test } from "bun:test";
import {
  EMPTY_TAGS,
  TAG_LIMITS,
  normalizeSingleTag,
  normalizeTags,
  tagsAreEmpty,
} from "@/lib/dataset-tags";

describe("normalizeSingleTag", () => {
  test("lowercases, trims, and replaces whitespace with underscore", () => {
    expect(normalizeSingleTag("  Pick And Place  ")).toBe("pick_and_place");
    expect(normalizeSingleTag("tie\tshoelaces")).toBe("tie_shoelaces");
  });

  test("returns null for empty / non-string input", () => {
    expect(normalizeSingleTag("")).toBeNull();
    expect(normalizeSingleTag("   ")).toBeNull();
    expect(normalizeSingleTag(null)).toBeNull();
    expect(normalizeSingleTag(42)).toBeNull();
    expect(normalizeSingleTag({})).toBeNull();
  });

  test("truncates at MAX_TAG_LENGTH", () => {
    const long = "x".repeat(TAG_LIMITS.MAX_TAG_LENGTH + 10);
    expect(normalizeSingleTag(long)!.length).toBe(TAG_LIMITS.MAX_TAG_LENGTH);
  });
});

describe("normalizeTags", () => {
  test("returns EMPTY_TAGS for non-object input", () => {
    expect(normalizeTags(null)).toEqual({ ...EMPTY_TAGS });
    expect(normalizeTags("hello")).toEqual({ ...EMPTY_TAGS });
    expect(normalizeTags(undefined)).toEqual({ ...EMPTY_TAGS });
  });

  test("parses a typical payload", () => {
    const result = normalizeTags({
      task: "Peeling",
      scene: "Kitchen",
      objects: ["Cucumber", "knife"],
      notes: "  some notes  ",
    });
    expect(result.task).toBe("peeling");
    expect(result.scene).toBe("kitchen");
    expect(result.objects).toEqual(["cucumber", "knife"]);
    expect(result.notes).toBe("some notes");
  });

  test("deduplicates objects (case-insensitive)", () => {
    const result = normalizeTags({
      task: null,
      scene: null,
      objects: ["cube", "Cube", "CUBE", "block"],
    });
    expect(result.objects).toEqual(["cube", "block"]);
  });

  test("caps objects at MAX_OBJECTS", () => {
    const many = Array.from(
      { length: TAG_LIMITS.MAX_OBJECTS + 5 },
      (_, i) => `item${i}`,
    );
    const result = normalizeTags({ objects: many });
    expect(result.objects.length).toBe(TAG_LIMITS.MAX_OBJECTS);
  });

  test("drops invalid object entries", () => {
    const result = normalizeTags({
      objects: ["cube", "", null, 42, "knife"],
    });
    expect(result.objects).toEqual(["cube", "knife"]);
  });

  test("truncates notes at MAX_NOTES_LENGTH", () => {
    const longNotes = "n".repeat(TAG_LIMITS.MAX_NOTES_LENGTH + 50);
    const result = normalizeTags({ notes: longNotes });
    expect(result.notes!.length).toBe(TAG_LIMITS.MAX_NOTES_LENGTH);
  });

  test("preserves updated_at if present", () => {
    const result = normalizeTags({
      task: "peeling",
      updated_at: "2026-05-11T10:30:00Z",
    });
    expect(result.updated_at).toBe("2026-05-11T10:30:00Z");
  });

  test("omits notes when empty string", () => {
    const result = normalizeTags({ task: "x", notes: "   " });
    expect(result.notes).toBeUndefined();
  });
});

describe("tagsAreEmpty", () => {
  test("true for fresh EMPTY_TAGS", () => {
    expect(tagsAreEmpty({ ...EMPTY_TAGS })).toBe(true);
  });

  test("false if task set", () => {
    expect(tagsAreEmpty({ ...EMPTY_TAGS, task: "peeling" })).toBe(false);
  });

  test("false if objects non-empty", () => {
    expect(tagsAreEmpty({ ...EMPTY_TAGS, objects: ["cube"] })).toBe(false);
  });

  test("false if notes set", () => {
    expect(tagsAreEmpty({ ...EMPTY_TAGS, notes: "hi" })).toBe(false);
  });
});
