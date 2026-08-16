FROM node:24-bookworm-slim AS runtime

ARG START_FILE
ENV NODE_ENV=production
ENV PORT=3001
ENV SCOPED_CORE_PORT=3901
ENV SERVICE_START_FILE=${START_FILE}
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.17.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/marketplace-core/package.json services/marketplace-core/package.json

RUN pnpm install --frozen-lockfile --prod --filter @miran/marketplace-core...

COPY services/marketplace-core services/marketplace-core
COPY services/service-runtime services/service-runtime
COPY services/auth-service services/auth-service
COPY services/catalog-service services/catalog-service
COPY services/admin-service services/admin-service

RUN test -n "$SERVICE_START_FILE" && test -f "$SERVICE_START_FILE" && chown -R node:node /app
USER node

EXPOSE 3001

HEALTHCHECK --interval=20s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3001/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["sh", "-c", "exec node \"$SERVICE_START_FILE\""]
