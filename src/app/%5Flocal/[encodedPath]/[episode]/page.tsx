import EpisodeViewer from "@/app/[org]/[dataset]/[episode]/episode-viewer";
import { Suspense } from "react";
import fs from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import {
  decodeLocalDatasetPath,
  resolveServerLocalDatasetPath,
} from "@/utils/datasetRoute";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ encodedPath: string; episode: string }>;
}) {
  const { encodedPath, episode } = await params;
  const datasetPath = resolveServerLocalDatasetPath(
    decodeLocalDatasetPath(encodedPath),
  );
  return {
    title: `${datasetPath} | episode ${episode}`,
  };
}

type IntegrityIssue = {
  status: "empty" | "incomplete";
  reason: string;
  details: string[];
  totalEpisodes: number;
};

async function probeDatasetHealth(
  datasetDir: string,
): Promise<IntegrityIssue | null> {
  let info: { total_episodes?: number } = {};
  try {
    const raw = await fs.readFile(
      path.join(datasetDir, "meta", "info.json"),
      "utf-8",
    );
    info = JSON.parse(raw);
  } catch {
    return {
      status: "incomplete",
      reason: "meta/info.json is missing or unreadable",
      details: [`Expected: ${path.join(datasetDir, "meta", "info.json")}`],
      totalEpisodes: 0,
    };
  }

  const totalEpisodes = info.total_episodes ?? 0;
  const checkDir = async (rel: string): Promise<boolean> => {
    try {
      const entries = await fs.readdir(path.join(datasetDir, rel));
      return entries.length > 0;
    } catch {
      return false;
    }
  };

  const [hasData, hasVideos] = await Promise.all([
    checkDir("data"),
    checkDir("videos"),
  ]);

  if (totalEpisodes <= 0) {
    return {
      status: "empty",
      reason: "This dataset has no episodes",
      details: ["info.json reports total_episodes = 0"],
      totalEpisodes,
    };
  }

  if (!hasData || !hasVideos) {
    const missing: string[] = [];
    if (!hasData) missing.push("data/");
    if (!hasVideos) missing.push("videos/");
    return {
      status: "incomplete",
      reason: "Dataset payload is missing from disk",
      details: [
        `info.json claims ${totalEpisodes} episodes, but the following directories are empty or missing:`,
        ...missing.map((m) => `  • ${path.join(datasetDir, m)}`),
      ],
      totalEpisodes,
    };
  }

  return null;
}

function IntegrityErrorPage({
  datasetPath,
  issue,
}: {
  datasetPath: string;
  issue: IntegrityIssue;
}) {
  const isError = issue.status === "incomplete";
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] px-4 py-16">
      <div
        className={`panel-raised w-full max-w-2xl p-8 ${
          isError ? "border-red-500/50" : "border-amber-500/50"
        }`}
      >
        <div
          className={`mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
            isError
              ? "bg-red-500/20 text-red-200"
              : "bg-amber-500/20 text-amber-200"
          }`}
        >
          {isError ? "⚠ Incomplete dataset" : "⚠ Empty dataset"}
        </div>
        <h1 className="mb-2 text-xl font-semibold text-slate-100">
          Cannot open this dataset
        </h1>
        <p
          className="mb-4 font-mono text-sm text-slate-400"
          title={datasetPath}
        >
          {datasetPath}
        </p>
        <p
          className={`mb-3 text-base ${
            isError ? "text-red-200" : "text-amber-200"
          }`}
        >
          {issue.reason}
        </p>
        <ul className="mb-6 space-y-1 text-sm text-slate-300">
          {issue.details.map((line, i) => (
            <li
              key={i}
              className="whitespace-pre-wrap break-all font-mono text-slate-400"
            >
              {line}
            </li>
          ))}
        </ul>
        <div className="rounded-md border border-white/10 bg-[var(--surface-1)]/50 p-4 text-sm text-slate-300">
          <p className="mb-2 font-medium text-slate-200">How to fix</p>
          <p className="text-xs text-slate-400">
            Re-download the dataset payload with{" "}
            <code className="rounded bg-black/40 px-1 py-0.5 text-cyan-200">
              huggingface-cli download
            </code>{" "}
            so that{" "}
            <code className="rounded bg-black/40 px-1 py-0.5 text-cyan-200">
              data/
            </code>{" "}
            and{" "}
            <code className="rounded bg-black/40 px-1 py-0.5 text-cyan-200">
              videos/
            </code>{" "}
            are populated, or remove the empty entry from your local cache.
          </p>
        </div>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 rounded-md bg-cyan-500/90 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-400"
        >
          ← Back to dataset browser
        </Link>
      </div>
    </div>
  );
}

export default async function LocalEpisodePage({
  params,
}: {
  params: Promise<{ encodedPath: string; episode: string }>;
}) {
  const { encodedPath, episode } = await params;
  const episodeNumber = Number(episode.replace(/^episode_/, ""));

  const datasetPath = resolveServerLocalDatasetPath(
    decodeLocalDatasetPath(encodedPath),
  );
  const issue = await probeDatasetHealth(datasetPath);
  if (issue) {
    return <IntegrityErrorPage datasetPath={datasetPath} issue={issue} />;
  }

  return (
    <Suspense fallback={null}>
      <EpisodeViewer
        org="_local"
        dataset={encodedPath}
        episodeId={episodeNumber}
      />
    </Suspense>
  );
}
