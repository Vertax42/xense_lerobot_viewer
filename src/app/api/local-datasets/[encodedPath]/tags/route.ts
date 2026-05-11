import { NextRequest } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {
  decodeLocalDatasetPath,
  resolveServerLocalDatasetPath,
} from "@/utils/datasetRoute";
import {
  type DatasetTags,
  EMPTY_TAGS,
  normalizeTags,
} from "@/lib/dataset-tags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TAGS_FILENAME = "xense_tags.json";

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

function tagsFilePath(datasetDir: string): string {
  return path.join(datasetDir, "meta", TAGS_FILENAME);
}

async function readTagsFile(datasetDir: string): Promise<DatasetTags> {
  try {
    const raw = await fs.readFile(tagsFilePath(datasetDir), "utf-8");
    return normalizeTags(JSON.parse(raw));
  } catch {
    return { ...EMPTY_TAGS };
  }
}

async function writeTagsFile(
  datasetDir: string,
  tags: DatasetTags,
): Promise<void> {
  const metaDir = path.join(datasetDir, "meta");
  await fs.mkdir(metaDir, { recursive: true });
  const target = tagsFilePath(datasetDir);
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  const payload = JSON.stringify(tags, null, 2) + "\n";
  await fs.writeFile(tmp, payload, "utf-8");
  await fs.rename(tmp, target);
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ encodedPath: string }> },
): Promise<Response> {
  const { encodedPath } = await ctx.params;
  const datasetDir = await resolveDatasetDir(encodedPath);
  if (!datasetDir) {
    return Response.json({ error: "Dataset not found" }, { status: 404 });
  }
  const tags = await readTagsFile(datasetDir);
  return Response.json(tags);
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

  const tags = normalizeTags(body);
  tags.updated_at = new Date().toISOString();

  try {
    await writeTagsFile(datasetDir, tags);
  } catch (err) {
    return Response.json(
      {
        error: err instanceof Error ? err.message : "Failed to write tags file",
      },
      { status: 500 },
    );
  }

  return Response.json(tags);
}
