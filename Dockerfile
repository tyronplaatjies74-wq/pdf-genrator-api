# ---- build stage: compiles native deps (better-sqlite3) ----
FROM node:20-bookworm AS build
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY package*.json ./
RUN npm ci --omit=dev

# ---- runtime stage ----
FROM node:20-bookworm-slim
ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    CHROME_PATH=/usr/bin/chromium \
    CHROME_NO_SANDBOX=true \
    DATABASE_PATH=/data/app.db

RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium dumb-init curl \
      fonts-liberation fonts-dejavu-core fonts-noto-core fonts-noto-color-emoji fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir /data && chown node:node /data

WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src

USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD curl -fs http://localhost:3000/health || exit 1
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]