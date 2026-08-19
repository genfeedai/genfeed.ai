# ADR: CLA — FSFE Fiduciary License Agreement 2.1 via CLA Assistant

## Status

Accepted · 2026-08-18 · supersedes `ADR-DCO-NOT-CLA` (accepted 2026-08-16, DCO sign-off, no
CLA). Renamed in place so the file history carries both decisions.

## Decision

Contributions are accepted under a Contributor License Agreement based on the FSFE
**Fiduciary License Agreement 2.1**: [`ICLA.md`](../../../ICLA.md) for individuals,
[`CCLA.md`](../../../CCLA.md) for companies and other legal entities. Beneficiary is
Genfeed AI, Inc. A contributor signs **once per GitHub account** through the hosted CLA Assistant
app; its `license/cla` status check is required on `master`. The DCO app and its required check are
removed. `git commit -s` remains a harmless habit but is not required.

## Rationale

- **Relicensing freedom for a solo-maintainer OSS company.** The FLA grants Genfeed AI, Inc. an
  exclusive licence with the right to sublicense, so the company can relicense the tree, offer
  dual/commercial terms, or move to a successor licence without re-collecting consent.
- **The FLA is the balanced form of that power.** Contributors get a full licence back, moral
  rights stay with the author, and the company is bound to keep a Free Software / Open Source
  version of the Material available (AGPL-3.0-or-later today). Contributors may terminate if
  that obligation is broken.
- **No per-commit ceremony.** One click on the first PR replaces a `Signed-off-by:` trailer on
  every commit and the rebase-and-force-push loop when one is missing.

## Agent-account exemption

Commits authored by the maintainer's coding agents are exempt from `license/cla` via CLA
Assistant's per-repository allowlist ("Specify usernames and source organizations to be exempt
from signing the CLA"), not by signing on their behalf. The exempt logins are:

```
claude,cursoragent,chatgpt-codex-connector[bot]
```

They are agents acting under the maintainer's direction, so the Recorded fact below still holds —
the copyright is the maintainer's, and there is no third party whose consent the FLA needs.

Two traps when editing that field:

- **No spaces after the commas.** CLA Assistant splits the value on `,` without trimming, so
  ` claude` never matches and the check stays `pending — Contributor License Agreement is not
  signed yet.`
- **`codex` is not the Codex agent.** It is an unrelated personal GitHub account that happens to
  be named "Codex"; allowlisting it would exempt a third party. Codex CLI commits under the
  maintainer's own git identity and needs no entry — only Codex Cloud pushes as
  `chatgpt-codex-connector[bot]`.

The allowlist is evaluated when a `pull_request` `opened` / `synchronize` / `reopened` webhook
arrives. Existing PRs keep their stale status until one is redelivered or "Recheck PRs" is run
from the CLA Assistant dashboard.

## Recorded fact

At decision time the repository had **zero external contributors**; every commit on `master`
was authored by the maintainer or by agents under the maintainer's direction. No past-contributor
consent was needed, which is why the DCO ADR's guardrail ("introducing a CLA after external
contributions have landed would require every past contributor's consent") did not bind.

## Guardrail

Changing the CLA text, the beneficiary, or the outbound-licence obligation after external
contributions have been accepted requires the consent of every affected contributor — decide
once, here. Contributor PRs still may not modify `ee/`; that tree stays maintainer-only via
CODEOWNERS and review.
