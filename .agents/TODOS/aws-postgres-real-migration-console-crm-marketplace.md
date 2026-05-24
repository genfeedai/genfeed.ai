# AWS/Postgres Real Migration TODO

- [ ] Capture the real migration sequencing and constraints in spec/decision artifacts
  Verify: `test -f .agents/SPECS/aws-postgres-real-migration-console-crm-marketplace.md && test -f .agents/TODOS/aws-postgres-real-migration-console-crm-marketplace.md && test -f .agents/DECISIONS/aws-postgres-real-migration-console-crm-marketplace.md`

- [ ] Migrate `marketplace` from Mongoose to Prisma/Postgres end to end
  Verify: `cd ../marketplace.genfeed.ai/apps/api && rtk bunx vitest run && rtk bun run typecheck`

- [ ] Migrate `crm` from Mongoose to Prisma/Postgres end to end
  Verify: `cd ../crm/apps/web && rtk bunx vitest run && rtk bun run build`

- [ ] Integrate real Prisma runtime into `console` and migrate the first complete collection slice
  Verify: `cd ../console/apps/server/api && rtk bunx vitest run <focused-slice-tests>`

- [ ] Summarize the remaining `console` collection backlog explicitly
  Verify: `rtk rg -n "@nestjs/mongoose|from 'mongoose'|from \"mongoose\"" ../console/apps/server/api/src -g '!**/*.spec.ts'`
