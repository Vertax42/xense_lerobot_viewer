import { NextRequest } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {
  decodeLocalDatasetPath,
  resolveServerLocalDatasetPath,
} from "@/utils/datasetRoute";
import type { LanguageAtom } from "@/types/language.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ANNOTATIONS_FILENAME = "lerobot_annotations.json";
const SCHEMA_VERSION = 2;

type EpisodeEntry = { atoms: LanguageAtom[] };
type AnnotationsFile = {
  version: number;
  episodes: Record<string, EpisodeEntry>;
  updated_at?: string;
};

function emptyFile(): AnnotationsFile {
  return { version: SCHEMA_VERSION, episodes: {} };
}

async function resolveDatasetDir(encodedPath: string): Promise<string | null> {
  let absolute: string;
  try {
    absolute = path.resolve(
      resolveServerLocalDatasetPath(decodeLocalDatasetPath(encodedPath)),
    );
  } catch {
    return null;
  }
  try {
    const stat = await fs.stat(absolute);
    if (!stat.isDirectory()) return null;
  } catch {
    return null;
  }
  return absolute;
}

function annotationsFilePath(datasetDir: string): string {
  return path.join(datasetDir, "meta", ANNOTATIONS_FILENAME);
}

/** Coerce an unknown value to a canonical LanguageAtom, or null if invalid. */
function normalizeAtom(raw: unknown): LanguageAtom | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const role = typeof r.role === "string" ? r.role : null;
  if (!role) return null;
  const style = typeof r.style === "string" ? r.style : null;
  const content = typeof r.content === "string" ? r.content : null;
  const timestamp = typeof r.timestamp === "number" ? r.timestamp : 0;
  const camera =
    typeof r.camera === "string" && r.camera.length > 0 ? r.camera : null;
  const tool_calls = Array.isArray(r.tool_calls) ? r.tool_calls : null;
  return {
    role,
    content,
    style,
    timestamp,
    camera,
    tool_calls,
  } as LanguageAtom;
}

function normalizeAtoms(input: unknown): LanguageAtom[] {
  if (!Array.isArray(input)) return [];
  const out: LanguageAtom[] = [];
  for (const raw of input) {
    const atom = normalizeAtom(raw);
    if (atom) out.push(atom);
  }
  return out;
}

async function readAnnotationsFile(
  datasetDir: string,
): Promise<AnnotationsFile> {
  try {
    const raw = await fs.readFile(annotationsFilePath(datasetDir), "utf-8");
    const parsed = JSON.parse(raw) as Partial<AnnotationsFile>;
    const episodes: Record<string, EpisodeEntry> = {};
    if (parsed.episodes && typeof parsed.episodes === "object") {
      for (const [key, entry] of Object.entries(parsed.episodes)) {
        episodes[key] = { atoms: normalizeAtoms(entry?.atoms) };
      }
    }
    return { version: SCHEMA_VERSION, episodes, updated_at: parsed.updated_at };
  } catch {
    return emptyFile();
  }
}

async function writeAnnotationsFile(
  datasetDir: string,
  data: AnnotationsFile,
): Promise<void> {
  const metaDir = path.join(datasetDir, "meta");
  await fs.mkdir(metaDir, { recursive: true });
  const target = annotationsFilePath(datasetDir);
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  const payload = JSON.stringify(data, null, 2) + "\n";
  await fs.writeFile(tmp, payload, "utf-8");
  await fs.rename(tmp, target);
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ encodedPath: string }> },
): Promise<Response> {
  const { encodedPath } = await ctx.params;
  const datasetDir = await resolveDatasetDir(encodedPath);
  if (!datasetDir) {
    return Response.json({ error: "Dataset not found" }, { status: 404 });
  }
  const file = await readAnnotationsFile(datasetDir);

  // `?episode=N` returns just that episode's atoms; otherwise the whole file.
  const episodeParam = req.nextUrl.searchParams.get("episode");
  if (episodeParam !== null) {
    const entry = file.episodes[episodeParam];
    return Response.json({ atoms: entry?.atoms ?? [] });
  }
  return Response.json(file);
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ encodedPath: string }> },
): Promise<Response> {
  const { encodedPath } = await ctx.params;
  const datasetDir = await resolveDatasetDir(encodedPath);
  if (!datasetDir) {
    return Response.json({ error: "Dataset not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const b = body as { episode_index?: unknown; atoms?: unknown };
  const episodeIndex =
    typeof b.episode_index === "number" ? b.episode_index : null;
  if (episodeIndex === null) {
    return Response.json(
      { error: "episode_index (number) is required" },
      { status: 400 },
    );
  }
  const atoms = normalizeAtoms(b.atoms);

  // Read-modify-write the whole sidecar so other episodes are preserved.
  const file = await readAnnotationsFile(datasetDir);
  file.episodes[String(episodeIndex)] = { atoms };
  file.updated_at = new Date().toISOString();

  try {
    await writeAnnotationsFile(datasetDir, file);
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to write annotations",
      },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    saved: atoms.length,
    path: annotationsFilePath(datasetDir),
  });
}
