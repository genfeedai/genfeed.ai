# @genfeedai/pricing

Single source of truth for product billing in genfeed.ai: provider costs,
credit costs, website plans, credit packs, margins, and pricing configuration.

To change a price, edit the tables and helpers in this package (especially
`provider-pricing.ts` and `plans-pricing.ts`). Other workspaces should import
`@genfeedai/pricing` instead of hard-coding rates.

## Use

This is a private workspace package (`"private": true` in `package.json`).
Depend on it from another workspace package with
`"@genfeedai/pricing": "workspace:*"`; it is not published to npm.

## Main modules

| Module | Role |
| --- | --- |
| `provider-pricing.ts` | Catalog of AI provider costs, model types, and UI option arrays |
| `plans-pricing.ts` | Credit value, credit costs, website plans, packs, and margin multipliers |
| `tier-entitlements.ts` | Per-tier API, seat, and org limits that match the marketed plans |
| `generation-credit-calculator.ts` | Shared quote and charge math for image and video generation credits |
| `model-billable-quote.ts` | Billable quotes from reviewed rates, pending drift, and live margins |
| `live-model-pricing.ts` | Customer-facing credits from raw provider USD plus live margin |
| `margin-conversions.ts` | Markup percent, margin percent, and sell/cost multiplier conversions |
| `agent-chat-margin.ts` | Process-scoped margin multiplier for agent chat (separate from generation) |
| `reviewed-provider-pricing.ts` | Lookup and quote helpers over operator-reviewed provider rates |
| `reviewed-rates/` | Reviewed rate sheet data, variant selectors, and sheet helpers |
| `reviewed-rate-hash.ts` | Pure SHA-256 hashing of normalized reviewed rates (browser-safe) |
| `model-pricing-attention.ts` | Admin attention signals for stale sync, drift, and free/active models |
| `model-pricing-export.ts` | CSV export of an admin model pricing report |
| `studio-generation-cost.ts` | Studio playground quote inputs (model, resolution, size helpers) |
| `crun-provider-credits.ts` | Normalize and convert provider credit receipts to USD |
| `decimal-pricing.ts` | Internal exact decimal multiply/sum/ceil helpers (not re-exported from `index.ts`) |

## Tests

From the repository root:

```bash
cd packages/pricing && bunx vitest run
```

Or via the package script: `bun run test` inside `packages/pricing`.

## Related packages

- `@genfeedai/contracts`
- `@genfeedai/helpers`

## License

MIT
