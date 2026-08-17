FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PORT=3001
WORKDIR /app

COPY services/api-gateway services/api-gateway

RUN chown -R node:node /app
USER node

EXPOSE 3001

HEALTHCHECK --interval=20s --timeout=6s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3001/health').then(async r=>{if(!r.ok)process.exit(1);const body=await r.json();if(body?.ok!==true)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "services/api-gateway/src/start.js"]
