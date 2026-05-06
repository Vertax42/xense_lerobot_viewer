import EpisodeViewer from "@/app/[org]/[dataset]/[episode]/episode-viewer";
import { Suspense } from "react";
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

export default async function LocalEpisodePage({
  params,
}: {
  params: Promise<{ encodedPath: string; episode: string }>;
}) {
  const { encodedPath, episode } = await params;
  const episodeNumber = Number(episode.replace(/^episode_/, ""));

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
