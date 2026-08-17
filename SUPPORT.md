# Support

Genfeed support runs on GitHub. There is no Discord, Slack, or forum for the
open-source project; keeping one channel keeps answers searchable and lets
agents and maintainers work from the same record.

## Where to go

| I want to…                                        | Go to                                                                                                                  |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Ask how something works, or how to self-host      | [GitHub Discussions → Q&A](https://github.com/genfeedai/genfeed.ai/discussions/categories/q-a)                          |
| Share an idea before it is concrete enough for an issue | [GitHub Discussions → Ideas](https://github.com/genfeedai/genfeed.ai/discussions/categories/ideas)                |
| Report a reproducible defect                      | [Bug report](https://github.com/genfeedai/genfeed.ai/issues/new?template=bug.yml)                                      |
| Request a feature or change                       | [Feature request](https://github.com/genfeedai/genfeed.ai/issues/new?template=feature.yml)                             |
| Report a security vulnerability                   | [SECURITY.md](SECURITY.md) — private reporting only, never a public issue                                              |
| Get help with the hosted product (app.genfeed.ai) | [support@genfeed.ai](mailto:support@genfeed.ai) — hosted-account questions are handled outside this repository         |
| Read product and API documentation                | [docs.genfeed.ai](https://docs.genfeed.ai)                                                                             |
| Read contributor and self-hosting documentation   | [`docs/`](docs/) in this repository — start with [self-hosting](docs/self-hosting.md) and [contributing](CONTRIBUTING.md) |

Every issue form requires EARS acceptance criteria
(`WHEN … THE SYSTEM SHALL …`). If you are not sure how to phrase them, write
your best attempt — triage rewrites weak criteria; it never closes an issue for
syntax. See [CONTRIBUTING.md → Opening an issue](CONTRIBUTING.md#opening-an-issue).

## What to expect

- **Triage within 7 days** of opening an issue: the maintainer or a triage agent
  confirms or rewrites the acceptance criteria, labels it, and places it on the
  [project board](https://github.com/orgs/genfeedai/projects/12).
- **No SLA on fixes.** Genfeed is maintained by a solo maintainer with an AI
  review pipeline (see [GOVERNANCE.md](GOVERNANCE.md)). Issues labelled
  `good first issue` or `help wanted` are the fastest way to get something
  fixed — open a PR.
- **Security reports** are acknowledged within 72 hours; see
  [SECURITY.md](SECURITY.md).

## Before you post

- Search [open and closed issues](https://github.com/genfeedai/genfeed.ai/issues?q=is%3Aissue)
  and [discussions](https://github.com/genfeedai/genfeed.ai/discussions).
- Include the release tag or commit SHA, deployment mode (SaaS, Community, or
  Desktop — see [CONTEXT.md](CONTEXT.md)), and operating system.
- Remove credentials, tokens, personal data, and customer data from logs and
  screenshots.
