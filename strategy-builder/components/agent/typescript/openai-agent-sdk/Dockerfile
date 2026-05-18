# syntax=docker/dockerfile:1

# ---------- Stage 1: Install dependencies ----------
FROM node:24-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# ---------- Stage 2: Production image ----------
FROM node:24-alpine

WORKDIR /app

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy deps from stage 1
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

# Switch to non-root
USER appuser

# Default port
ENV PORT=3000
EXPOSE 3000

# Health check
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://localhost:3000/health || exit 1

CMD ["node", "src/server.ts"]
