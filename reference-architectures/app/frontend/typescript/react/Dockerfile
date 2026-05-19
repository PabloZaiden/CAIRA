# syntax=docker/dockerfile:1

# ---------- Stage 1: Build React SPA ----------
FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci 2>/dev/null || npm install

COPY vite.config.ts index.html ./
COPY src ./src

# Vite build uses esbuild for TypeScript — does not need tsconfig extends chain.
# Typecheck is done separately as part of CI, not in the Docker build.
RUN npx vite build

# ---------- Stage 2: Production deps only ----------
FROM node:24-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# ---------- Stage 3: BFF server ----------
FROM node:24-alpine

WORKDIR /app

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy production deps
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./

# Copy the BFF server source tree (runs with native TypeScript support, no build step)
COPY src ./src

# Copy built React SPA from stage 1
COPY --from=build /app/dist ./dist

# Switch to non-root
USER appuser

# Default port
ENV PORT=8080
EXPOSE 8080

# Health check
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://localhost:8080/health || exit 1

CMD ["node", "src/server.ts"]
