import type {
  BrandArtifactValidationReportV1,
  BrandGenerationArtifactV1,
  BrandIdentitySnapshotV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';

export function countBrandValidationRules(
  snapshot: BrandIdentitySnapshotV1,
): number {
  const rules = snapshot.generationRules;
  return (
    rules.facts.length +
    rules.palette.length +
    rules.typography.length +
    rules.mandatory.length +
    rules.avoid.length +
    rules.assets.length
  );
}
export function assertBrandValidationRuleDomain(
  snapshot: BrandIdentitySnapshotV1,
): void {
  if (countBrandValidationRules(snapshot) > 255)
    throw new TypeError('brand_validation_invalid_input');
  const rules = snapshot.generationRules;
  for (const group of [
    rules.facts,
    rules.palette,
    rules.typography,
    rules.mandatory,
    rules.avoid,
    rules.assets,
  ])
    for (const rule of group)
      if (rule.id.startsWith('system:'))
        throw new TypeError('brand_validation_invalid_input');
}
const normalize = (text: string) =>
  text.replaceAll('\r\n', '\n').normalize('NFC');
export function buildBrandValidationChecks(
  snapshot: BrandIdentitySnapshotV1,
  mediaKind: BrandGenerationArtifactV1['mediaKind'],
  text: string | null,
  completeText: boolean,
): BrandArtifactValidationReportV1['checks'] {
  const checks: BrandArtifactValidationReportV1['checks'] = [];
  function append(
    ruleId: string,
    evidenceIds: string[],
    required: boolean,
    appliesTo: BrandGenerationArtifactV1['mediaKind'][] | undefined,
    category: BrandArtifactValidationReportV1['checks'][number]['category'],
    result: BrandArtifactValidationReportV1['checks'][number]['result'],
    reasonCode: string | undefined,
    method: BrandArtifactValidationReportV1['checks'][number]['method'] = 'capability',
  ): void {
    const excluded = appliesTo !== undefined && !appliesTo.includes(mediaKind);
    checks.push({
      ruleId,
      category,
      severity: required ? 'hard' : 'soft',
      result: excluded ? 'not_applicable' : result,
      method: excluded ? 'capability' : method,
      evidenceIds: [...evidenceIds],
      ...(excluded || reasonCode !== undefined
        ? { reasonCode: excluded ? 'rule_media_not_applicable' : reasonCode }
        : {}),
    });
  }
  const rules = snapshot.generationRules;
  for (const rule of rules.facts)
    append(
      rule.id,
      rule.evidenceIds,
      rule.required,
      rule.appliesToMediaKinds,
      'fact',
      'unknown',
      'fact_grounding_unavailable',
    );
  for (const rule of rules.palette)
    append(
      rule.id,
      rule.evidenceIds,
      rule.required,
      rule.appliesToMediaKinds,
      'palette',
      'unsupported',
      'exact_palette_unavailable',
    );
  for (const rule of rules.typography)
    append(
      rule.id,
      rule.evidenceIds,
      rule.required,
      rule.appliesToMediaKinds,
      'typography',
      'unsupported',
      'exact_font_unavailable',
    );
  for (const category of ['mandatory_rule', 'avoid_rule'] as const) {
    for (const rule of category === 'mandatory_rule'
      ? rules.mandatory
      : rules.avoid) {
      const literal = normalize(rule.text);
      if (rule.match === 'semantic')
        append(
          rule.id,
          rule.evidenceIds,
          rule.required,
          rule.appliesToMediaKinds,
          category,
          'unknown',
          'semantic_validation_unavailable',
        );
      else if (literal.trim().length === 0)
        append(
          rule.id,
          rule.evidenceIds,
          rule.required,
          rule.appliesToMediaKinds,
          category,
          'unknown',
          'empty_literal_rule',
        );
      else if (mediaKind !== 'text' || text === null || !completeText)
        append(
          rule.id,
          rule.evidenceIds,
          rule.required,
          rule.appliesToMediaKinds,
          category,
          'unknown',
          'text_coverage_incomplete',
        );
      else {
        const present = normalize(text).includes(literal);
        const passed = category === 'mandatory_rule' ? present : !present;
        append(
          rule.id,
          rule.evidenceIds,
          rule.required,
          rule.appliesToMediaKinds,
          category,
          passed ? 'pass' : 'fail',
          passed
            ? undefined
            : category === 'mandatory_rule'
              ? 'mandatory_literal_missing'
              : 'forbidden_literal_present',
          'exact_text',
        );
      }
    }
  }
  for (const rule of rules.assets) {
    const category =
      rule.role === 'logo'
        ? 'logo'
        : rule.role === 'font'
          ? 'typography'
          : rule.role === 'product'
            ? 'product_identity'
            : 'asset_reference';
    const reason =
      rule.role === 'logo'
        ? 'exact_logo_unavailable'
        : rule.role === 'font'
          ? 'exact_font_unavailable'
          : rule.role === 'product'
            ? 'exact_product_unavailable'
            : 'exact_asset_unavailable';
    append(
      rule.id,
      rule.evidenceIds,
      rule.required,
      rule.appliesToMediaKinds,
      category,
      'unsupported',
      reason,
    );
  }
  checks.push({
    ruleId: 'system:factual_coverage',
    category: 'fact',
    severity: 'hard',
    result: 'unknown',
    method: 'capability',
    evidenceIds: [],
    reasonCode: 'factual_coverage_unverified',
  });
  return checks;
}
