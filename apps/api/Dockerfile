FROM node:26-alpine AS base
# Node 25+ no longer ships Corepack; install the pnpm version pinned in package.json "packageManager".
RUN npm install -g pnpm@10.10.0
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared packages/shared
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @gatepass/api...
COPY apps/api apps/api
RUN pnpm --filter @gatepass/api build \
 && pnpm --filter @gatepass/api deploy --prod --legacy --ignore-scripts /out

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/node_modules node_modules
COPY --from=build /out/package.json package.json
COPY --from=build /app/apps/api/dist dist
COPY apps/api/drizzle drizzle
USER node
EXPOSE 4000
CMD ["node", "dist/index.js"]
