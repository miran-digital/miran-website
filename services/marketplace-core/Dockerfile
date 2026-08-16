FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PORT=3001
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.17.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/marketplace-core/package.json services/marketplace-core/package.json

RUN pnpm install --frozen-lockfile --prod --filter @miran/marketplace-core...

COPY services/marketplace-core services/marketplace-core

RUN chown -R node:node /app
USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "services/marketplace-core/src/start.js"]
