# Fal model contract synchronization

Genfeed synchronizes Fal model OpenAPI contracts and account-specific pricing
from the workers service every Sunday at 07:00 UTC. The job uses the workers
process `FAL_API_KEY`: Genfeed SaaS supplies its platform worker key; Community
operators may configure their own key in the deployment environment.

Synchronization is deliberately review-gated:

- new and changed endpoints are inactive while their candidate contract awaits
  operator review;
- unsupported schemas, currencies, conditional prices, and billing units are
  quarantined and cannot be approved;
- a failed synchronization records freshness failure state without replacing
  the last reviewed schema family or price;
- raw OpenAPI and commercial pricing snapshots stay in the private provider
  contract table and are not returned by model serializers.

## Immediate post-deployment synchronization

After deploying the migration and workers image, an infrastructure operator can
run the compiled one-shot command inside the workers container/task:

```bash
bun --filter @genfeedai/workers sync:fal-models
```

Run it in the same network and environment as the workers service, with
`DATABASE_URL` and `FAL_API_KEY` configured. The command requires an explicit
live flag internally, opens no HTTP listener, accepts no tenant or user input,
and exits non-zero if any endpoint fails. It logs aggregate counts only; it does
not print credentials, raw schemas, account pricing, or provider response
bodies.

Review candidate models through the existing protected model-registry operator
flow. Approval promotes only a supported pending contract and copies its
reviewed adapter family and billable mapping onto the model. Quarantined
contracts remain inactive until code adds an explicit supported mapping and a
subsequent synchronization produces a reviewable candidate.

The one-shot does not replace the weekly cron; it exists for the first run after
deployment or for an operator-controlled retry after correcting configuration.
