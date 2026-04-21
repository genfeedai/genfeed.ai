# AWS/Postgres Prep TODO

- [ ] Add durable spec/decision artifacts for the three-repo prep pass
  Verify: `test -f .agents/SPECS/aws-postgres-prep-console-crm-marketplace.md && test -f .agents/TODOS/aws-postgres-prep-console-crm-marketplace.md && test -f .agents/DECISIONS/aws-postgres-prep-console-crm-marketplace.md`

- [ ] Patch `console` env/config/docs to target AWS Postgres and isolate legacy Mongo runtime
  Verify: `rtk bunx vitest run apps/server/api/src/config/config.service.spec.ts apps/server/api/src/services/preflight/preflight.service.spec.ts`

- [ ] Patch `crm` env/docs/runtime helpers to target AWS Postgres and isolate legacy Mongo runtime
  Verify: `rtk bunx vitest run apps/web/src/lib/db/legacy-mongo.test.ts`

- [ ] Patch `marketplace` env/config/docs/scripts to target AWS Postgres and isolate legacy Mongo runtime
  Verify: `rtk bunx vitest run apps/api/src/config/config.service.spec.ts`

- [ ] Run focused formatting/lint verification on touched files
  Verify: `rtk bunx biome check <touched-files>`
