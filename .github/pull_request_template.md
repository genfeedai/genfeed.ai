<!--
Title = squash commit subject. Use Conventional Commits: `type(scope): summary`
(feat, fix, docs, refactor, test, chore, build, ci, perf). Lowercase, imperative,
no trailing period, ≤ 72 chars. Add `!` for a breaking change.
Full contract: CONTRIBUTING.md → Pull-request contract.
-->

## Summary

<!-- What changed and what user, developer, or repository outcome does it produce? -->

## Related issue

<!-- Required for anything beyond a typo or docs-only fix. `Closes #123` when this PR fully resolves the work; `Refs #123` for context. If no issue exists, write `No-Issue` and one sentence why — the maintainer may ask you to open one before review. -->

## Scope

<!-- Boundaries, public contracts, migrations, generated files, intentionally excluded work. Aim for ≤ 400 changed lines excluding lockfiles/generated files; if larger, say why it could not be split. -->

## Verification

<!-- Focused commands you ran and their results (paste output for tests). State which broader checks are intentionally left to CI. Fork PRs: CI runs only after a maintainer applies `run-ci`, so this section is what unblocks review. -->

## Screenshots

<!-- Required for visible UI changes; otherwise write "Not applicable". -->

## AI involvement

<!-- Required. One of:
     - "None"
     - "<tool> drafted <what>; I reviewed/edited/verified <what>"  (e.g. "Claude Code drafted the implementation and tests; I reviewed the diff and ran the checks above")
     A named human (you) is accountable for this description and the verification. Undisclosed agent-authored PRs are closed. -->

## Checklist

- [ ] Every commit is signed off (`git commit -s`, DCO). No CLA is required.
- [ ] The title is a Conventional Commits subject and describes the whole squash.
- [ ] I reviewed the final diff for unrelated changes and it does not touch `ee/`.
- [ ] I ran the relevant focused checks or documented why they were left to CI.
- [ ] I updated relevant documentation or explained why no documentation change is needed.
- [ ] I documented migrations, release steps, or external configuration changes, or marked them not applicable. Breaking changes for self-hosters name their Upgrade note.
- [ ] I did not include secrets, credentials, personal data, customer data, or generated build output.
