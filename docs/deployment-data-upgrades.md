# Deployment data upgrades

Schema changes continue through Prisma migrations after the pre-migration snapshot.
A release must upgrade from the previous published stable release with synthetic
existing records before production deployment. Run on a disposable local PostgreSQL
server with the vector extension available:

```sh
UPGRADE_VERIFY_ADMIN_URL=postgresql://postgres@localhost/postgres \
  bun run packages/prisma/scripts/verify-release-upgrade.ts --from=vX.Y.Z
```

Use the previous published stable release tag, fetched from the release repository.
For local repeated-release verification, use `--from=HEAD` after committing the
candidate; this checks upgrading a baseline that already includes the new schema.
Release CI always supplies the previous published stable release tag.
The verifier fails on a missing tag, remote database host, migration error, data
preservation failure, or backfill regression. It creates a unique database and
drops only that database. It exercises real Prisma migration history from the
release, ownership relationships and credentials, then candidate migrations,
dry-run, rollback/retry, concurrent runners, concurrent token refresh, soft-deleted
secrets, durable completion, and rerunning migrations. It retains synthetic evidence
under `~/.codex/artifacts/`; it never reads production data.

## Credential encryption v1

Keep credential encryption **after all services reach steady state** with
encrypt-on-write code. The task retains its existing command and TLS configuration.
Never run against old writers or move it ahead of service rollout.

The `data_backfills` Prisma migration creates the completion ledger.
`credential-encryption-v1` is recorded in the same transaction as encrypted data.
No production completion is assumed. The first successful live run encrypts legacy
secrets, including soft-deleted credentials; later releases only check the ledger.
A missing ledger, missing key, failed query, lock timeout, or concurrent runner
fails the task. Retry after the competing task finishes or the database issue is
resolved. An interrupted task rolls back and PostgreSQL releases its locks.

The one-time transaction holds credential row locks until completion, preventing
refresh-token overwrites. Batches bound application memory, not transaction size.
Lock waits are bounded to five seconds, statements to two minutes, and idle
transactions to thirty seconds. For a deployment with unusually large credential
tables, measure the first run in staging before scheduling the production upgrade.
Do not mark completion manually or delete it to rotate keys. A future repair needs
a new version and explicit acceptance tests.

The workflow-cloning deployment task was retired because its implementation was
already an unconditional no-op. System workflows remain installed on demand.
The pre-migration snapshot and production rollback protections remain required.
