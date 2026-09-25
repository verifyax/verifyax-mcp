# syntax=docker/dockerfile:1

# Pinned to a specific patch tag for reproducibility
FROM node:24.21.0-slim AS build
WORKDIR /app
# Install pnpm directly rather than via corepack: corepack is being unbundled
# from Node (absent in 26-slim), so this keeps the image buildable across base
# versions. The pin is unchanged.
RUN npm i -g pnpm@10.33.0
# A Docker build has no TTY, so pnpm refuses to purge node_modules without this.
ENV CI=true
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY packages/sdk/package.json packages/sdk/tsconfig.json packages/sdk/
COPY packages/mcp-server/package.json packages/mcp-server/tsconfig.json packages/mcp-server/
RUN pnpm install --frozen-lockfile
COPY scripts scripts
COPY packages/sdk/src packages/sdk/src
COPY packages/mcp-server/src packages/mcp-server/src
RUN pnpm build
# Build a self-contained prod tree: only mcp-server's runtime dependencies, with
# @verifyax/sdk materialised from the workspace instead of symlinked.
# `--legacy` is required because this workspace does not set
# inject-workspace-packages. Don't swap this for `pnpm prune --prod`: prune wipes
# the workspace packages' node_modules, leaving @verifyax/sdk unresolvable.
RUN pnpm deploy --legacy --filter @verifyax/mcp-server --prod /deploy

FROM node:24.21.0-slim
WORKDIR /app
ENV NODE_ENV=production
# Provide a dummy API key so the server starts for Glama's introspection checks.
# Users will provide their own VERIFYAX_API_KEY when running the server.
ENV VERIFYAX_API_KEY=dummy-key-for-introspection

# Land the bundle on the path the entrypoint has always used, owned by the
# unprivileged `node` user, and drop root.
COPY --from=build --chown=node:node /deploy /app/packages/mcp-server
USER node

# Default entrypoint runs the stdio server (standard for MCP introspection).
ENTRYPOINT ["node", "packages/mcp-server/dist/index.js"]
