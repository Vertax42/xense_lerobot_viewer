/**
 * Local-only annotation persistence client.
 *
 * This fork has no external FastAPI backend. Annotations are stored as
 * `meta/lerobot_annotations.json` inside each dataset and read/written through
 * the Next.js route `/api/local-datasets/<encodedPath>/annotations` (mirroring
 * the `meta/xense_tags.json` pattern). Frame timestamps come from the parquet
 * via `fetch-data.ts`, so there is no remote frame-timestamp fetch.
 *
 * The function names mirror the upstream backend client so the annotations
 * context and panel can call them unchanged.
 */

import type { LanguageAtom } from "../types/language.types";
import { getLocalDatasetFileBase } from "./datasetRoute";

interface DatasetIdent {
  repoId?: string | null;
  localPath?: string | null;
  revision?: string | null;
}

/**
 * Local JSON persistence is always available — there is no backend to be
 * "offline". Kept as a function (rather than a constant) so the context and
 * panel keep their existing call sites.
 */
export function isAnnotateBackendEnabled(): boolean {
  return true;
}

/** Base route for a dataset's annotation file, or null if the id isn't local. */
function annotationsBase(ident: DatasetIdent): string | null {
  if (!ident.repoId) return null;
  try {
    return `${getLocalDatasetFileBase(ident.repoId)}/annotations`;
  } catch {
    return null;
  }
}

export async function fetchEpisodeAtoms(
  episodeId: number,
  ident: DatasetIdent,
): Promise<LanguageAtom[]> {
  const base = annotationsBase(ident);
  if (!base) return [];
  try {
    const res = await fetch(`${base}?episode=${episodeId}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { atoms?: LanguageAtom[] };
    return data.atoms || [];
  } catch {
    return [];
  }
}

export async function saveEpisodeAtoms(
  episodeId: number,
  ident: DatasetIdent,
  atoms: LanguageAtom[],
): Promise<{ path: string | null }> {
  const base = annotationsBase(ident);
  if (!base) return { path: null };
  const res = await fetch(base, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ episode_index: episodeId, atoms }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => `${res.status}`);
    throw new Error(text || `save atoms: ${res.status}`);
  }
  const data = (await res.json().catch(() => ({}))) as { path?: string | null };
  return { path: data.path ?? null };
}

/**
 * Frame timestamps are seeded from the parquet (see `fetch-data.ts`), so the
 * local client has nothing to fetch. Kept for call-site compatibility.
 */
export async function fetchFrameTimestamps(): Promise<number[]> {
  return [];
}
