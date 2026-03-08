# syntax=docker/dockerfile:1

# ---------- Stage 1: Build ----------
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build

WORKDIR /src

COPY CairaApi.csproj ./
RUN dotnet restore

COPY . .
RUN dotnet publish -c Release -o /app

# ---------- Stage 2: Production image ----------
FROM mcr.microsoft.com/dotnet/aspnet:10.0

WORKDIR /app

# Install curl for health checks (not included in aspnet base image)
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Non-root user for security
RUN groupadd -r appgroup && useradd -r -g appgroup appuser

COPY --from=build /app .

# Switch to non-root
USER appuser

# Default port
ENV PORT=4000
EXPOSE 4000

# Health check
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:4000/health || exit 1

ENTRYPOINT ["dotnet", "CairaApi.dll"]
