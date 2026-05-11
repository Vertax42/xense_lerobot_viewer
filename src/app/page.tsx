import LocalDatasetGrid from "./local-dataset-grid";
import { discoverLocalDatasets } from "@/lib/local-datasets-discovery";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { root, datasets, errors } = await discoverLocalDatasets();

  return <LocalDatasetGrid root={root} datasets={datasets} errors={errors} />;
}
