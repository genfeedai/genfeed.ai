packages: @genfeedai/harness @genfeedai/contracts

Add the `viral-psychology` content harness pack, exported from
`@genfeedai/harness` alongside the existing core, brand-fidelity, and
platform-x packs. It contributes demand, hook, retention, and conversion
directives to every composed brief, and publishes `PERSUASION_LAYERS` and
`PERSUASION_SCORE_KEYS` for consumers that need the rubric vocabulary.

`IEvaluationScores` gains an optional `persuasion` bucket keyed to those score
keys. It is optional, so stored evaluations written before the rubric existed
stay valid and no consumer has to change.
