FROM node:24-bookworm-slim AS builder

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.17.0 --activate

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @miran/web build

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.17.0 --activate

COPY --from=builder /app /app
RUN chown -R node:node /app
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>{if(r.status>=500)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["pnpm", "--filter", "@miran/web", "start"]
