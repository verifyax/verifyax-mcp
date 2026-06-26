# syntax=docker/dockerfile:1

FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY packages/sdk/package.json packages/sdk/tsconfig.json packages/sdk/
COPY packages/mcp-server/package.json packages/mcp-server/tsconfig.json packages/mcp-server/
RUN pnpm install --frozen-lockfile
COPY packages/sdk/src packages/sdk/src
COPY packages/mcp-server/src packages/mcp-server/src
RUN pnpm build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
EXPOSE 8080
COPY --from=build /app /app
WORKDIR /app
CMD ["node", "packages/mcp-server/dist/http.js"]
