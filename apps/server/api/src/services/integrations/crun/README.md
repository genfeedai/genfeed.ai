# Crun images

Supported model keys are `crun/google/nano-banana-pro` and
`crun/bytedance/seedream-4-5`. One provider task produces one ingredient;
requests support one to four outputs. Video dispatch is not enabled.

## Configuration and review

Admission defaults to disabled (`CRUN_ENABLED=false`). The deployment gate is
independent of reviewed database model activation. Hosted requests require
`CRUN_API_KEY`, an explicit positive decimal `CRUN_CREDITS_PER_USD`, and a
nonempty `CRUN_RATE_VERSION`. There is no inferred dollar conversion. An eligible
organization Crun key uses BYOK accounting without a customer credit debit or
platform acquisition rate.

Run the model importer in dry-run mode first:

```sh
bun apps/server/api/scripts/import-crun-models.ts
```

Review the captured request contract and dated pricing evidence. Applying the
import creates candidates; it does not approve contracts or activate models.
Use the existing operator contract review flow before activating either model.
A pending or stale contract blocks new admission. Schema or tariff changes require
review and a new quote; they never reinterpret accepted tasks.

## Quote and generation

Authenticated `POST /images/crun-quote` prepares the effective prompt and references
without automatic paid enhancement or credit reservation. It estimates the exact
normalized provider input on the selected account and accepts only a fixed
`estimated:false` price matching the reviewed tariff. The public quote reports
the total customer credit amount; BYOK reports zero while retaining its internal
usage receipt. Provider rates, credential identities and effective prompts are
excluded from the public quote serializer.

Quotes expire after 60 seconds. Studio sends the opaque quote ID with generation.
Generation binds every output to frozen funding and persists every task before
the first provider create. Changed input, scope, contract, account or acquisition
rate requires another quote. A matching durable retry returns all existing output
IDs, including after Redis quote expiry, without another provider request.

Seedream references require authorized image ingredients with nondeleted metadata,
known dimensions and file size. Asset/video references and missing facts are
rejected before estimation. Prompt provenance must match the authorized stored
original/enhanced prompt when generation supplies a distinct original.

## Reconciliation and recovery

The shared worker runs every 30 seconds. It claims at most four tasks, renews
leases during work, and fences phase writes by the claimed ownership epoch.
Disabling admission or deactivating models leaves accepted-task reconciliation
mounted. Accepted BYOK tasks may drain using the retained original key even after
new-use entitlement or enablement changes. A changed or deleted key requires
operator recovery; hosted fallback is never used for an accepted BYOK task.

Only authenticated task-info receipts authorize final accounting. Temporary
provider media URLs remain ephemeral. Owned image storage and observed vendor
expense progress independently; copying retries after 1, 5 and 15 minutes, and
ledger or billing acknowledgements retry after 30 seconds. Queue acceptance alone
is not a completed billing marker. The stored quote fixes conversion and customer
allocation, while actual provider credits determine the observed vendor expense.

Inspect the scoped durable task and its redacted recovery code when a phase cannot
complete. Retry task-info, owned-media persistence or ledger acknowledgement for
the **same provider task ID**. Never retry CreateTask after timeout, missing task
ID, malformed acceptance, transport failure or an ambiguous response. Preserve
holds and usage intent when acceptance or cost evidence is unresolved. Local
cancellation is intent only; it does not prove provider failure.

Missing final credits, conflicting terminal proof or a successful fixed-price
mismatch disables the model and raises a redacted review alert while preserving
completed media and unresolved funding. Failed-task expense above the quote is
recorded and alerted without a customer surcharge. A definitive unaccepted
refusal releases funding without inventing vendor expense.

Rollback by disabling admission. Retain the additive task table, original account
access and reconciliation until all accepted work drains. Do not delete task or
billing evidence to clear a blocked generation.

## Fixture verification

API fixtures require explicit disposable loopback services:
`WORKFLOW_BILLING_TEST_DATABASE_URL` and `CRUN_TEST_REDIS_URL`. They use random
schemas/account fingerprints and clean up their own data. There is no production
URL fallback or live provider call. Run tests and typechecks on the configured
verification host. Live funded canaries, activation, migration deployment and
production smoke checks require their separate delivery authorization.

Terminal reconciliation keeps separate `nextMediaAttemptAt` and
`nextAccountingAttemptAt` deadlines. Expense retries after 30 seconds; failed
media copies retry after 60, 300 and 900 seconds before requiring operator
recovery. A blocked phase preserves the other phase's deadline. Workers claim at
most four rows, renew the same ownership epoch every 20 seconds and abort further
effects permanently if renewal fails. Local admission rejection or a saturated
request gate persists proven-unsubmitted disposition; replay does not dispatch it
again. Ambiguous acceptance retains funding and requires recovery.
