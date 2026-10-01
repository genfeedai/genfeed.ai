import { brandIdentitySnapshotV1Schema } from '@genfeedai/contracts/api-types/contracts/branded-generation.contract';
import { ContentLearningArm } from '@genfeedai/contracts/enums';
import type {
  BrandIdentitySnapshotV1,
  LearningFormat,
  LearningGenerationResolutionInputV1,
} from '@genfeedai/contracts/interfaces';

type Compatibility = readonly [
  LearningGenerationResolutionInputV1['hardConstraints'],
  BrandIdentitySnapshotV1['diagnostics'],
];
const NONBASELINE = [
  ContentLearningArm.QUESTION_EXAMPLE,
  ContentLearningArm.PROOF_STEPS,
];

/** Conservative fixed-tactic eligibility; this does not validate an artifact. */
export function deriveBrandLearningCompatibility(
  snapshot: BrandIdentitySnapshotV1,
  format: LearningFormat,
): Compatibility {
  const parsed = brandIdentitySnapshotV1Schema.parse(snapshot);
  const rules = parsed.generationRules;
  const veto = (code: string, message: string): Compatibility => [
    {
      snapshotHash: parsed.contentHash,
      compatible: false,
      excludedArmIds: [...NONBASELINE],
    },
    [{ code, message, severity: 'warning' }],
  ];
  if (['image', 'carousel', 'video', 'short'].includes(format)) {
    return veto(
      'learning.compatibility_unverified_media',
      'Fixed tactics have no verified independent media slot.',
    );
  }
  if (
    rules.facts.some((rule) => rule.required && rule.match === 'semantic') ||
    rules.mandatory.some((rule) => rule.required) ||
    rules.avoid.some((rule) => rule.required) ||
    parsed.voice.avoid.length
  ) {
    return veto(
      'learning.compatibility_unverified',
      'Required brand constraints cannot establish fixed-tactic compatibility.',
    );
  }
  const excludedArmIds: ContentLearningArm[] = [];
  const diagnostics: BrandIdentitySnapshotV1['diagnostics'] = [];
  if (!rules.examples.some((rule) => rule.polarity === 'positive')) {
    excludedArmIds.push(ContentLearningArm.QUESTION_EXAMPLE);
    diagnostics.push({
      code: 'learning.missing_approved_example',
      severity: 'warning',
      message:
        'No approved positive example supports the question/example tactic.',
    });
  }
  if (
    !rules.facts.some(
      (rule) =>
        rule.match === 'literal' &&
        rule.evidenceIds.some((id) =>
          rules.evidence.some(
            (entry) =>
              entry.id === id &&
              (entry.sourceType === 'manual' || Boolean(entry.excerpt?.length)),
          ),
        ),
    )
  ) {
    excludedArmIds.push(ContentLearningArm.PROOF_STEPS);
    diagnostics.push({
      code: 'learning.missing_fact_evidence',
      severity: 'warning',
      message:
        'No literal fact with supplied excerpt or manual evidence supports the proof/steps tactic.',
    });
  }
  return [
    {
      snapshotHash: parsed.contentHash,
      compatible: excludedArmIds.length < NONBASELINE.length,
      excludedArmIds,
    },
    diagnostics,
  ];
}
