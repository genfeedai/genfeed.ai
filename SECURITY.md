# Security Policy

## Reporting a vulnerability

Do not report suspected vulnerabilities in a public issue, discussion, or pull
request.

**Preferred:** open a private report through GitHub's vulnerability reporting
form at
[github.com/genfeedai/genfeed.ai/security/advisories/new](https://github.com/genfeedai/genfeed.ai/security/advisories/new).
The report is visible only to you and the maintainer, and it becomes the draft
advisory that is published with the fix.

**Alternative:** email [support@genfeed.ai](mailto:support@genfeed.ai) with
`[SECURITY]` in the subject line.

Include:

- the affected component and deployment mode (SaaS, Community, or Desktop —
  see [CONTEXT.md](CONTEXT.md));
- a release tag, package version, or commit SHA;
- reproduction steps or a minimal proof of concept;
- the expected impact; and
- any known mitigations or workarounds.

Remove credentials, access tokens, personal data, and unrelated customer data
from the report. If sensitive test data is necessary, describe it first and wait
for a private handling method.

## What to expect

| Step                       | Commitment                                                                                                                                                                                                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Acknowledgement            | Within **72 hours** of receipt.                                                                                                                                                                                                                                  |
| Triage and severity        | Within 7 days: confirmed / not reproducible / not a vulnerability, with a CVSS-style severity.                                                                                                                                                                    |
| Fix or coordinated disclosure | Within **90 days** of acknowledgement. Critical issues in the hosted product are patched sooner. If a fix needs longer, we say so before day 90 and agree a new date with you.                                                                                 |
| Credit                     | Reporters are credited in the published advisory and release notes unless they ask not to be.                                                                                                                                                                    |

Genfeed does not run a paid bug-bounty program.

## Supported versions

Genfeed is `0.x` and under active development. Only the **latest release** on
`master` receives security fixes; there is no LTS branch. Self-hosters should
track the [latest Community release](https://github.com/genfeedai/genfeed.ai/releases/latest)
and read the release body's **Upgrade note** before updating. The hosted product
at app.genfeed.ai always runs a build at or ahead of the latest release.

## Scope

In scope:

- this repository's source, the Community release bundle and container image,
  the published `@genfeedai/*` packages, and the Desktop client;
- the hosted product surfaces `app.genfeed.ai`, `api.genfeed.ai`, and
  `mcp.genfeed.ai`.

Out of scope:

- vulnerabilities in third-party providers you configure with your own keys
  (report those to the provider);
- issues that require a compromised host, physical access, or a self-hoster
  running with the documented insecure defaults (`BETTER_AUTH_ENABLED=false`
  outside a trusted network);
- rate-limiting, best-practice, or scanner-only findings without demonstrated
  impact.

## Testing safely

Test against your own self-hosted Community instance or Desktop install. Do not
test against `app.genfeed.ai` in ways that could affect other users' data or
availability; if a finding can only be demonstrated there, describe it in the
report and we will reproduce it.

## Non-security defects

Ordinary bugs belong in the public
[bug report form](https://github.com/genfeedai/genfeed.ai/issues/new?template=bug.yml).
