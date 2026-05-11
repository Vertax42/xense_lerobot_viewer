# XenseRobotics · LeRobot Local Dataset Visualizer

A web tool by **Xense Robotics** for interactive exploration of **local** LeRobot datasets — videos, sensor signals, episode statistics, and 3D URDF replay, all served straight from the filesystem.

This fork removes the Hugging Face Hub remote-loading path; everything reads from your local LeRobot cache (`~/.cache/huggingface/lerobot` by default).

## Features

- **Local dataset browser**: the homepage lists every LeRobot dataset under your local root with a video preview and metadata badge (robot type, codebase version, episode count). Filter by name, robot type, or **dataset tags** (see below).
- **Dataset health probing**: each dataset is scanned for `meta/info.json` + `data/` + `videos/` and classified as Healthy / Empty / Incomplete. The homepage shows red/amber card borders + corner badges for problem datasets; clicking an incomplete one opens a diagnostic page instead of failing on a missing file.
- **Editable dataset tags** (task / scene / objects): annotate each dataset with a task category (`pick_and_place`, `peeling`, …), a scene (`tabletop`, `kitchen`, …), and a list of manipulated objects (`cucumber`, `box`, …). Tags persist as `meta/xense_tags.json` inside the dataset and power a task-based filter on the homepage. See [Tagging datasets](#tagging-datasets) below.
- **Synchronized video + telemetry**: episode pages play all cameras side-by-side, synced to interactive Recharts time series for `observation.state`, `action`, and other signals.
- **Statistics, Frames, Action Insights, Filtering** panels for dataset quality inspection — flagged episodes can be exported as a ready-to-run LeRobot CLI command.
- **3D URDF replay** for SO-100, SO-101, and OpenArm bimanual robots, with auto-matched joint mapping that tolerates `.pos` / `.position` / `.q` column suffixes. URDF assets load from the public Hugging Face `lerobot/robot-urdfs` bucket.
- **Per-card "Open episode N" shortcut**: jump straight to a specific episode from the homepage card.
- Supports dataset codebase versions **v2.0 / v2.1 / v3.0** (autodetected from `meta/info.json`).

## Prerequisites

- [Bun](https://bun.sh) for the package manager and test runner
- A directory of LeRobot datasets on disk

```bash
curl -fsSL https://bun.sh/install | bash
```

## Setup

```bash
git clone git@github.com:xensedyl/lerobot-dataset-visualizer.git
cd lerobot-dataset-visualizer
bun install
bun dev
```

Open <http://localhost:3000>. The homepage scans your local LeRobot root and shows everything it finds.

## Local dataset root

The app expects a directory tree like this:

```text
<LOCAL_DATASET_ROOT>/
  <org-or-namespace>/<dataset-name>/
    meta/info.json
    data/...
    videos/...
```

The root is resolved in this order:

1. `LOCAL_DATASET_ROOT` (server-side only)
2. `NEXT_PUBLIC_LOCAL_DATASET_ROOT` (server- or client-readable)
3. `${HOME}/.cache/huggingface/lerobot` (default)

Set it explicitly when running outside the default location:

```bash
LOCAL_DATASET_ROOT=/data/lerobot bun dev
```

Datasets are discovered by recursively scanning for `meta/info.json` (up to 3 levels deep). The `calibration/` directory is skipped automatically.

### Downloading datasets

Use the standard `huggingface-cli` to populate the cache:

```bash
huggingface-cli download lerobot/svla_so101_pickplace \
  --repo-type dataset \
  --local-dir ~/.cache/huggingface/lerobot/lerobot/svla_so101_pickplace
```

Once the download finishes, refresh the homepage — the new dataset will appear.

## Commands

```bash
bun dev              # Next.js dev server
bun run build        # Production build
bun start            # Production server
bun test             # Unit tests (bun:test)
bun run type-check   # TypeScript: app + tests
bun run lint         # ESLint
bun run format       # Prettier --write
bun run validate     # type-check + lint + format:check + test
```

After any code change: `bun run format && bun run validate`.

## Tagging datasets

LeRobot's schema doesn't carry a concept of "task category" or "scene" at the dataset level — only natural-language `tasks` per episode. This visualizer adds an editable sidecar so you can curate three pieces of dataset-level metadata:

| Field     | Type                      | Example                                   |
| --------- | ------------------------- | ----------------------------------------- |
| `task`    | single string             | `pick_and_place`, `peeling`, `assembly`   |
| `scene`   | single string             | `tabletop`, `kitchen`, `industrial_bench` |
| `objects` | string list               | `["cucumber", "knife"]`                   |
| `notes`   | free-form text (optional) | `"left arm only, gripper repurposed"`     |

Tags are stored per-dataset as plain JSON at:

```
<LOCAL_DATASET_ROOT>/<org>/<dataset>/meta/xense_tags.json
```

The `xense_` filename prefix keeps the sidecar from ever colliding with upstream LeRobot fields, and the per-dataset location means tags travel with the data when it is `rsync`-ed or moved to another machine. The file is plain UTF-8 JSON; you can also edit it by hand.

### Editing tags

Two entry points:

1. **Homepage card** — hover any dataset card, an `✎ Tags` button appears in the top-left corner. Click to open the editor modal. Useful for quick first-pass labelling across many datasets.
2. **Episode viewer** — open any episode, an `✎ Edit tags` button sits next to the dataset name (top-right of the Episodes tab). The currently-loaded tags also render as colored chips under the dataset name so you can verify what's set. Useful for refining tags while inspecting the data.

The editor offers a suggested vocabulary in dropdowns (`pick_and_place`, `peeling`, `tabletop`, `kitchen`, etc.), but you can always pick `+ Custom value…` to type a new label — values are normalized (lowercase, whitespace → `_`) on save, so `"Pick And Place"` and `"pick_and_place"` collapse into the same tag.

### Filtering by tag

When at least one dataset has a `task` tag, the homepage shows a **Task** filter row above the grid:

- `All (N)` — show everything
- `peeling (3)`, `pick_and_place (5)`, … — click to show only that task
- `Untagged (M)` — datasets without a `task` tag yet

The search box also matches against task / scene / object values, so typing `cucumber` will find any dataset whose `objects` list contains it.

### Example sidecar

```json
{
  "task": "peeling",
  "scene": "kitchen",
  "objects": ["cucumber", "knife"],
  "notes": "right-hand only, left arm parked",
  "updated_at": "2026-05-11T12:21:00.069Z"
}
```

`updated_at` is auto-stamped by the server on every save. Missing fields are treated as "unset" — an absent `xense_tags.json` is equivalent to all fields empty.

## Architecture notes

- Dataset files are served by an internal route `/api/local-datasets/[encodedPath]/[...filePath]` with HTTP range support for video streaming.
- The homepage discovers datasets via `src/lib/local-datasets-discovery.ts`.
- All cloud/HF Hub loading code (OAuth, proxy, search) has been removed.
- URDF/mesh assets for the 3D replay still load from `https://huggingface.co/buckets/lerobot/robot-urdfs/` (override with `NEXT_PUBLIC_URDF_BASE_URL`).

## Docker

The Dockerfile declares a `VOLUME ["/data/lerobot"]` and defaults `LOCAL_DATASET_ROOT=/data/lerobot` — mount your host LeRobot cache there:

```bash
docker build -t xense-lerobot-visualizer .

# Bind-mount the host cache (read-only is fine):
docker run -p 7860:7860 \
  -v ~/.cache/huggingface/lerobot:/data/lerobot:ro \
  xense-lerobot-visualizer

# Or point at a different host path:
docker run -p 7860:7860 \
  -v /mnt/big-disk/lerobot-data:/data/lerobot:ro \
  xense-lerobot-visualizer
```

Open <http://localhost:7860>.

If you keep datasets in several places, override the env directly:

```bash
docker run -p 7860:7860 \
  -v /srv/datasets:/srv/datasets:ro \
  -e LOCAL_DATASET_ROOT=/srv/datasets \
  xense-lerobot-visualizer
```

## Acknowledgement

This project is forked from the LeRobot dataset visualizer originally created by [@Mishig25](https://github.com/mishig25) (huggingface/lerobot PR [#1055](https://github.com/huggingface/lerobot/pull/1055)).
