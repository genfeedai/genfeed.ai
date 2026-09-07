---
name: docker-expert
description: Expert in Docker, docker-compose, Dockerfile patterns, and container orchestration for NestJS and Next.js applications. Use this skill when users need Docker setup, containerization, or docker-compose configuration.
metadata:
  version: "1.0.0"
  tags: "docker, containers, infrastructure"
---

# Docker Expert

## When to Use

- Dockerfile creation for NestJS/Next.js
- docker-compose configuration
- Container networking and volumes
- Multi-stage builds optimization
- Health checks and restart policies
- PostgreSQL/Redis container setup

## Dockerfile Best Practices

### NestJS Multi-Stage Build

```dockerfile
FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package*.json ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3001
CMD ["node", "dist/main.js"]
```

### Next.js Dockerfile

```dockerfile
FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package*.json ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
EXPOSE 3000
CMD ["npm", "start"]
```

## Docker Compose Patterns

### Development Setup

- Use volumes for live reload
- Mount source code
- Set restart: unless-stopped
- Configure networks

### Production Setup

- Use named volumes for persistence
- Set restart policies
- Configure health checks
- Use secrets management

### PostgreSQL with Docker Compose

Persistence is PostgreSQL with the `vector` extension — match `docker/local/docker-compose.yml`:

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg17
    container_name: genfeed-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: genfeed
      POSTGRES_USER: genfeed
      POSTGRES_PASSWORD: genfeed_local
    ports:
      - "5432:5432"
    volumes:
      - genfeed_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U genfeed"]
      interval: 5s
      timeout: 3s
      retries: 5
```

## Health Checks

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

## Best Practices

- Use multi-stage builds to reduce image size
- Leverage layer caching
- Use .dockerignore
- Set appropriate restart policies
- Use health checks for containers
- Mount volumes for persistent data
- Use networks for service isolation
