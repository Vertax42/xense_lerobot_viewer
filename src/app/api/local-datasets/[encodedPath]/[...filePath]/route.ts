import { NextRequest } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { decodeLocalDatasetPath } from "@/utils/datasetRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".m4v"]);
const DEFAULT_VIDEO_RANGE_CHUNK_SIZE = 2 * 1024 * 1024;

function inferContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".jsonl") return "application/x-ndjson; charset=utf-8";
  if (ext === ".parquet") return "application/octet-stream";
  if (VIDEO_EXTENSIONS.has(ext)) return "video/mp4";
  return "application/octet-stream";
}

function normalizeRange(
  rangeHeader: string,
  fileSize: number,
): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) return null;

  const [, startRaw, endRaw] = match;
  let start: number;
  let end: number;

  if (startRaw === "" && endRaw === "") return null;

  if (startRaw === "") {
    const suffixLength = Number.parseInt(endRaw, 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, fileSize - suffixLength);
    end = fileSize - 1;
  } else {
    start = Number.parseInt(startRaw, 10);
    if (!Number.isFinite(start) || start < 0) return null;
    end =
      endRaw === ""
        ? Math.min(start + DEFAULT_VIDEO_RANGE_CHUNK_SIZE - 1, fileSize - 1)
        : Number.parseInt(endRaw, 10);
    if (!Number.isFinite(end) || end < start) return null;
    end = Math.min(end, fileSize - 1);
  }

  if (start >= fileSize) return null;
  return { start, end };
}

async function openLocalFile(
  encodedPath: string,
  relativeFilePath: string[],
): Promise<{
  absolutePath: string;
  size: number;
} | null> {
  const datasetRoot = path.resolve(decodeLocalDatasetPath(encodedPath));
  const requestedPath = path.resolve(datasetRoot, ...relativeFilePath);
  const relative = path.relative(datasetRoot, requestedPath);

  if (
    relative === "" ||
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    return null;
  }

  let stat;
  try {
    stat = await fs.stat(requestedPath);
  } catch {
    return null;
  }

  if (!stat.isFile()) return null;

  return {
    absolutePath: requestedPath,
    size: Number(stat.size),
  };
}

function buildCommonHeaders(filePath: string, size: number): Headers {
  const headers = new Headers();
  headers.set("content-type", inferContentType(filePath));
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "private, max-age=3600, stale-while-revalidate=86400");
  headers.set("content-length", String(size));
  return headers;
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ encodedPath: string; filePath: string[] }> },
) {
  const { encodedPath, filePath } = await ctx.params;
  const file = await openLocalFile(encodedPath, filePath);
  if (!file) return new Response("Not found", { status: 404 });

  const rangeHeader = req.headers.get("range");
  if (!rangeHeader) {
    const headers = buildCommonHeaders(file.absolutePath, file.size);
    const buffer = await fs.readFile(file.absolutePath);
    return new Response(buffer, { status: 200, headers });
  }

  const range = normalizeRange(rangeHeader, file.size);
  if (!range) {
    return new Response("Range Not Satisfiable", {
      status: 416,
      headers: {
        "content-range": `bytes */${file.size}`,
      },
    });
  }

  const handle = await fs.open(file.absolutePath, "r");
  const body = new Uint8Array(range.end - range.start + 1);
  await handle.read(body, 0, body.byteLength, range.start);
  await handle.close();
  const headers = buildCommonHeaders(file.absolutePath, body.byteLength);
  headers.set(
    "content-range",
    `bytes ${range.start}-${range.end}/${file.size}`,
  );

  return new Response(body, {
    status: 206,
    headers,
  });
}

export async function HEAD(
  _req: NextRequest,
  ctx: { params: Promise<{ encodedPath: string; filePath: string[] }> },
) {
  const { encodedPath, filePath } = await ctx.params;
  const file = await openLocalFile(encodedPath, filePath);
  if (!file) return new Response(null, { status: 404 });

  return new Response(null, {
    status: 200,
    headers: buildCommonHeaders(file.absolutePath, file.size),
  });
}
