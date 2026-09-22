# The web app as one self-contained Next.js server. Built from the monorepo root:
#   docker build -t yotrade-web .
# NEXT_PUBLIC_* values are inlined at build time, so they arrive as build arguments.

FROM node:24-bookworm-slim AS build
RUN npm install --global bun@1.3.14
WORKDIR /repo
COPY . .
RUN bun install --frozen-lockfile

ARG NEXT_PUBLIC_RP_ID
ARG NEXT_PUBLIC_RPC_URL
ARG NEXT_PUBLIC_ALCHEMY_API_KEY
ARG NEXT_PUBLIC_INDEXER_URL
ENV NEXT_PUBLIC_RP_ID=$NEXT_PUBLIC_RP_ID \
    NEXT_PUBLIC_RPC_URL=$NEXT_PUBLIC_RPC_URL \
    NEXT_PUBLIC_ALCHEMY_API_KEY=$NEXT_PUBLIC_ALCHEMY_API_KEY \
    NEXT_PUBLIC_INDEXER_URL=$NEXT_PUBLIC_INDEXER_URL \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /repo/apps/web
RUN bun run build

FROM node:24-bookworm-slim AS run
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
