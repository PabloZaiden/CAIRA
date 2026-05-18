FROM node:24-alpine

WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

COPY package.json package-lock.json* ./
RUN npm ci --production=false

COPY tsconfig.json ./
COPY src/ ./src/
RUN chown -R app:app /app

EXPOSE 8100

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:8100/health || exit 1

USER app

CMD ["node", "src/server.ts"]
