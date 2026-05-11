"use client";

import React, { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  DatasetIntegrity,
  LocalDatasetSummary,
} from "@/lib/local-datasets-discovery";
import type { DatasetTags } from "@/lib/dataset-tags";
import DatasetTagsEditor from "@/components/dataset-tags-editor";

type LocalDatasetGridProps = {
  root: string;
  datasets: LocalDatasetSummary[];
  errors: { path: string; message: string }[];
};

type HealthFilter = "all" | "ok" | "issues";
type TaskFilter = "all" | "untagged" | string;

function buildEpisodeRoute(encodedPath: string, episode: number = 0): string {
  return `/_local/${encodedPath}/episode_${Math.max(0, Math.floor(episode))}`;
}

function formatTotalFrames(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

function describeIntegrity(integrity: DatasetIntegrity): {
  label: string;
  reason: string;
  tone: "ok" | "warn" | "error";
} {
  if (integrity.status === "ok") {
    return {
      label: "Healthy",
      reason: "data/ and videos/ present",
      tone: "ok",
    };
  }
  if (integrity.status === "empty") {
    return {
      label: "Empty",
      reason: "info.json reports 0 episodes",
      tone: "warn",
    };
  }
  const missing: string[] = [];
  if (!integrity.hasData) missing.push("data/");
  if (!integrity.hasVideos) missing.push("videos/");
  return {
    label: "Incomplete",
    reason: `Missing on disk: ${missing.join(", ") || "data files"}`,
    tone: "error",
  };
}

export default function LocalDatasetGrid({
  root,
  datasets,
  errors,
}: LocalDatasetGridProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedRobot, setSelectedRobot] = useState<string>("all");
  const [healthFilter, setHealthFilter] = useState<HealthFilter>("all");
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");
  const [episodeOverrides, setEpisodeOverrides] = useState<
    Record<string, string>
  >({});
  // Locally-mirrored tags so a Save in the editor instantly updates the grid
  // before router.refresh() re-fetches the server discovery.
  const [tagOverrides, setTagOverrides] = useState<Record<string, DatasetTags>>(
    {},
  );
  const [editingDatasetKey, setEditingDatasetKey] = useState<string | null>(
    null,
  );
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  // Apply overrides (from in-page edits) on top of server-loaded tags.
  const datasetsWithLiveTags = useMemo(
    () =>
      datasets.map((ds) =>
        tagOverrides[ds.encodedPath]
          ? { ...ds, tags: tagOverrides[ds.encodedPath] }
          : ds,
      ),
    [datasets, tagOverrides],
  );

  const robotTypes = useMemo(() => {
    const set = new Set<string>();
    for (const ds of datasetsWithLiveTags) {
      if (ds.robot_type) set.add(ds.robot_type);
    }
    return Array.from(set).sort();
  }, [datasetsWithLiveTags]);

  const healthCounts = useMemo(() => {
    let ok = 0;
    let empty = 0;
    let incomplete = 0;
    for (const ds of datasetsWithLiveTags) {
      if (ds.integrity.status === "ok") ok += 1;
      else if (ds.integrity.status === "empty") empty += 1;
      else incomplete += 1;
    }
    return { ok, empty, incomplete, issues: empty + incomplete };
  }, [datasetsWithLiveTags]);

  // Count datasets per task tag (plus untagged).
  const taskCounts = useMemo(() => {
    const counts = new Map<string, number>();
    let untagged = 0;
    for (const ds of datasetsWithLiveTags) {
      if (ds.tags.task) {
        counts.set(ds.tags.task, (counts.get(ds.tags.task) ?? 0) + 1);
      } else {
        untagged += 1;
      }
    }
    return { perTask: counts, untagged };
  }, [datasetsWithLiveTags]);

  const sortedTaskKeys = useMemo(
    () => Array.from(taskCounts.perTask.keys()).sort(),
    [taskCounts],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return datasetsWithLiveTags.filter((ds) => {
      if (selectedRobot !== "all" && ds.robot_type !== selectedRobot) {
        return false;
      }
      if (healthFilter === "ok" && ds.integrity.status !== "ok") return false;
      if (healthFilter === "issues" && ds.integrity.status === "ok")
        return false;
      if (taskFilter === "untagged" && ds.tags.task) return false;
      if (
        taskFilter !== "all" &&
        taskFilter !== "untagged" &&
        ds.tags.task !== taskFilter
      )
        return false;
      if (!q) return true;
      return (
        ds.relativePath.toLowerCase().includes(q) ||
        (ds.robot_type ?? "").toLowerCase().includes(q) ||
        (ds.tags.task ?? "").toLowerCase().includes(q) ||
        (ds.tags.scene ?? "").toLowerCase().includes(q) ||
        ds.tags.objects.some((o) => o.toLowerCase().includes(q))
      );
    });
  }, [datasetsWithLiveTags, query, selectedRobot, healthFilter, taskFilter]);

  const editingDataset = editingDatasetKey
    ? (datasetsWithLiveTags.find((d) => d.encodedPath === editingDatasetKey) ??
      null)
    : null;

  return (
    <main className="px-8 py-10 max-w-7xl mx-auto">
      <header className="mb-8">
        <div className="text-4xl font-bold tracking-tight">
          <span className="bg-gradient-to-r from-cyan-300 via-sky-300 to-cyan-400 bg-clip-text text-transparent">
            Xense
          </span>
          <span className="text-emerald-400">Robotics</span>
        </div>
        <h1 className="mt-3 text-xl font-medium tracking-tight text-slate-300">
          LeRobot Local Dataset Visualizer
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Browsing <span className="font-mono text-cyan-200/90">{root}</span>
          <span className="mx-2 text-slate-600">·</span>
          {datasets.length} dataset{datasets.length === 1 ? "" : "s"} found
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {healthCounts.ok} healthy
          </span>
          {healthCounts.incomplete > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-red-200">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
              {healthCounts.incomplete} incomplete (missing data/videos)
            </span>
          )}
          {healthCounts.empty > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-amber-200">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              {healthCounts.empty} empty (0 episodes)
            </span>
          )}
        </div>
      </header>

      {sortedTaskKeys.length === 0 && datasetsWithLiveTags.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-cyan-400/20 bg-cyan-500/5 px-3 py-2 text-xs text-cyan-100/80">
          <svg
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden
          >
            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793 4 13.172V16h2.828l7.379-7.379-2.828-2.828z" />
          </svg>
          <div>
            Tag your datasets to organise by{" "}
            <span className="font-medium text-violet-200">task</span>,{" "}
            <span className="font-medium text-sky-200">scene</span>, and{" "}
            <span className="font-medium text-slate-200">objects</span>. Click
            the{" "}
            <span className="rounded bg-black/40 px-1 font-medium text-slate-100">
              ✎ Tags
            </span>{" "}
            button on any card to start.
          </div>
        </div>
      )}

      {(sortedTaskKeys.length > 0 || taskCounts.untagged > 0) && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">
            Task
          </span>
          <button
            type="button"
            onClick={() => setTaskFilter("all")}
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
              taskFilter === "all"
                ? "border-cyan-400/60 bg-cyan-500/20 text-cyan-100"
                : "border-white/10 bg-[var(--surface-1)]/60 text-slate-300 hover:text-slate-100"
            }`}
          >
            All ({datasetsWithLiveTags.length})
          </button>
          {sortedTaskKeys.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTaskFilter((prev) => (prev === t ? "all" : t))}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                taskFilter === t
                  ? "border-violet-400/60 bg-violet-500/30 text-violet-100"
                  : "border-violet-400/20 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20"
              }`}
            >
              {t} ({taskCounts.perTask.get(t) ?? 0})
            </button>
          ))}
          {taskCounts.untagged > 0 && (
            <button
              type="button"
              onClick={() =>
                setTaskFilter((prev) =>
                  prev === "untagged" ? "all" : "untagged",
                )
              }
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                taskFilter === "untagged"
                  ? "border-slate-400/60 bg-slate-500/30 text-slate-100"
                  : "border-white/10 bg-[var(--surface-1)]/60 text-slate-400 hover:text-slate-200"
              }`}
            >
              Untagged ({taskCounts.untagged})
            </button>
          )}
        </div>
      )}

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
            />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter datasets by name or robot type"
            className="w-full rounded-md border border-white/10 bg-[var(--surface-1)]/60 px-10 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
          />
        </div>
        {robotTypes.length > 0 && (
          <select
            value={selectedRobot}
            onChange={(e) => setSelectedRobot(e.target.value)}
            className="rounded-md border border-white/10 bg-[var(--surface-1)]/60 px-3 py-2 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none"
          >
            <option value="all">All robots ({datasets.length})</option>
            {robotTypes.map((robot) => {
              const count = datasets.filter(
                (d) => d.robot_type === robot,
              ).length;
              return (
                <option key={robot} value={robot}>
                  {robot} ({count})
                </option>
              );
            })}
          </select>
        )}
        <div className="inline-flex overflow-hidden rounded-md border border-white/10 text-xs">
          {(
            [
              { key: "all", label: `All (${datasets.length})` },
              { key: "ok", label: `Healthy (${healthCounts.ok})` },
              { key: "issues", label: `Issues (${healthCounts.issues})` },
            ] as { key: HealthFilter; label: string }[]
          ).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setHealthFilter(opt.key)}
              className={`px-3 py-2 transition-colors ${
                healthFilter === opt.key
                  ? "bg-cyan-500/20 text-cyan-100"
                  : "bg-[var(--surface-1)]/60 text-slate-300 hover:text-slate-100"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {errors.length > 0 && (
        <div className="mb-6 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          <p className="font-semibold mb-1">
            {errors.length} path{errors.length === 1 ? "" : "s"} could not be
            scanned:
          </p>
          <ul className="space-y-0.5 font-mono text-amber-100/80">
            {errors.slice(0, 5).map((err, i) => (
              <li key={i} className="truncate">
                {err.path}: {err.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-md border border-white/10 bg-[var(--surface-1)]/40 p-10 text-center text-slate-400">
          {datasets.length === 0 ? (
            <>
              No LeRobot datasets found under{" "}
              <span className="font-mono text-slate-200">{root}</span>.
              <br />
              <span className="text-xs text-slate-500">
                Make sure each dataset directory contains{" "}
                <code>meta/info.json</code>.
              </span>
            </>
          ) : (
            <>No datasets match the current filter.</>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {filtered.map((ds, idx) => {
            const health = describeIntegrity(ds.integrity);
            const borderTone =
              health.tone === "error"
                ? "border-red-500/60 hover:border-red-400"
                : health.tone === "warn"
                  ? "border-amber-500/50 hover:border-amber-400"
                  : "hover:border-cyan-400/40";
            const badgeTone =
              health.tone === "error"
                ? "bg-red-500/90 text-white"
                : health.tone === "warn"
                  ? "bg-amber-500/90 text-slate-900"
                  : "bg-emerald-500/80 text-slate-900";
            return (
              <Link
                key={ds.encodedPath}
                href={buildEpisodeRoute(ds.encodedPath)}
                title={
                  health.tone === "ok"
                    ? ds.relativePath
                    : `${ds.relativePath}\n${health.label}: ${health.reason}`
                }
                className={`group panel relative flex h-48 items-end overflow-hidden rounded-md border-2 transition-colors ${borderTone}`}
                onMouseEnter={() => {
                  const vid = videoRefs.current[idx];
                  if (vid) {
                    void vid.play().catch(() => undefined);
                  }
                }}
                onMouseLeave={() => {
                  const vid = videoRefs.current[idx];
                  if (vid) {
                    vid.pause();
                    vid.currentTime = 0;
                  }
                }}
              >
                {ds.thumbnailVideoUrl ? (
                  <video
                    ref={(el) => {
                      videoRefs.current[idx] = el;
                    }}
                    src={ds.thumbnailVideoUrl}
                    className={`absolute left-0 top-0 z-0 h-full w-full object-cover object-center ${
                      health.tone === "ok" ? "" : "opacity-40 grayscale"
                    }`}
                    loop
                    muted
                    playsInline
                    preload="metadata"
                    onTimeUpdate={(e) => {
                      const vid = e.currentTarget;
                      if (vid.currentTime >= 15) {
                        vid.pause();
                        vid.currentTime = 0;
                      }
                    }}
                  />
                ) : (
                  <div className="absolute inset-0 z-0 bg-gradient-to-br from-slate-800 to-slate-900" />
                )}
                <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

                {/* Edit-tags button — top-left, only shows on card hover */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setEditingDatasetKey(ds.encodedPath);
                  }}
                  title="Edit tags (task, scene, objects)"
                  aria-label={`Edit tags for ${ds.relativePath}`}
                  className="absolute left-2 top-2 z-20 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-slate-200 opacity-0 backdrop-blur-sm transition-opacity transition-colors hover:bg-cyan-500/90 hover:text-white group-hover:opacity-100"
                >
                  <svg
                    className="h-3 w-3"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden
                  >
                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793 4 13.172V16h2.828l7.379-7.379-2.828-2.828z" />
                  </svg>
                  Tags
                </button>

                {/* Health corner badge — top-right */}
                <div
                  className={`absolute right-2 top-2 z-20 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide shadow ${badgeTone}`}
                >
                  {health.tone === "ok" ? (
                    <svg
                      className="h-3 w-3"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.704 5.29a1 1 0 010 1.415l-7.07 7.07a1 1 0 01-1.414 0L3.292 8.85a1 1 0 011.415-1.414l3.218 3.218 6.364-6.364a1 1 0 011.415 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="h-3 w-3"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden
                    >
                      <path
                        fillRule="evenodd"
                        d="M8.485 2.495a1.75 1.75 0 013.03 0l6.28 10.873A1.75 1.75 0 0116.28 16H3.72a1.75 1.75 0 01-1.515-2.632L8.485 2.495zM10 6a.75.75 0 01.75.75v4a.75.75 0 01-1.5 0v-4A.75.75 0 0110 6zm0 8a1 1 0 100-2 1 1 0 000 2z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                  {health.label}
                </div>

                <div className="relative z-20 w-full px-3 py-2.5 text-slate-100">
                  <div
                    className="truncate text-sm font-medium"
                    title={ds.relativePath}
                  >
                    {ds.relativePath}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-300">
                    {ds.robot_type && (
                      <span className="rounded bg-cyan-500/20 px-1.5 py-0.5 text-cyan-200">
                        {ds.robot_type}
                      </span>
                    )}
                    <span className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">
                      {ds.codebase_version}
                    </span>
                    <span className="tabular">{ds.total_episodes} ep</span>
                    {ds.total_frames > 0 && (
                      <span className="tabular text-slate-400">
                        · {formatTotalFrames(ds.total_frames)} frames
                      </span>
                    )}
                  </div>
                  {(ds.tags.task ||
                    ds.tags.scene ||
                    ds.tags.objects.length > 0) && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px]">
                      {ds.tags.task && (
                        <span
                          className="rounded bg-violet-500/25 px-1.5 py-0.5 font-medium text-violet-100"
                          title="task"
                        >
                          {ds.tags.task}
                        </span>
                      )}
                      {ds.tags.scene && (
                        <span
                          className="rounded bg-sky-500/20 px-1.5 py-0.5 text-sky-200"
                          title="scene"
                        >
                          @{ds.tags.scene}
                        </span>
                      )}
                      {ds.tags.objects.slice(0, 4).map((o) => (
                        <span
                          key={o}
                          className="rounded bg-white/10 px-1.5 py-0.5 text-slate-300"
                          title="object"
                        >
                          {o}
                        </span>
                      ))}
                      {ds.tags.objects.length > 4 && (
                        <span className="text-slate-500">
                          +{ds.tags.objects.length - 4}
                        </span>
                      )}
                    </div>
                  )}
                  {health.tone !== "ok" ? (
                    <div
                      className={`mt-1.5 text-[11px] ${
                        health.tone === "error"
                          ? "text-red-300"
                          : "text-amber-300"
                      }`}
                    >
                      ⚠ {health.reason}
                    </div>
                  ) : ds.total_episodes > 1 ? (
                    <div
                      className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-400"
                      onClick={(e) => e.preventDefault()}
                    >
                      <span>Open</span>
                      <input
                        type="number"
                        min={0}
                        max={ds.total_episodes - 1}
                        placeholder="0"
                        value={episodeOverrides[ds.encodedPath] ?? ""}
                        onChange={(e) => {
                          e.stopPropagation();
                          setEpisodeOverrides((prev) => ({
                            ...prev,
                            [ds.encodedPath]: e.target.value,
                          }));
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            e.stopPropagation();
                            const ep = Math.min(
                              Math.max(0, Number(e.currentTarget.value) || 0),
                              ds.total_episodes - 1,
                            );
                            router.push(buildEpisodeRoute(ds.encodedPath, ep));
                          }
                        }}
                        className="w-14 rounded border border-white/15 bg-black/50 px-1.5 py-0.5 text-center text-[11px] tabular text-slate-100 focus:border-cyan-400 focus:outline-none"
                      />
                      <span className="text-slate-500">
                        / {ds.total_episodes - 1}
                      </span>
                    </div>
                  ) : null}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {editingDataset && (
        <DatasetTagsEditor
          datasetRelativePath={editingDataset.relativePath}
          encodedPath={editingDataset.encodedPath}
          initialTags={editingDataset.tags}
          onClose={() => setEditingDatasetKey(null)}
          onSaved={(updated) => {
            setTagOverrides((prev) => ({
              ...prev,
              [editingDataset.encodedPath]: updated,
            }));
            setEditingDatasetKey(null);
            router.refresh();
          }}
        />
      )}
    </main>
  );
}
