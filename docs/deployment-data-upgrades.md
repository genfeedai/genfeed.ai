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
`credential-encryption-v1` is recorded only after every batch succeeds, in a final
transaction. No production completion is assumed. The first successful live run
encrypts legacy secrets, including soft-deleted credentials; later releases only
check the ledger. A missing ledger, missing key, failed query, lock timeout, or
concurrent runner fails the task.

Each bounded batch locks its credential rows, encrypts them, and commits before
the next batch starts. This protects concurrent token refreshes without holding
the entire table's row locks until completion. An interrupted or failed batch
rolls back; earlier committed batches remain encrypted. Retry scans again, skips
existing ciphertext without rewriting it, and encrypts only remaining plaintext.
The final ledger report describes the completing attempt, not cumulative retries.

A dedicated PostgreSQL session advisory lock excludes overlapping runners across
batch commits. The task unlocks on success, skip, and failure; connection closure
also releases the lock. Lock waits are bounded to five seconds, statements to two
minutes, and idle transactions to thirty seconds. The default batch size is 100
and the maximum is 5,000. Retain the pre-migration snapshot for broader recovery.
Do not mark completion manually or delete it to rotate keys. A future repair needs
a new version and explicit acceptance tests.

The workflow-cloning deployment task was retired because its implementation was
already an unconditional no-op. System workflows remain installed on demand.
The pre-migration snapshot and production rollback protections remain required.
