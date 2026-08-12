---
name: tdd first
description: Write failing tests before production code; keep tests deterministic and CPU-light locally
type: feedback
status: active
last_verified: 2026-08-12
topics: [testing, tdd, workflow, coverage, e2e]
---

**Rule:** For Genfeed.ai work, **TDD first**. Specify behavior with a failing automated test (or extend an existing one), then implement the minimal production change that makes it pass, then refactor under green tests. Prefer **deterministic** unit/integration tests that exercise real shipped functions over flaky full-stack E2E as the primary design tool.

**Why:** Vincent wants the repository culture and agent loops to design through tests so regressions are cheap to catch, coverage grows on purpose, and “looks right” implementations do not ship without executable proof. Full monorepo / multi-package suites and heavy Playwright runs stay **CI-gated** on developer MacBooks; TDD still applies by writing focused tests first and letting PR CI own the expensive suite.

**How to apply:**

1. **Red → green → refactor** for every bug fix, API contract change, query optimization, and new branch of behavior. Do not land production-only diffs without a new or updated test that would have failed before the fix.
2. **Determinism:** No real clocks without injection, no live network, no GPU/fleet, no order-dependent shared DB unless the test owns setup/teardown. Prefer pure helpers, Prisma mocks, and in-memory claim maps for concurrency semantics.
3. **Drive the real entry point:** Tests must call the shipped function/controller path. Do not re-implement the code under test inside the test or hard-code the expected value without going through production logic.
4. **Coverage growth is intentional:** When hardening launch blockers (webhooks, credits, bootstrap, migrations), add structural migration guards and service specs that lock the acceptance criteria, not only happy-path smoke.
5. **E2E expansion is CI-first:** Prefer adding hermetic `*.integration.spec.ts` / API E2E tier files that PR CI runs. On the laptop (restrictive local-verification machine), do **not** run full monorepo typecheck/test/build or broad Playwright unless Vincent explicitly asks for a **named** local check in the current conversation. See global `local_verification_scope` memory for machine identification.
6. **CPU hygiene:** Default verification is **scoped** (`bun test` on the changed package/file when allowed) or **PR CI**. Never “just run the full suite” to feel done.
7. **Memory vs skills:** This rule is project memory for all agents. Repo skills such as `verification-before-completion` and `testing-expert` still apply; they do not override TDD-first design order.
8. **Multi-agent handoff:** Tests are the shared language between Claude, Codex, and Grok. When another host will continue the work, leave **executable** coverage (unit/integration/hermetic launch-path contracts) so the next agent does not re-probe production with guesses. See `feedback_multi_agent_collaboration.md`.
9. **Agent + workflow surfaces:** Agent tool handlers, workflow executors, node claims, BullMQ processors, and batch credit paths are high-churn AI targets — every residual fix on those paths must extend the matching `*.spec.ts` or `launch-path-contracts.integration.spec.ts`.

**Done when:** The PR contains the failing-case test (or clearly extends one), the implementation, and no claim of “tested” without either a focused command result or PR CI evidence.
