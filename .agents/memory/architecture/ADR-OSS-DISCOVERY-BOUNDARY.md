# ADR: OSS Discovery Boundary

## Status

Accepted · amended 2026-08-31 · extends `ADR-PLG-BOUNDARY-OSS-CLOUD.md`

## Decision

The genfeed.ai **homepage does not mention** the open-source repository or the Community
distribution. The repository is reachable from Genfeed-owned surfaces only through the
docs.genfeed.ai self-hosting page and a small footer link; the README links back to genfeed.ai.
Hosted SaaS usage and credit purchases are the commercial support path. The repository links
to pricing instead of publishing a donation or sponsorship call to action.

## Trade-off

The homepage sells the hosted product without a "free self-hosted" escape hatch in the funnel;
open-source discovery relies on GitHub, topics, docs, and announcements. Community adoption is
accepted as the slower channel in exchange for a clean SaaS conversion path. Financial support
converts through product usage, keeping one commercial story for contributors and customers.

## Guardrail

Revisit at Launch (`v1.0.0`), not before.
