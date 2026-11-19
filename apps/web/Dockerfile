FROM node:26-alpine AS base
# Node 25+ no longer ships Corepack; install the pnpm version pinned in package.json "packageManager".
RUN npm install -g pnpm@10.10.0
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared packages/shared
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @gatepass/web...
COPY apps/web apps/web
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @gatepass/web build

# Standalone output carries only the files the server traced, about a tenth of node_modules.
FROM node:26-alpine AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
