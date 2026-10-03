# Owner merging and CI runner demand

The controller automatically squash-merges ready PRs authored by the pinned owner
account (GitHub user ID `1998775`) in `genfeedai/genfeed.ai` (repository ID
`1201383909`). It does not qualify outside contributors, team members, bots,
forks or triggering actors. GitHub's repository-wide auto-merge switch alone
does not enforce an author allowlist; this controller supplies that restriction.

The controller runs in strict mode only. It is inactive until the Genfeed bot
GitHub App secrets exist (see below). GitHub's native merge queue stays unused
until Socket, CLA and PR title validation report authentic results for real
combined merge-group commits.
CI validates merge groups at the full tier until member escalation is authenticated, but that alone
does not make these external integrations queue-compatible.

## Admission and current-master safety

All four required contexts must explicitly succeed at the exact current head:
Tests Gate and PR Title from their actual GitHub Actions workflows, Socket
Security: Project Report from Socket, and license/cla from the existing CLA
status publisher. The controller checks newer reruns, pending checks, optional
failures and status/check name collisions. It paginates reviews, requests,
threads, checks, statuses and runs; old green results cannot mask a rerun.
The controller's own workflow and authenticated check suites are operational
metadata, excluded from optional-check readiness so it cannot block itself.
The exclusion only covers trusted base/default-branch events; a PR-executed
workflow at that path is still subject to validation. GitHub's `unstable`
aggregate state is permitted only after the explicit checks/reviews gate passes.
Required contexts, unrelated checks and commit statuses remain enforced.

Drafts, requested reviewers, changes requests, pending reviews and unresolved
threads (including outdated ones) block admission. Add `hold-merge` while an
ordinary PR comment or chat has work outstanding: those conversations have no
machine-readable resolution state. The controller cannot inspect Codex chat
state. Remove the label when the follow-up is complete. A later comment does
not clear an earlier changes request; a decisive approval or dismissal does.

A separate active ruleset protects exactly `refs/heads/master` with all four
required checks, strict latest-base validation, review/thread protections and
an empty bypass list. The controller verifies that rule before each mutation.
Existing rulesets remain in place. This stronger rule also applies to manual
merges, including administrators: strict safety must survive a master update
between the controller's read and merge request.

Otherwise green PRs behind master receive one normal branch update with
`expected_head_sha`, then wait for fresh CI. Up-to-date PRs are read again and
merged with the expected head SHA. Each serialized sweep makes at most one
update or merge. A current-base PR with active CI pauses further branch updates.
Conflicts, changed heads, API failures or missing configuration
leave the PR open. Workflow-completion, external status/check and PR metadata events trigger sweeps;
the ten-minute schedule reconciles delayed external checks and thread changes.
Before admission, the controller cleans up at most five verified obsolete
owner PR CI runs. It re-reads head identity and run associations and preserves
any run still needed by another open PR. Ordinary cancellation handles queued
runs; force cancellation handles obsolete running runs or cancelled workers
with a stranded queued Tests Gate. Push, merge-group, release, dispatch and
scheduled runs are never cancelled. Current-head gates remain unchanged.

GitHub schedules may be delayed, so ten minutes is not a merge latency promise.
GitHub also suppresses some `check_run` triggers when the head is associated
with Actions; the scheduled reconciliation remains necessary for those events.

The workflow always checks out trusted master with persisted credentials off.
It executes no PR code or artifacts and does not interpolate PR text into shell
commands. It authenticates as the Genfeed bot GitHub App through
`actions/create-github-app-token`, which mints a short-lived installation token
scoped to this repository with: Actions write (cancel and force-cancel),
Administration read (complete ruleset reads, including bypass actors), Checks
read, Contents write (branch updates and merges), Pull requests write, Commit
statuses read and Workflows write (branch updates that carry workflow changes
from master). App-token updates and merges emit ordinary PR and push events. No
GITHUB_TOKEN fallback is allowed, because GITHUB_TOKEN would suppress the
required follow-up validation. Without both secrets the job does nothing; an
invalid or under-permissioned App fails closed.

The strict ruleset ID is pinned as `STRICT_RULESET_ID` in
`scripts/ci/owner-merge-queue.mjs`, next to the pinned repository and owner IDs.
Before each mutation the controller verifies that rule's full contents.

## Activation and rollback

1. Create a GitHub App owned by `genfeedai` with webhooks off and the repository
   permissions listed above. Install it on `genfeedai/genfeed.ai` only.
2. Add repository secrets `GENFEED_BOT_CLIENT_ID` (the App's client ID) and
   `GENFEED_BOT_PRIVATE_KEY` (a generated private key, PEM).
3. Dispatch `owner-merge-queue.yml` and inspect the run.
4. Observe a real branch update, fresh exact-head required checks, merge, and
   native master Full Suite/Master SHA Verdict before declaring rollout verified.

Pause one PR with the `hold-merge` label. To stop all automatic mutations,
disable the workflow (`gh workflow disable owner-merge-queue.yml`) or suspend
the App installation. If the ruleset is recreated, update `STRICT_RULESET_ID`
from `scripts/ci/owner-merge-ruleset.json`'s new rule. Keep the stricter rule
unless intentionally reverting the protection policy; removing it restores the
earlier administrator-bypass and stale-base behavior. Do not enable native
queue mode or replace external checks with synthetic successes.

## Timing evidence and limits

Issue [#5862](https://github.com/genfeedai/genfeed.ai/issues/5862) records the
baseline and prepared contract. Successful run `37011720498` took 88 minutes;
some spec jobs waited 48–64 minutes for a runner before executing. Increasing
parallel shard count would add runner pressure. Three deterministic weighted
spec pools instead replace up to seven independently queued jobs, preserving
every selected workspace and fresh compiler processes with all failure
collection. Cold observed workspace costs balance approximately 22–25 minutes
of checking per full pool; setup, queueing and other jobs remain additional.
The 40-minute pool timeout includes setup and is not an end-to-end target.

Master still needs its own verdict: individually green PRs can interact, and
the master/release graph exercises additional behavior. Releases continue to
require evidence for the exact release SHA. No deployment gate was removed.

The under-50-minute goal requires measured post-change runs. Record queue and
execution separately and compare distinct latest PR heads. Existing stricter
median/p95 budgets and their minimum 50 successful heads stay unchanged. The
initial 20 successful heads are insufficient for a compliance verdict; source
topology cannot establish the achieved latency.
