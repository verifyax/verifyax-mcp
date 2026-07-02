# syntax=docker/dockerfile:1

# Pinned to a specific patch tag for reproducibility (prefer a digest pin,
# e.g. node:22.19.0-slim@sha256:..., once you've resolved one for your registry).
FROM node:22.19.0-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY packages/sdk/package.json packages/sdk/tsconfig.json packages/sdk/
COPY packages/mcp-server/package.json packages/mcp-server/tsconfig.json packages/mcp-server/
RUN pnpm install --frozen-lockfile
COPY scripts scripts
COPY packages/sdk/src packages/sdk/src
COPY packages/mcp-server/src packages/mcp-server/src
RUN pnpm build
# Strip devDependencies so they never reach the runtime image (OPS-2).
RUN pnpm prune --prod

FROM node:22.19.0-slim
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
EXPOSE 8080
# Copy the pruned tree owned by the unprivileged `node` user and drop root (OPS-2).
COPY --from=build --chown=node:node /app /app
USER node
CMD ["node", "packages/mcp-server/dist/http.js"]
