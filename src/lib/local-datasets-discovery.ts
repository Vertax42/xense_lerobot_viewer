import fs from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_LOCAL_DATASET_ROOT_SUFFIX,
  encodeLocalDatasetPath,
} from "@/utils/datasetRoute";
import { formatStringWithVars } from "@/utils/parquetUtils";
import {
  type DatasetTags,
  EMPTY_TAGS,
  normalizeTags,
} from "@/lib/dataset-tags";

export type { DatasetTags } from "@/lib/dataset-tags";

const MAX_SCAN_DEPTH = 3;
const IGNORE_DIRS = new Set([
  "calibration",
  ".cache",
  ".git",
  "node_modules",
  "__pycache__",
]);

type FeatureInfo = {
  dtype: string;
  shape?: number[];
  names?: unknown;
};

type LocalDatasetInfoJson = {
  codebase_version?: string;
  robot_type?: string | null;
  total_episodes?: number;
  total_frames?: number;
  fps?: number;
  chunks_size?: number;
  data_path?: string;
  video_path?: string;
  features?: Record<string, FeatureInfo>;
};

export type LocalDatasetSummary = {
  relativePath: string;
  encodedPath: string;
  codebase_version: string;
  robot_type: string | null;
  total_episodes: number;
  total_frames: number;
  fps: number;
  thumbnailVideoUrl: string | null;
  integrity: DatasetIntegrity;
  tags: DatasetTags;
};

export type LocalDatasetsResponse = {
  root: string;
  datasets: LocalDatasetSummary[];
  errors: { path: string; message: string }[];
};

async function readDatasetInfo(
  datasetDir: string,
): Promise<LocalDatasetInfoJson | null> {
  const infoPath = path.join(datasetDir, "meta", "info.json");
  try {
    const raw = await fs.readFile(infoPath, "utf-8");
    return JSON.parse(raw) as LocalDatasetInfoJson;
  } catch {
    return null;
  }
}

async function readDatasetTags(datasetDir: string): Promise<DatasetTags> {
  const tagsPath = path.join(datasetDir, "meta", "xense_tags.json");
  try {
    const raw = await fs.readFile(tagsPath, "utf-8");
    return normalizeTags(JSON.parse(raw));
  } catch {
    return { ...EMPTY_TAGS };
  }
}

async function isDirectoryWithContent(dir: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dir);
    if (!stat.isDirectory()) return false;
    const entries = await fs.readdir(dir);
    return entries.length > 0;
  } catch {
    return false;
  }
}

export type DatasetIntegrity = {
  hasData: boolean;
  hasVideos: boolean;
  hasEpisodes: boolean;
  status: "ok" | "empty" | "incomplete";
};

async function probeIntegrity(
  datasetDir: string,
  info: LocalDatasetInfoJson,
): Promise<DatasetIntegrity> {
  const [hasData, hasVideos] = await Promise.all([
    isDirectoryWithContent(path.join(datasetDir, "data")),
    isDirectoryWithContent(path.join(datasetDir, "videos")),
  ]);
  const hasEpisodes = (info.total_episodes ?? 0) > 0;

  let status: DatasetIntegrity["status"];
  if (!hasEpisodes) {
    status = "empty";
  } else if (!hasData || !hasVideos) {
    status = "incomplete";
  } else {
    status = "ok";
  }
  return { hasData, hasVideos, hasEpisodes, status };
}

function pickThumbnailVideoPath(info: LocalDatasetInfoJson): string | null {
  if (!info.video_path || !info.features) return null;

  const videoEntry = Object.entries(info.features).find(
    ([, value]) => value?.dtype === "video",
  );
  if (!videoEntry) return null;
  const [videoKey] = videoEntry;

  return formatStringWithVars(info.video_path, {
    video_key: videoKey,
    episode_chunk: "0".padStart(3, "0"),
    episode_index: "0".padStart(6, "0"),
    chunk_index: "0".padStart(3, "0"),
    file_index: "0".padStart(3, "0"),
  });
}

async function walkForDatasets(
  rootDir: string,
  currentDir: string,
  depth: number,
  found: LocalDatasetSummary[],
  errors: { path: string; message: string }[],
): Promise<void> {
  if (depth > MAX_SCAN_DEPTH) return;

  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(currentDir, { withFileTypes: true });
  } catch (err) {
    errors.push({
      path: currentDir,
      message: err instanceof Error ? err.message : "Failed to read directory",
    });
    return;
  }

  const info = await readDatasetInfo(currentDir);
  if (info && typeof info.codebase_version === "string") {
    const relativePath = path
      .relative(rootDir, currentDir)
      .split(path.sep)
      .join("/");
    if (relativePath) {
      const encodedPath = encodeLocalDatasetPath(relativePath);
      const [integrity, tags] = await Promise.all([
        probeIntegrity(currentDir, info),
        readDatasetTags(currentDir),
      ]);
      const thumbnailPath =
        integrity.status === "ok" ? pickThumbnailVideoPath(info) : null;
      const thumbnailVideoUrl = thumbnailPath
        ? `/api/local-datasets/${encodedPath}/${thumbnailPath}`
        : null;

      found.push({
        relativePath,
        encodedPath,
        codebase_version: info.codebase_version,
        robot_type: info.robot_type ?? null,
        total_episodes: info.total_episodes ?? 0,
        total_frames: info.total_frames ?? 0,
        fps: info.fps ?? 0,
        thumbnailVideoUrl,
        integrity,
        tags,
      });
    }
    return;
  }

  await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.isDirectory() &&
          !entry.name.startsWith(".") &&
          !IGNORE_DIRS.has(entry.name),
      )
      .map((entry) =>
        walkForDatasets(
          rootDir,
          path.join(currentDir, entry.name),
          depth + 1,
          found,
          errors,
        ),
      ),
  );
}

export function resolveLocalDatasetRoot(): string {
  const homeDir = process.env.HOME?.trim();
  const configuredRoot =
    process.env.LOCAL_DATASET_ROOT?.trim() ||
    process.env.NEXT_PUBLIC_LOCAL_DATASET_ROOT?.trim() ||
    (homeDir ? `${homeDir}${DEFAULT_LOCAL_DATASET_ROOT_SUFFIX}` : "");
  if (!configuredRoot) {
    throw new Error(
      "Unable to resolve local dataset root. Set LOCAL_DATASET_ROOT or HOME.",
    );
  }
  return path.resolve(configuredRoot);
}

export async function discoverLocalDatasets(): Promise<LocalDatasetsResponse> {
  let root: string;
  try {
    root = resolveLocalDatasetRoot();
  } catch (err) {
    return {
      root: "",
      datasets: [],
      errors: [
        {
          path: "",
          message:
            err instanceof Error
              ? err.message
              : "Failed to resolve local dataset root",
        },
      ],
    };
  }

  try {
    await fs.access(root);
  } catch {
    return {
      root,
      datasets: [],
      errors: [
        {
          path: root,
          message: `Local dataset root does not exist: ${root}`,
        },
      ],
    };
  }

  const datasets: LocalDatasetSummary[] = [];
  const errors: { path: string; message: string }[] = [];
  await walkForDatasets(root, root, 0, datasets, errors);
  datasets.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  return { root, datasets, errors };
}
