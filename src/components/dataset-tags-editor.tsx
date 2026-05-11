"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  type DatasetTags,
  SUGGESTED_OBJECTS,
  SUGGESTED_SCENES,
  SUGGESTED_TASKS,
  TAG_LIMITS,
  normalizeSingleTag,
} from "@/lib/dataset-tags";

type Props = {
  datasetRelativePath: string;
  encodedPath: string;
  initialTags: DatasetTags;
  onClose: () => void;
  onSaved: (updated: DatasetTags) => void;
};

const CUSTOM_VALUE = "__custom__";
const NONE_VALUE = "__none__";

function buildOptions(
  suggested: readonly string[],
  current: string | null,
): string[] {
  const set = new Set(suggested);
  if (current && !set.has(current)) set.add(current);
  return Array.from(set).sort();
}

export default function DatasetTagsEditor({
  datasetRelativePath,
  encodedPath,
  initialTags,
  onClose,
  onSaved,
}: Props) {
  const [taskMode, setTaskMode] = useState<"preset" | "custom">(
    initialTags.task && !SUGGESTED_TASKS.includes(initialTags.task)
      ? "custom"
      : "preset",
  );
  const [task, setTask] = useState<string>(initialTags.task ?? "");
  const [sceneMode, setSceneMode] = useState<"preset" | "custom">(
    initialTags.scene && !SUGGESTED_SCENES.includes(initialTags.scene)
      ? "custom"
      : "preset",
  );
  const [scene, setScene] = useState<string>(initialTags.scene ?? "");
  const [objects, setObjects] = useState<string[]>(initialTags.objects);
  const [objectDraft, setObjectDraft] = useState("");
  const [notes, setNotes] = useState<string>(initialTags.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const taskOptions = useMemo(
    () => buildOptions(SUGGESTED_TASKS, initialTags.task),
    [initialTags.task],
  );
  const sceneOptions = useMemo(
    () => buildOptions(SUGGESTED_SCENES, initialTags.scene),
    [initialTags.scene],
  );

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const objectsRef = useRef<HTMLInputElement>(null);

  const addObject = () => {
    const v = normalizeSingleTag(objectDraft);
    if (!v) return;
    if (objects.includes(v)) {
      setObjectDraft("");
      return;
    }
    if (objects.length >= TAG_LIMITS.MAX_OBJECTS) {
      setError(`At most ${TAG_LIMITS.MAX_OBJECTS} objects per dataset.`);
      return;
    }
    setObjects((prev) => [...prev, v]);
    setObjectDraft("");
    setError(null);
  };

  const removeObject = (v: string) => {
    setObjects((prev) => prev.filter((o) => o !== v));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const payload: DatasetTags = {
      task: task.trim() ? task.trim() : null,
      scene: scene.trim() ? scene.trim() : null,
      objects,
      notes: notes.trim() || undefined,
    };
    try {
      const res = await fetch(`/api/local-datasets/${encodedPath}/tags`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      const saved = (await res.json()) as DatasetTags;
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="panel-raised w-full max-w-lg overflow-hidden rounded-lg border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-white/10 bg-[var(--surface-1)]/60 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-100">Edit tags</h2>
          <p
            className="mt-0.5 truncate font-mono text-xs text-slate-400"
            title={datasetRelativePath}
          >
            {datasetRelativePath}
          </p>
        </header>

        <div className="space-y-4 px-5 py-4">
          {/* Task */}
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Task
            </label>
            <div className="flex gap-2">
              {taskMode === "preset" ? (
                <select
                  value={task || ""}
                  onChange={(e) => {
                    if (e.target.value === CUSTOM_VALUE) {
                      setTaskMode("custom");
                      setTask("");
                    } else if (e.target.value === NONE_VALUE) {
                      setTask("");
                    } else {
                      setTask(e.target.value);
                    }
                  }}
                  className="flex-1 rounded border border-white/10 bg-[var(--surface-1)]/60 px-3 py-1.5 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none"
                >
                  <option value={NONE_VALUE}>(none)</option>
                  {taskOptions.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                  <option value={CUSTOM_VALUE}>+ Custom value…</option>
                </select>
              ) : (
                <>
                  <input
                    type="text"
                    value={task}
                    onChange={(e) => setTask(e.target.value)}
                    placeholder="custom task name"
                    autoFocus
                    className="flex-1 rounded border border-white/10 bg-[var(--surface-1)]/60 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setTaskMode("preset");
                      setTask("");
                    }}
                    className="rounded border border-white/10 px-2 py-1 text-xs text-slate-300 hover:text-slate-100"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Scene */}
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Scene
            </label>
            <div className="flex gap-2">
              {sceneMode === "preset" ? (
                <select
                  value={scene || ""}
                  onChange={(e) => {
                    if (e.target.value === CUSTOM_VALUE) {
                      setSceneMode("custom");
                      setScene("");
                    } else if (e.target.value === NONE_VALUE) {
                      setScene("");
                    } else {
                      setScene(e.target.value);
                    }
                  }}
                  className="flex-1 rounded border border-white/10 bg-[var(--surface-1)]/60 px-3 py-1.5 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none"
                >
                  <option value={NONE_VALUE}>(none)</option>
                  {sceneOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                  <option value={CUSTOM_VALUE}>+ Custom value…</option>
                </select>
              ) : (
                <>
                  <input
                    type="text"
                    value={scene}
                    onChange={(e) => setScene(e.target.value)}
                    placeholder="custom scene name"
                    autoFocus
                    className="flex-1 rounded border border-white/10 bg-[var(--surface-1)]/60 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setSceneMode("preset");
                      setScene("");
                    }}
                    className="rounded border border-white/10 px-2 py-1 text-xs text-slate-300 hover:text-slate-100"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Objects */}
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Objects ({objects.length}/{TAG_LIMITS.MAX_OBJECTS})
            </label>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {objects.map((o) => (
                <span
                  key={o}
                  className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-xs text-slate-200"
                >
                  {o}
                  <button
                    type="button"
                    onClick={() => removeObject(o)}
                    className="text-slate-400 hover:text-red-300"
                    aria-label={`Remove ${o}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              {objects.length === 0 && (
                <span className="text-xs italic text-slate-500">
                  No objects yet
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                ref={objectsRef}
                type="text"
                value={objectDraft}
                onChange={(e) => setObjectDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addObject();
                  }
                }}
                list="object-suggestions"
                placeholder="type and press Enter (e.g. cucumber)"
                className="flex-1 rounded border border-white/10 bg-[var(--surface-1)]/60 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
              />
              <datalist id="object-suggestions">
                {SUGGESTED_OBJECTS.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
              <button
                type="button"
                onClick={addObject}
                disabled={!objectDraft.trim()}
                className="rounded border border-white/10 bg-cyan-500/20 px-3 py-1 text-xs font-medium text-cyan-200 hover:bg-cyan-500/30 disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Notes ({notes.length}/{TAG_LIMITS.MAX_NOTES_LENGTH})
            </label>
            <textarea
              value={notes}
              onChange={(e) =>
                setNotes(e.target.value.slice(0, TAG_LIMITS.MAX_NOTES_LENGTH))
              }
              rows={2}
              placeholder="optional free-form notes"
              className="w-full rounded border border-white/10 bg-[var(--surface-1)]/60 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
            />
          </div>

          {error && (
            <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {error}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-white/10 bg-[var(--surface-1)]/60 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:text-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded bg-cyan-500/90 px-4 py-1.5 text-xs font-medium text-white hover:bg-cyan-400 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </footer>
      </div>
    </div>
  );
}
