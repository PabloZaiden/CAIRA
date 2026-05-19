FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --silent
COPY . ./
RUN npm run build

FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --silent
COPY --from=build /app/dist ./dist
COPY src/server.ts ./src/server.ts
ENV HOST=0.0.0.0
ENV PORT=8080
EXPOSE 8080
CMD ["node", "src/server.ts"]
