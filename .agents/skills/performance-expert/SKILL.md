---
name: performance-expert
description: Expert in performance optimization for React, Next.js, NestJS applications covering frontend rendering, API response times, database queries, and infrastructure optimization. Use when optimizing React components or Next.js pages, improving API response times, optimizing database queries, analyzing bundle sizes, or implementing caching.
metadata:
  version: "1.0.0"
  tags: "performance, optimization, fullstack"
---

# Performance Expert Skill

## When to Use

- Optimizing React components or Next.js pages
- Improving API response times
- Optimizing database queries
- Analyzing bundle sizes
- Implementing caching strategies
- Optimizing images or assets
- Configuring CDN or caching
- Reviewing Core Web Vitals

## Project Context Discovery

1. Check `.agents/memory/` for performance architecture context (e.g., `repo_frontend_design_execution.md`, any `*performance*` or `*architecture*` files)
2. Identify performance tools (Lighthouse CI, APM)
3. Review existing optimizations and caching strategies
4. Check for `[project]-performance-expert` skill

## Core Performance Principles

### Frontend (React/Next.js)

**Bundle Optimization:** Code splitting, dynamic imports, tree shaking, remove unused deps

**React Optimization:** useMemo, useCallback, React.memo, virtualization, lazy loading

**Next.js:** Server Components, SSG, ISR, next/image, font optimization

**Assets:** WebP images, font subset, CSS minify, Gzip/Brotli

### Backend (NestJS)

**API Response Times:** Target < 200ms (p95), caching, background jobs, connection pooling

**Query Optimization:** Indexes, `select`/`include` narrowing, cursor pagination, no N+1 relation loads

### Database (PostgreSQL / Prisma)

**Indexes:** `@@index` on hot filters; compound indexes lead with `organizationId` for tenant-scoped reads; monitor usage

**Queries:** Filter in the database not in JS, `select` only the columns you use, sort on an indexed column, batch relation loads to avoid N+1

### Infrastructure (AWS)

**CDN:** CloudFront caching, cache headers, edge optimization

**Lambda:** Cold start optimization, memory allocation, provisioned concurrency

## Performance Metrics

### Frontend (Core Web Vitals)

- **LCP:** < 2.5s
- **FID:** < 100ms
- **CLS:** < 0.1
- **FCP:** < 1.8s

### Backend

- **API p50:** < 100ms
- **API p95:** < 200ms
- **DB Query p95:** < 50ms
- **Error Rate:** < 0.1%

## Quick Checklist

### Frontend

- [ ] Bundle size < 200KB initial
- [ ] Code splitting implemented
- [ ] Images optimized and lazy loaded
- [ ] React components memoized

### Backend

- [ ] Database queries optimized
- [ ] Indexes created and used
- [ ] Caching implemented
- [ ] Background jobs for heavy operations

---

**For complete React memoization patterns, Next.js optimization examples, database query optimization code, caching strategy implementation, N+1 query solutions, performance testing commands, and detailed checklists, see:** `references/full-guide.md`
