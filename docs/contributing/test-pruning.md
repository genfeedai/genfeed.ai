# Conservative test pruning

Reduce duplicate checks without replacing behavioural assertions with code-coverage overlap. A coverage report records execution; it cannot prove that two assertions constrain the same result.

`prune-redundant-tests.ts` removes only a test whose entire body is `expect(fixture).toBeDefined()` when a retained sibling test immediately invokes a method on the same fixture and contains a nontrivial assertion. Both tests must share a suite with an unconditional `beforeEach` fixture assignment. Conditional, optional, skipped, parameterized, nested-suite, fixture-changing and lifecycle-assertion witnesses are rejected. Empty or invocation-only tests are retained because an unasserted call can still check that execution succeeds.

The rule excludes frontend, agent, workflow, worker, billing, tenant, authentication, model, pricing, provider/integration and media contracts. PostgreSQL and E2E files are excluded. These boundaries also keep ongoing product work outside the selection. Other tests need an explicit reviewed behavioural witness before removal; there is no package-wide deletion quota.

## Reproduce a selection

Use an immutable baseline commit. Planning reads tracked source from that Git tree, not mutable working files:

```sh
bun run scripts/architecture/prune-redundant-tests.ts \
  --base 472819143c21a78ce9647cc1168f2009cee81d0f \
  --manifest scripts/architecture/test-pruning-selection.json
```

Add `--write` to apply the recorded rule. It validates all selected input hashes before editing. Files already at the expected output are unchanged on a repeated application; other drift fails before any write. The manifest records the baseline, lockfile/parser/selector identities, source hashes, removed test lines, and retained witness names/lines.

Validate the checked-in result with the same baseline and manifest plus `--check`. This recomputes the selection and verifies every output hash. Code formatting that changes source or selector bytes requires regenerating the manifest from the baseline rather than editing hashes by hand.

The pure selector is tested by `scripts/architecture/prune-redundant-tests.test.ts`, collected by the existing executable-contract CI suite. Execute it with the repository's permitted verification host:

```sh
bun x vitest run --config scripts/architecture/vitest.config.ts \
  scripts/architecture/prune-redundant-tests.test.ts --maxWorkers=1
```

Run affected suites, relevant spec typechecks and before/after coverage after selection. Required CI and independent review apply to the exact final head. Static witnesses are intentionally narrow: they do not replace runtime checks, prove mutation kill-rate equality or authorize widening this rule to numerical, security, failure or idempotency assertions.
