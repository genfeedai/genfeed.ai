import type {
  BrandFactCheck,
  BrandFactCheckOutcome,
  BrandFactTextOrigin,
} from '@api/services/brand-validation/brand-fact-check.types';
import { normalizeBrandLiteralText } from '@api/services/brand-validation/brand-validation-rules.util';
import {
  hashBrandedGenerationTextV1,
  hashBrandFactClaimsV1,
} from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import {
  type BrandFactClaimV1,
  type BrandFactProofV1,
  brandArtifactValidationCheckV1Schema,
} from '@genfeedai/contracts/api-types/contracts';
import type {
  BrandArtifactValidationCheckV1,
  BrandArtifactValidationInputV1,
  BrandArtifactValidationReportV1,
  BrandIdentitySnapshotV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';

export const FACTUAL_COVERAGE_RULE_ID = 'system:factual_coverage';
const NO_CLAIMS_EVIDENCE_ID = 'system:no_factual_claims';
const EVALUATOR_ID = 'brand-fact-check';
const EVALUATOR_VERSION = 1;

export const factualMessage =
  'Complete factual coverage is unavailable; review the actual output against approved sources.';
const contradictedMessage =
  'A factual claim contradicts approved brand evidence; correct the output and request validation again.';

export interface BrandFactCoverageInput {
  snapshot: BrandIdentitySnapshotV1;
  artifact: BrandArtifactValidationInputV1['artifact'];
  checks: readonly BrandArtifactValidationCheckV1[];
  /** The decoded draft text, when the artifact has any. */
  text: string | null;
  /** True when that text is the whole artifact (a standalone text draft). */
  isTextComplete: boolean;
  /** Text a vision model read from each analyzed frame, when a read happened. */
  frameTexts: readonly string[] | null;
  /** Absent means no fact check is wired: coverage stays as the text pass left it. */
  factCheck?: BrandFactCheck;
}

interface CheckedText {
  text: string;
  origin: BrandFactTextOrigin;
  isComplete: boolean;
}

/** What a fact check reads: a text draft as written, a visual only as far as it was read. */
function textToCheck(input: BrandFactCoverageInput): CheckedText | null {
  if (input.artifact.mediaKind === 'text') {
    return input.text === null
      ? null
      : {
          isComplete: input.isTextComplete,
          origin: 'text',
          text: normalizeBrandLiteralText(input.text),
        };
  }
  const read = [
    ...new Set(
      (input.frameTexts ?? [])
        .map((frame) => normalizeBrandLiteralText(frame).trim())
        .filter((frame) => frame.length > 0),
    ),
  ];
  return read.length === 0
    ? null
    : { isComplete: false, origin: 'ocr', text: read.join('\n') };
}

function evidenceIdsOf(claims: readonly BrandFactClaimV1[]): string[] {
  return [
    ...new Set(
      claims.flatMap((claim) => claim.evidence.map((e) => e.evidenceId)),
    ),
  ];
}

function unknownCheck(
  reasonCode: string,
  base: Pick<BrandArtifactValidationCheckV1, 'evidenceIds'> = {
    evidenceIds: [],
  },
): BrandArtifactValidationCheckV1 {
  return {
    category: 'fact',
    evidenceIds: base.evidenceIds,
    method: 'capability',
    reasonCode,
    result: 'unknown',
    ruleId: FACTUAL_COVERAGE_RULE_ID,
    severity: 'hard',
  };
}

function checkedFactCheck(
  input: BrandFactCoverageInput,
  checked: CheckedText,
  outcome: Extract<BrandFactCheckOutcome, { status: 'checked' }>,
): BrandArtifactValidationCheckV1 {
  const { claims } = outcome;
  const contradicted = claims.filter((c) => c.verdict === 'contradicted');
  const isUnverified = claims.some((c) => c.verdict === 'unverified');
  const proof: BrandFactProofV1 = {
    algorithm: 'fact-check-v1',
    artifactHash: input.artifact.contentHash,
    claims,
    claimsHash: hashBrandFactClaimsV1(claims),
    isTextComplete: checked.isComplete,
    kind: 'fact',
    knowledgeVersions: [...outcome.knowledgeVersions].sort(
      (a, b) =>
        a.sourceId.localeCompare(b.sourceId) ||
        a.versionId.localeCompare(b.versionId),
    ),
    mediaKind: input.artifact.mediaKind,
    models: [...new Set(outcome.models)],
    snapshotHash: input.snapshot.contentHash,
    textHash: hashBrandedGenerationTextV1(checked.text),
  };
  // A visual is never fully read, so supported claims in it never complete coverage.
  const reasonCode = isUnverified
    ? 'factual_claim_unverified'
    : input.artifact.mediaKind !== 'text'
      ? 'factual_coverage_media_unproven'
      : 'factual_coverage_text_incomplete';
  const verdict =
    contradicted.length > 0
      ? { reasonCode: 'factual_claim_contradicted', result: 'fail' as const }
      : !isUnverified &&
          input.artifact.mediaKind === 'text' &&
          checked.isComplete
        ? { result: 'pass' as const }
        : { reasonCode, result: 'unknown' as const };
  const evidenceIds =
    verdict.result === 'fail'
      ? evidenceIdsOf(contradicted)
      : claims.length === 0
        ? [NO_CLAIMS_EVIDENCE_ID]
        : evidenceIdsOf(claims);
  return {
    category: 'fact',
    evaluatorId: EVALUATOR_ID,
    evaluatorVersion: EVALUATOR_VERSION,
    evidenceIds,
    method: 'semantic_evaluator',
    proof,
    ruleId: FACTUAL_COVERAGE_RULE_ID,
    severity: 'hard',
    ...verdict,
  };
}

async function runFactCheck(
  factCheck: BrandFactCheck,
  input: BrandFactCoverageInput,
  checked: CheckedText,
): Promise<BrandFactCheckOutcome> {
  try {
    return await factCheck({
      origin: checked.origin,
      snapshot: input.snapshot,
      text: checked.text,
    });
  } catch {
    return { reasonCode: 'fact_check_unavailable', status: 'unavailable' };
  }
}

/**
 * Decides the hard `system:factual_coverage` check from the factual claims in
 * the draft (#6717), each judged against approved brand evidence only:
 *
 * - any contradicted claim: hard `fail`, so the draft is brand-blocked
 * - any unverified claim, an unread or partly read text, a visual, or a check
 *   that could not run: `unknown`, so the draft goes to review
 * - every claim supported (or no claims) in a complete text draft: `pass`
 *
 * Nothing passes by default. A check that fails its own contract is replaced by
 * `unknown`, so a bad model answer can never break validation or pass a draft.
 */
export async function resolveBrandFactCoverage(
  input: BrandFactCoverageInput,
): Promise<BrandArtifactValidationCheckV1[]> {
  const checked = input.factCheck ? textToCheck(input) : null;
  if (!input.factCheck || !checked) return [...input.checks];
  const outcome = await runFactCheck(input.factCheck, input, checked);
  const candidate =
    outcome.status === 'checked'
      ? checkedFactCheck(input, checked, outcome)
      : unknownCheck(outcome.reasonCode);
  const parsed = brandArtifactValidationCheckV1Schema.safeParse(candidate);
  const replacement = parsed.success
    ? candidate
    : unknownCheck('fact_check_invalid_output');
  return input.checks.map((check) =>
    check.ruleId === FACTUAL_COVERAGE_RULE_ID ? replacement : check,
  );
}

/** The report diagnostics that describe the final factual coverage check. */
export function factualCoverageDiagnostics(
  checks: readonly BrandArtifactValidationCheckV1[],
): BrandArtifactValidationReportV1['diagnostics'] {
  const factual = checks.find((c) => c.ruleId === FACTUAL_COVERAGE_RULE_ID);
  if (factual?.result === 'pass') return [];
  if (factual?.result === 'fail')
    return [
      {
        code: 'factual_claim_contradicted',
        evidenceIds: [...factual.evidenceIds],
        message: contradictedMessage,
        severity: 'error',
      },
    ];
  return [
    {
      code: 'factual_coverage_unverified',
      message: factualMessage,
      severity: 'warning',
    },
  ];
}
