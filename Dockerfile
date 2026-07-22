# syntax=docker/dockerfile:1

# Pinned to a specific patch tag for reproducibility
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
# Strip devDependencies so they never reach the runtime image
RUN pnpm prune --prod

FROM node:22.19.0-slim
WORKDIR /app
ENV NODE_ENV=production
# Provide a dummy API key so the server starts for Glama's introspection checks.
# Users will provide their own VERIFYAX_API_KEY when running the server.
ENV VERIFYAX_API_KEY=dummy-key-for-introspection

# Copy the pruned tree owned by the unprivileged `node` user and drop root.
COPY --from=build --chown=node:node /app /app
USER node

# Default entrypoint runs the stdio server (standard for MCP introspection).
ENTRYPOINT ["node", "packages/mcp-server/dist/index.js"]
