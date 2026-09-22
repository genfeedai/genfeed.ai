packages: @genfeedai/config @genfeedai/contracts @genfeedai/serializers

Type the content pattern analyzer's two enum labels (#4868).

- `@genfeedai/config`: adds `PATTERN_ANALYZER_DECISION_MODE`
  (`off` | `shadow` | `live`, default `off`) and `PATTERN_ANALYZER_MIN_CONFIDENCE`
  (default 0.85) to the AI schema and the env-config interface. Additive and
  optional: a deployment that sets neither keeps today's rule-based labels.
- `@genfeedai/contracts`: adds `ContentPatternLabels` and
  `TypedDecisionRolloutSettings`. `contentPatternExtractionItemSchema` drops
  `patternType` and `templateCategory` — the pattern analyzer's model answer is
  free text only now, and both labels come from a typed decision or the
  rule-based extractor. A consumer reading those two fields off the extraction
  schema has to read them off the decision instead.
- `@genfeedai/serializers`: `ContentPatternSerializer` gains an
  `isLowConfidence` attribute, true when neither an above-threshold decision nor
  a rule-based match produced a pattern's labels.
