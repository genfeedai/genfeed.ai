import { createHash } from 'node:crypto';
import type {
  BrandFactEvidenceItem,
  BrandFactTextOrigin,
} from '@api/services/brand-validation/brand-fact-check.types';
import type {
  FactExtraction,
  FactJudgment,
} from '@api/services/brand-validation/brand-fact-check-prompt.util';
import type {
  BrandFactClaimV1,
  BrandFactEvidenceV1,
} from '@genfeedai/contracts/api-types/contracts';
import { BRAND_FACT_PROOF_LIMITS } from '@genfeedai/contracts/api-types/contracts';
import type { BrandContentMemoryHit } from '@genfeedai/contracts/interfaces';
import type { BrandIdentitySnapshotV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';

/** Evidence passages are shown to the judge, and quoted back, at most this long. */
export const MAX_FACT_EVIDENCE_LENGTH = 1_500;
/** A Brand OS fact is a short statement; a longer one is cut before the judge sees it. */
const MAX_BRAND_FACT_LENGTH = 600;
/** Knowledge passages retrieved per claim. */
export const FACT_PASSAGES_PER_CLAIM = 4;
/** Knowledge passages the judge sees in total. */
export const MAX_FACT_KNOWLEDGE_PASSAGES = 40;
/** A quote shorter than this proves nothing about what it was cut from. */
const MIN_QUOTE_LENGTH = 4;

/**
 * Quotes are compared after the normalization a reader would shrug at: Unicode
 * form, quote glyphs, whitespace runs and letter case. Nothing else may differ.
 */
export function normalizeFactQuote(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function isQuoteOf(
  quote: string,
  text: string,
  minLength = MIN_QUOTE_LENGTH,
): boolean {
  const needle = normalizeFactQuote(quote);
  return (
    needle.length >= minLength && normalizeFactQuote(text).includes(needle)
  );
}

/**
 * The approved Brand OS facts of the snapshot, one passage each. A provisional
 * snapshot has no approved facts, so it contributes none.
 */
export function brandOsEvidence(
  snapshot: BrandIdentitySnapshotV1,
): BrandFactEvidenceItem[] {
  if (snapshot.approval !== 'approved') return [];
  return snapshot.generationRules.facts.map((fact) => ({
    id: `fact:${fact.id}`,
    origin: 'brand_os' as const,
    ruleId: fact.id,
    text: [
      `${fact.subject} ${fact.predicate}: ${String(fact.value)}`,
      fact.unit ? ` ${fact.unit}` : '',
      fact.qualifier ? ` (${fact.qualifier})` : '',
      fact.attributedTo ? ` - ${fact.attributedTo}` : '',
    ]
      .join('')
      .slice(0, MAX_BRAND_FACT_LENGTH),
  }));
}

/** Knowledge passages that carry a citation; an uncited passage is never evidence. */
export function knowledgeEvidence(
  hits: readonly BrandContentMemoryHit[],
): BrandFactEvidenceItem[] {
  return hits.flatMap((hit) => {
    const { citation } = hit;
    if (!citation) return [];
    const text = hit.content.slice(0, MAX_FACT_EVIDENCE_LENGTH);
    const digest = createHash('sha256').update(text).digest('hex').slice(0, 12);
    return [
      {
        id: `knowledge:${citation.sourceId}:${citation.versionId}:${digest}`,
        origin: 'knowledge' as const,
        sourceId: citation.sourceId,
        text,
        version: citation.version,
        versionId: citation.versionId,
      },
    ];
  });
}

function toProofEvidence(
  item: BrandFactEvidenceItem,
  quote: string,
): BrandFactEvidenceV1 {
  return {
    evidenceId: item.id,
    origin: item.origin,
    quote,
    ...(item.ruleId ? { ruleId: item.ruleId } : {}),
    ...(item.sourceId ? { sourceId: item.sourceId } : {}),
    ...(item.versionId ? { versionId: item.versionId } : {}),
    ...(item.version !== undefined ? { version: item.version } : {}),
  };
}

/**
 * Turns the judge's answer into claim results nobody has to take on trust. A
 * verdict stands only with at least one citation that names a real evidence
 * item and quotes it verbatim; anything else, and any claim the judge skipped,
 * is `unverified`. A model can therefore lose a pass but never invent one.
 */
export function settleFactClaims(
  extraction: FactExtraction,
  judgment: FactJudgment | null,
  evidence: readonly BrandFactEvidenceItem[],
  origin: BrandFactTextOrigin,
): BrandFactClaimV1[] {
  const byId = new Map(evidence.map((item) => [item.id, item]));
  const judged = new Map<string, FactJudgment['verdicts'][number]>();
  for (const verdict of judgment?.verdicts ?? [])
    if (!judged.has(verdict.claimId)) judged.set(verdict.claimId, verdict);
  return extraction.claims.map((claim, index) => {
    const id = `claim-${index + 1}`;
    const base = { id, origin, source: claim.quote, text: claim.claim };
    const verdict = judged.get(id);
    const cited = new Map<string, BrandFactEvidenceV1>();
    for (const citation of verdict?.citations ?? []) {
      const item = byId.get(citation.evidenceId);
      if (item && isQuoteOf(citation.quote, item.text))
        cited.set(item.id, toProofEvidence(item, citation.quote));
    }
    const evidenceCited = [...cited.values()].slice(
      0,
      BRAND_FACT_PROOF_LIMITS.citations,
    );
    return !verdict || verdict.verdict === 'unverified' || !evidenceCited.length
      ? { ...base, evidence: [], verdict: 'unverified' as const }
      : { ...base, evidence: evidenceCited, verdict: verdict.verdict };
  });
}
