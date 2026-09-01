# DESIGN.md matched evaluation

This directory contains the smallest repeatable test of whether Genfeed's
`DESIGN.md` improves an agent's first-attempt design output. It is deliberately a
manual generation and blind-review protocol. The tracked contract freezes the
scenario; it does not call a model, start an application, or add a CI provider
dependency.

## Frozen inputs

`scenarios/brand-os-review.json` owns:

- the reader, task, mock facts, and exact generation prompt;
- the desktop render viewport and required mobile behavior;
- the rule that guidance is the only changed variable;
- the metadata every run records; and
- the weighted rubric with observable 0/1/2 anchors and blocking failures.

Change the `scenarioVersion` whenever the prompt, mock inputs, viewport,
comparison policy, or rubric changes. Never rewrite an old run to a newer
scenario version.

## Matched run protocol

1. Choose one provider/model version and record its exact identifier.
2. Record the repository commit used as `guidanceCommitSha`.
3. Digest the frozen prompt and serialized `mockInputs`; use those exact values
   for both variants.
4. Generate the baseline in an empty standalone-HTML workspace without loading
   `DESIGN.md`.
5. Generate the candidate in an equivalent empty workspace, adding only
   `DESIGN.md` from the recorded commit to the model context.
6. Keep the first complete artifact from each variant. Do not reroll, repair, or
   steer either output.
7. Render both artifacts at the recorded viewport and at 390px width on the Mac
   Studio. Capture full-page screenshots with identical browser settings.
8. Rename and shuffle the pair so the reviewer cannot infer which variant used
   the guidance.
9. Score every rubric criterion from 0 to 2 and record every blocking failure.
   Preserve the raw notes; do not collapse them into a single preference.
10. Reveal the variants only after scoring. Route accepted corrections to the
    narrowest durable layer: `DESIGN.md` for judgment, shared tokens/primitives
    for mechanics, or deterministic checks for machine-detectable failures.

An individual comparison is diagnostic, not a reliability claim. Repeat
independent first attempts before reporting a rate, and keep later scenarios or
holdouts frozen while revising the guidance.

## Validation

`bun run design:check` validates the checked-in scenario alongside the existing
token and design-system contracts. The focused unit coverage lives in
`scripts/check-design-system.test.ts`.
