---
name: judge calibration
description: Judge calibration (#4924): scoring-surface lock plus Calibration-Report CI gate; harness-criteria injection OFF until a measured κ gain
type: project
---

# Judge calibration (#4924)

**last_verified: 2026-10-03**

Status: pending live run (paid-call gate, Vincent 2026-10-03)

Method: [judge calibration README](../../scripts/content-eval/calibration/README.md).
The suite compares both production text judges against human golden labels,
with cross-family arms, rubric alignment and criteria-injection A/B.
Live agreement and injection outcomes remain pending; synthetic stub evidence
does not establish them.

## Injection rule

Harness-criteria injection is OFF: no production caller passes the optional
third argument to `scoreText`. The exact `INJECTION_RULE_TEXT` is:

```text
keep iff pooled decision kappa delta >= 0.05, pooled band rows < 30 or pooled band kappa delta >= 0, and every kind with >= 30 decision rows has decision kappa delta >= -0.05; insufficient when pooled decision rows < 30; otherwise drop; a null delta fails its condition
```

An enabling PR must cite the measured outcome and satisfy the surface gate.

## Auto-review rule

Candidates are production judges with pooled `scoredDecisionRows` ≥ 30 and
`decisionKappa` ≥ 0.6. No candidates gives null with
`no production judge reaches κ ≥ 0.6`. One candidate is selected with
`{profileId} is the only production judge with κ ≥ 0.6`. With two candidates
and |Δκ| < 0.02, select `content-quality` with
`tie within 0.02; content-quality stays the consumer`. Otherwise select the
higher decision κ with `{profileId} has the higher decision κ`.
This records the rule, not a measured recommendation or a consumer switch.

## Evidence gate

The committed scoring-surface lock must match the head text and vision digests.
Regenerate it with
`bun scripts/content-eval/calibration/scoring-surface.ts --write`.
A changed text surface requires a committed live summary measuring its head
text digest, linked in the PR body:

```text
Calibration-Report: scripts/content-eval/calibration/reports/{file}.json
```

The `Check judge calibration link` CI step rejects missing, invalid, stub or
stale summaries. Failed thresholds on an otherwise valid live summary produce
a warning. Bootstrap and unavailable-base runs pass after head-lock validation;
merge-group runs rely on member PR checks. Vision-only changes warn.
Re-run the job after a PR-body edit.

DB template edits are not Git-detected: re-run calibration after editing
`system.evaluation`, `prompt.evaluation.post` or `prompt.evaluation.article`.
Commit only summaries without row text or scores; keep full reports off-repo.

Vision calibration deferred to the #4926 media golden set

**Why:** a model, prompt, decoding or context change can alter agreement with
human decisions. The lock connects each text surface revision to measured
evidence, while the injection rule prevents enabling criteria without a
measured κ gain and checks for regressions by kind.

**How to apply:** follow the README's scales, sample floor and thresholds;
quote the intended fixtures before an approved live run. Keep injection OFF
until a later gated PR cites a measured keep outcome. Use the auto-review rule
as a recommendation and gate any later consumer change. Never put tenant data
or full reports in the public evidence record.
