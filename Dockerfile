FROM oven/bun:1 AS base

WORKDIR /app

# Install dependencies first for better layer caching.
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY . .

RUN bun run build

# The container expects local LeRobot datasets to be mounted at /data/lerobot,
# either via `-v ~/.cache/huggingface/lerobot:/data/lerobot` on the host or
# a Docker named volume.
ENV LOCAL_DATASET_ROOT=/data/lerobot
VOLUME ["/data/lerobot"]

EXPOSE 7860
ENV PORT=7860

CMD ["bun", "start"]
