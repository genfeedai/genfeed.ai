import type {
  BrandGenerationRulesV1,
  BrandRuleEvidenceV1,
  BrandVideoRulesV1,
} from '../../interfaces/content/branded-generation.interface';
import { brandGenerationRulesV1Schema } from './branded-generation.contract';

/**
 * The video identity an owner writes in the Brand Kit lives on the revision as
 * `IBrandKitDraft.video`, next to the Policy and finishing sections. The Brand
 * Kit never authors `generationRules` (scans do), so a brand with no scanned
 * rules keeps the provisional rules built from its approved fields. At
 * projection the owner's video identity joins the rules, so every reader finds
 * it at `snapshot.generationRules.video`.
 */
export const OWNER_VIDEO_EVIDENCE_ID = 'owner-video';

export const OWNER_VIDEO_EVIDENCE: BrandRuleEvidenceV1 = {
  id: OWNER_VIDEO_EVIDENCE_ID,
  label: 'Owner-authored video identity',
  sourceType: 'manual',
};

/** Rules with the owner's video identity merged in; the owner's section wins. */
export function mergeOwnerVideoRules(
  rules: BrandGenerationRulesV1,
  video: BrandVideoRulesV1 | undefined,
): BrandGenerationRulesV1 {
  if (!video) return rules;
  const hasEvidence = rules.evidence.some(
    (entry) => entry.id === OWNER_VIDEO_EVIDENCE_ID,
  );
  return {
    ...rules,
    evidence: hasEvidence
      ? rules.evidence
      : [...rules.evidence, OWNER_VIDEO_EVIDENCE],
    video,
  };
}

export const EMPTY_BRAND_GENERATION_RULES: BrandGenerationRulesV1 = {
  assets: [],
  avoid: [],
  evidence: [],
  examples: [],
  facts: [],
  mandatory: [],
  palette: [],
  schemaVersion: 1,
  typography: [],
};

/**
 * Whether the owner's video identity is consistent with the rules it will join:
 * unique rule ids and resolvable references. Checked on save, so a bad section
 * never reaches a projection that every generation depends on.
 */
export function isOwnerVideoRulesValid(
  rules: BrandGenerationRulesV1 | undefined,
  video: BrandVideoRulesV1,
): boolean {
  return brandGenerationRulesV1Schema.safeParse(
    mergeOwnerVideoRules(rules ?? EMPTY_BRAND_GENERATION_RULES, video),
  ).success;
}

/**
 * An approved video section inherited by a draft with different rules can lose
 * what it points at. Drops the typography and logo references that no longer
 * resolve, and returns undefined when the section is still invalid.
 */
export function reconcileOwnerVideoRules(
  rules: BrandGenerationRulesV1 | undefined,
  video: BrandVideoRulesV1,
): BrandVideoRulesV1 | undefined {
  const known = rules ?? EMPTY_BRAND_GENERATION_RULES;
  const { captions, logoPlacement } = video;
  const fontId = captions?.typographyRuleId;
  const logoId = logoPlacement?.assetReferenceId;
  const next: BrandVideoRulesV1 = { ...video };
  if (captions && fontId && !known.typography.some((t) => t.id === fontId)) {
    const { typographyRuleId: _dropped, ...rest } = captions;
    next.captions = rest;
  }
  if (
    logoPlacement &&
    logoId &&
    !known.assets.some((a) => a.id === logoId && a.role === 'logo')
  ) {
    const { assetReferenceId: _dropped, ...rest } = logoPlacement;
    next.logoPlacement = rest;
  }
  return isOwnerVideoRulesValid(rules, next) ? next : undefined;
}
