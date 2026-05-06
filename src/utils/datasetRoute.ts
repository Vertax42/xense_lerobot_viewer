export const LOCAL_ROUTE_ORG = "_local";
const LOCAL_PREFIX = "local:";
const LOCAL_ROUTE_PREFIX = "/_local";
const LOCAL_FILE_ROUTE_PREFIX = "/api/local-datasets";

function encodeUtf8ToBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64UrlToUtf8(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function isLocalRepoId(repoId: string): boolean {
  return repoId.startsWith(LOCAL_PREFIX);
}

export function makeLocalRepoId(datasetPath: string): string {
  return `${LOCAL_PREFIX}${datasetPath}`;
}

export function getLocalDatasetPath(repoId: string): string | null {
  if (!isLocalRepoId(repoId)) return null;
  return repoId.slice(LOCAL_PREFIX.length) || null;
}

export function encodeLocalDatasetPath(datasetPath: string): string {
  return encodeUtf8ToBase64Url(datasetPath);
}

export function decodeLocalDatasetPath(encodedPath: string): string {
  return decodeBase64UrlToUtf8(encodedPath);
}

export function getLocalDatasetRoute(encodedPath: string): string {
  return `${LOCAL_ROUTE_PREFIX}/${encodedPath}`;
}

export function getLocalDatasetFileBase(repoId: string): string {
  const datasetPath = getLocalDatasetPath(repoId);
  if (!datasetPath) {
    throw new Error(`Not a local dataset repo id: ${repoId}`);
  }
  return `${LOCAL_FILE_ROUTE_PREFIX}/${encodeLocalDatasetPath(datasetPath)}`;
}

export function getDisplayNameForRepoId(repoId: string): string {
  return getLocalDatasetPath(repoId) ?? repoId;
}

export function isAbsoluteDatasetPath(value: string): boolean {
  if (!value) return false;
  if (value.startsWith("file://")) return true;

  return (
    value.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    value.startsWith("\\\\")
  );
}

export function normalizeDatasetPathInput(value: string): string {
  if (value.startsWith("file://")) {
    return decodeURIComponent(value.slice("file://".length));
  }
  return value;
}

export function repoIdFromRouteParams(org: string, dataset: string): string {
  if (org === LOCAL_ROUTE_ORG) {
    return makeLocalRepoId(decodeLocalDatasetPath(dataset));
  }
  return `${org}/${dataset}`;
}

export function routePathFromRepoId(
  repoId: string,
  episodeId?: number,
): string {
  const suffix =
    episodeId === undefined ? "" : `/episode_${Math.max(0, episodeId)}`;

  if (isLocalRepoId(repoId)) {
    const datasetPath = getLocalDatasetPath(repoId);
    if (!datasetPath) {
      throw new Error(`Invalid local repo id: ${repoId}`);
    }
    return `${LOCAL_ROUTE_PREFIX}/${encodeLocalDatasetPath(datasetPath)}${suffix}`;
  }

  return `/${repoId}${suffix}`;
}
