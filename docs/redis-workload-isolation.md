# Redis Workload Isolation

> Design + capacity reference for [#1186](https://github.com/genfeedai/genfeed.ai/issues/1186)
> (part of the stack-audit remediation epic [#1176](https://github.com/genfeedai/genfeed.ai/issues/1176)).

## Why

The stack audit found **one Redis instance carrying four unrelated concerns**.
They have very different load shapes and availability needs, but shared a single
connection and command-processing thread, so a spike or flush on one could
silently degrade the others — a queue backlog could add latency to auth rate
limiting; a cache-invalidation storm could delay realtime agent streaming. That
correlation is surprising and hard to diagnose on call.

This change gives each workload an **isolated Redis client** with a
**config-driven connection target**, so load on one cannot contend for the same
connection/command throughput as the others, and prod can point any workload at a
dedicated instance later without a coordinated multi-service deploy.

## The four workloads

| Workload | Consumer | Traffic shape | Latency sensitivity | Persistence |
|---|---|---|---|---|
| **Queues** (`QUEUE`) | BullMQ across `api` / `workers` / `files` / `clips` | Bursty, high-volume during backlog processing; blocking BRPOPLPUSH long-polls | Tolerant (jobs are async) | **Must persist** — in-flight jobs |
| **HTTP cache** (`CACHE`) | `CacheClientService` + `RedisCacheInterceptor` / `CacheService` / `CacheInvalidationService` | Read-heavy `GET`, periodic `SCAN`+`UNLINK` tag-invalidation fan-out | Moderate (a slow cache falls back to origin) | Ephemeral — safe to flush |
| **Auth rate-limit** (`RATE_LIMIT`) | Better Auth `customStorage` (`ba:ratelimit:*`) | Low-volume, one `GET`+`SET` per authenticated request | **High** — sits on the hot auth path | Ephemeral — counters, TTL'd |
| **Socket.io fan-out** (`SOCKET`) | `RedisIoAdapter` (`@socket.io/redis-adapter`) | Pub/sub fan-out of realtime events incl. agent token streaming | **High** — user-visible realtime lag | None — pub/sub only |

> **Not in scope here:** the shared application pub/sub bus (integration events,
> websocket delivery — `RedisService`, `MicroservicesService`,
> `notifications.service.ts`, `files` websocket publisher). Its publisher/
> subscriber pairing is matched across services, so it stays on the base
> connection (`RedisWorkload.DEFAULT`, logical DB 0). It is a coherent fifth
> concern that can be split out later if it becomes a contention source.

## Isolation mechanism chosen

Two levers, per workload, resolved through `ConfigService`:

1. **Logical database index** (default) — each workload gets a distinct Redis
   logical DB on the shared base `REDIS_URL`. Cheap, zero new infrastructure,
   and it prevents key-namespace collisions and eviction cross-talk. It does
   **not** fully isolate command-processing throughput (logical DBs share the
   single Redis thread), so it is the *baseline*, not the end state for the
   highest-volume workload.
2. **Dedicated instance/endpoint** (opt-in) — set `REDIS_<WORKLOAD>_URL` to point
   a workload at its own Redis instance/cluster. This is the real throughput
   isolation and is the recommended production target for **queues** (the bursty,
   high-volume workload most able to starve the shared thread).

### Default logical DB assignment

| Workload | Default DB | Rationale |
|---|---|---|
| `DEFAULT` (pub/sub bus) | 0 | Unchanged — matched publishers/subscribers already expect DB 0. |
| `QUEUE` | 0 | Stays on DB 0 so **in-flight jobs are preserved** and every queue-touching service agrees on the namespace with no coordination. Strongest candidate for a *dedicated instance* in prod. |
| `CACHE` | 1 | Ephemeral; moving to its own DB isolates SCAN/UNLINK fan-out. Repopulates on miss. |
| `RATE_LIMIT` | 2 | Off the cache DB so an invalidation storm can't add latency to the auth path. Counters simply reset. |
| `SOCKET` | 3 | Pub/sub only, no persisted state; its own DB keeps fan-out channels clear. |

## Configuration

All overrides are **optional** and fall back to the base `REDIS_URL` / a
per-workload default DB, so isolation rolls out **without a coordinated
multi-service deploy**. Defined in `packages/config/src/schemas/redis.schema.ts`,
resolved by `parseRedisConnectionForWorkload()` in
`packages/libs/redis/redis-connection.utils.ts`.

| Env var | Effect |
|---|---|
| `REDIS_URL`, `REDIS_PASSWORD`, `REDIS_TLS` | Shared base connection (also the pub/sub bus). |
| `REDIS_QUEUE_URL`, `REDIS_QUEUE_DB` | BullMQ queue endpoint / logical DB. |
| `REDIS_CACHE_URL`, `REDIS_CACHE_DB` | HTTP cache endpoint / logical DB. |
| `REDIS_RATELIMIT_URL`, `REDIS_RATELIMIT_DB` | Auth rate-limit endpoint / logical DB. |
| `REDIS_SOCKET_URL`, `REDIS_SOCKET_DB` | Socket.io fan-out endpoint / logical DB. |

Password and TLS always fall back to the base config when a per-workload URL
omits them, so a single injected `REDIS_PASSWORD` secret still covers every
workload.

## Rollout

Because every override falls back to the base config, services can be deployed in
any order:

1. **Deploy code (this PR).** No env changes → every workload stays on the base
   `REDIS_URL`, now on its **default logical DB**. Queues stay on DB 0
   (in-flight jobs preserved); cache/rate-limit/socket move to their own DBs
   (cache repopulates, rate-limit counters reset, socket has no state). No
   coordinated cutover required.
2. **Isolate the highest-volume workload first.** When capacity data justifies
   it, set `REDIS_QUEUE_URL` to a dedicated instance and roll the queue-touching
   services (`api`, `workers`, `files`, `clips`) — they must share the same queue
   endpoint to see each other's queues, so roll them together or via a brief
   drain.
3. **Isolate others as needed** by setting the remaining `REDIS_<WORKLOAD>_URL`
   values; each is independent and single-service (cache/rate-limit are `api`,
   socket is `notifications`).

## Failure containment

- Each workload uses its **own client**, so an outage/reconnect-storm on one
  cannot exhaust or block the connection shared by the others.
- **Better Auth rate limiting keeps its deliberate fail-open behavior**: the
  store gates on `RateLimitClientService.isReady` and swallows errors, so if the
  rate-limit Redis resource is unavailable, authentication requests are allowed
  through rather than blocked. Moving rate limiting off the cache client does not
  change this — the fail-open gate moved with it.

## Verification

- Unit: `packages/libs/redis/redis-connection.utils.spec.ts` (workload → DB /
  endpoint resolution, `db` inclusion in ioredis + BullMQ options),
  `apps/server/api/.../cache-client.service.spec.ts`, and
  `apps/server/api/.../rate-limit-client.service.spec.ts` (rate limit resolves
  its own workload, not the cache one; exposes `isReady` for fail-open gating).
- Load isolation and fail-open fault tests (Phase 3 of the PRD) are operational
  checks to run against a staging-like environment with per-workload `*_URL`
  overrides pointed at distinct instances.
