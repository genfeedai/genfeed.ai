# API tracing

The API traces through Sentry (`@sentry/nestjs`), which is built on the
OpenTelemetry model. There is no second exporter.

## What produces spans

| Layer | Source |
|---|---|
| Incoming HTTP request (root span) | Sentry `Http` integration |
| Nest middleware, guards, interceptors, pipes, filters, route handlers | Sentry `Nest` integration |
| Prisma, Redis, outgoing `http`/`fetch` | Sentry integrations |
| Service methods | `@Traced()` from `@libs/tracing/traced` |
| Exported async functions | `traced(name, fn)` from `@libs/tracing/traced` |

Spans come from the definition, never from wrapping a call site:

```ts
@Traced()
@Injectable()
export class BrandsService {
  async findOne(id: string) { ... } // span "BrandsService.findOne"
}

export const loadBrandKit = traced('loadBrandKit', async (brandId: string) => {
  ...
});
```

`@Traced()` on a class spans every native `async` method (sync methods,
accessors and Nest lifecycle hooks are skipped). On a method it spans that
method. Use the method form on a class that Nest does not construct, so the
class keeps no constructor metadata.

`bun run check:traced-definitions` (part of `check:architecture`) enforces both
forms in `apps/server/api/src`. Exported async functions that predate the rule
are ratcheted in `scripts/architecture/traced-definitions.baseline.ts`; convert
a file and lower its entry.

## Request context on spans

Once auth resolves, `RequestContextMiddleware.hydrate` records the request
identity, and every span of that request that ends afterwards carries:

`genfeed.organization_id`, `genfeed.user_id`, `genfeed.brand_id`,
`genfeed.subscription_tier`, `genfeed.is_super_admin`

Every span also carries `genfeed.outcome` (`success` or `error`). Spans that
finished before auth (CORS, body parsing) carry only the outcome; join them
through the shared trace or segment id.

## Trace propagation

- **In:** a `sentry-trace` header is continued natively. A W3C `traceparent` is
  continued when no `sentry-trace` is present. Its sampled flag is ignored, so
  our own sample rate decides and callers cannot force spans into the quota.
- **Out:** outgoing requests carry `sentry-trace`, `baggage` and W3C
  `traceparent` (`propagateTraceparent` in `packages/libs/config/sentry.config.ts`).

Production samples 5% of requests (`PRODUCTION_TRACES_SAMPLE_RATE`); other
environments emit no spans.
