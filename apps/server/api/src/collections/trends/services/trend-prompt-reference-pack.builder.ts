import { createHash } from 'node:crypto';
import type {
  TrendPromptReferenceBrandSuitability,
  TrendPromptReferenceFreshnessStatus,
  TrendPromptReferencePack,
  TrendPromptReferencePackFreshness,
  TrendPromptReferencePackSource,
  TrendPromptReferencePackType,
  TrendSourceClassification,
  TrendSourceConfidence,
  TrendSourceItem,
  TrendSourceKind,
  TrendSourceReferenceRecord,
} from '@api/collections/trends/interfaces/trend.interfaces';
import {
  getTrendFreshnessStatus,
  optionalSourceFields,
  resolveFreshnessWindowDays,
} from '@api/collections/trends/utils/trend-freshness.util';
import { isTrendPromptReady } from '@api/collections/trends/utils/trend-prompt-ready.util';
import { SecurityUtil } from '@api/helpers/utils/security/security.util';

const PROMPT_REFERENCE_PACK_TYPES: TrendPromptReferencePackType[] = [
  'hooks',
  'formats',
  'references',
  'constraints',
];

export interface BuildTrendPromptReferencePacksInput {
  contentIntent: TrendSourceClassification['intendedUse'];
  generatedAt: Date;
  references: TrendSourceReferenceRecord[];
  targetPlatform: string;
  types: TrendPromptReferencePackType[];
}

/**
 * Pure prompt-pack projection. Cache keys, freshness, and source fingerprints
 * are derived exclusively from the supplied corpus records and clock.
 */
export class TrendPromptReferencePackBuilder {
  build(
    input: BuildTrendPromptReferencePacksInput,
  ): TrendPromptReferencePack[] {
    return input.types
      .map((type) => this.buildPack({ ...input, type }))
      .filter((pack): pack is TrendPromptReferencePack => pack != null);
  }

  isPromptReady(
    reference: TrendSourceReferenceRecord,
    contentIntent: TrendSourceClassification['intendedUse'],
  ): boolean {
    return isTrendPromptReady(
      reference,
      contentIntent,
      this.getReferenceLabel(reference),
    );
  }

  normalizeTypes(
    types: TrendPromptReferencePackType[] | undefined,
  ): TrendPromptReferencePackType[] {
    if (!types || types.length === 0) {
      return PROMPT_REFERENCE_PACK_TYPES;
    }

    return PROMPT_REFERENCE_PACK_TYPES.filter((type) => types.includes(type));
  }

  private buildPack(
    input: BuildTrendPromptReferencePacksInput & {
      type: TrendPromptReferencePackType;
    },
  ): TrendPromptReferencePack | undefined {
    if (input.references.length === 0) {
      return undefined;
    }

    const topReferences = input.references.slice(0, 6);
    const sourceReferenceIds = topReferences.map((reference) => reference.id);
    const freshness = this.buildFreshness(topReferences, input.generatedAt);
    const sourceFingerprint = this.buildSourceFingerprint(topReferences);
    const cacheKey = this.hashCacheKey([
      input.type,
      input.targetPlatform,
      input.contentIntent,
      sourceFingerprint,
    ]);
    const promptContent = this.buildContent(input.type, topReferences);

    return {
      brandSuitability: this.getBrandSuitability(topReferences),
      confidence: this.aggregateConfidence(topReferences),
      constraints: promptContent.constraints,
      contentIntent: input.contentIntent,
      examples: promptContent.examples,
      freshness,
      id: `prompt-pack:${input.type}:${input.targetPlatform}:${cacheKey}`,
      instructions: promptContent.instructions,
      metadata: {
        contentTypes: this.getUniqueContentTypes(topReferences),
        generatedAt: input.generatedAt.toISOString(),
        matchedTopics: this.getUniqueMatchedTopics(topReferences),
        sourceCount: topReferences.length,
        sourceKinds: this.getUniqueSourceKinds(topReferences),
      },
      regeneration: {
        cacheKey,
        regenerateAfter: freshness.regenerateAfter,
        sourceFingerprint,
        trigger: this.getRegenerationTrigger(freshness),
      },
      sourceReferenceIds,
      sources: topReferences.map((reference) =>
        this.toSource(reference, input.generatedAt),
      ),
      summary: promptContent.summary,
      targetPlatform: input.targetPlatform,
      title: `${this.toTitleCase(input.type)} pack from ${this.describeSources(topReferences)}`,
      type: input.type,
    };
  }

  private buildContent(
    type: TrendPromptReferencePackType,
    references: TrendSourceReferenceRecord[],
  ): {
    constraints: string[];
    examples: string[];
    instructions: string[];
    summary: string;
  } {
    switch (type) {
      case 'hooks':
        return {
          constraints: [
            'Keep the opening claim grounded in the cited source references.',
            'Do not copy creator wording verbatim when adapting the hook.',
          ],
          examples: references.map(
            (reference) => `Hook angle: ${this.deriveHook(reference)}`,
          ),
          instructions: [
            'Start with the concrete tension, result, or surprising detail visible in the source.',
            'Adapt the hook structure to the target brand voice before generation.',
          ],
          summary: `Reusable hook patterns from ${references.length} prompt-ready corpus references.`,
        };
      case 'formats':
        return {
          constraints: [
            'Use the observed format as structure, not as a copied creative.',
            'Match the target platform constraints before publishing.',
          ],
          examples: this.deriveFormatExamples(references),
          instructions: [
            'Choose the format that matches the requested platform and creative intent.',
            'Preserve the source-backed sequence of setup, proof, and payoff when present.',
          ],
          summary: `Observed content formats across ${this.getUniqueContentTypes(references).join(', ')} references.`,
        };
      case 'references':
        return {
          constraints: [
            'Keep reference URLs available for audit and remix lineage.',
            'Treat sources as inspiration and evidence, not generated output.',
          ],
          examples: references.map(
            (reference) =>
              `${this.getReferenceLabel(reference)} (${reference.canonicalUrl})`,
          ),
          instructions: [
            'Use these references to ground examples, claims, and creative direction.',
            'Prefer newer or higher-confidence sources when the pack contains conflicts.',
          ],
          summary: `Traceable source-reference set with ${references.length} canonical corpus records.`,
        };
      case 'constraints':
        return {
          constraints: this.deriveSourceBackedConstraints(references),
          examples: references.map(
            (reference) =>
              `${reference.platform}: ${this.getReferenceLabel(reference)}`,
          ),
          instructions: [
            'Apply these constraints before drafting generation prompts.',
            'Regenerate the pack when freshness metadata marks the source set stale or expired.',
          ],
          summary: `Source-backed generation constraints from ${references.length} classified references.`,
        };
      default: {
        const exhaustive: never = type;
        return exhaustive;
      }
    }
  }

  private deriveHook(reference: TrendSourceReferenceRecord): string {
    const label = this.getReferenceLabel(reference);
    const firstSentence = label.split(/[.!?]/)[0]?.trim();
    return SecurityUtil.sanitizePromptInput(firstSentence || label, 160);
  }

  private deriveFormatExamples(
    references: TrendSourceReferenceRecord[],
  ): string[] {
    const examples = references.map((reference) => {
      const topic = reference.matchedTrendTopics[0] ?? 'source-backed topic';
      return `${reference.platform} ${reference.contentType}: lead with ${SecurityUtil.sanitizePromptInput(topic, 80)}, then adapt "${this.getReferenceLabel(reference)}".`;
    });

    return this.uniqueStrings(examples).slice(0, 6);
  }

  private deriveSourceBackedConstraints(
    references: TrendSourceReferenceRecord[],
  ): string[] {
    const sourceLabels = this.uniqueStrings(
      references
        .map((reference) => reference.sourceClassification?.sourceLabel)
        .filter((value): value is string => Boolean(value)),
    );
    const topics = this.getUniqueMatchedTopics(references);
    const platforms = this.uniqueStrings(
      references.map((reference) => reference.platform),
    );

    return [
      `Use only references classified for ${references[0]?.sourceClassification?.intendedUse ?? 'prompt context'}.`,
      `Target platform evidence comes from ${platforms.join(', ')}.`,
      sourceLabels.length > 0
        ? `Source labels represented: ${sourceLabels.join(', ')}.`
        : 'Source labels are unavailable; keep claims generic.',
      topics.length > 0
        ? `Ground angles in matched topics: ${topics.slice(0, 6).join(', ')}.`
        : 'No matched trend topics are available; avoid trend-specific claims.',
    ];
  }

  private buildFreshness(
    references: TrendSourceReferenceRecord[],
    generatedAt: Date,
  ): TrendPromptReferencePackFreshness {
    const sourceFreshness = references.map((reference) => ({
      id: reference.id,
      status: this.getFreshnessStatus(reference, generatedAt),
    }));
    const freshnessWindowDays = Math.max(
      ...references.map((reference) =>
        resolveFreshnessWindowDays(
          reference.sourceClassification?.freshnessWindowDays,
        ),
      ),
    );
    const lastSourceSeenAt = references
      .map((reference) => reference.lastSeenAt)
      .sort()
      .at(-1);
    const regenerateAfter = references
      .map((reference) => this.getRegenerateAfter(reference))
      .filter((value): value is string => Boolean(value))
      .sort()[0];
    const expiredSourceIds = sourceFreshness
      .filter((source) => source.status === 'expired')
      .map((source) => source.id);
    const staleSourceIds = sourceFreshness
      .filter((source) => source.status === 'stale')
      .map((source) => source.id);

    return {
      expiredSourceIds,
      freshnessWindowDays,
      lastSourceSeenAt,
      regenerateAfter,
      staleSourceIds,
      status:
        expiredSourceIds.length > 0
          ? 'expired'
          : staleSourceIds.length > 0
            ? 'stale'
            : 'fresh',
    };
  }

  private getFreshnessStatus(
    reference: TrendSourceReferenceRecord,
    generatedAt: Date,
  ): TrendPromptReferenceFreshnessStatus {
    return getTrendFreshnessStatus(
      reference.lastSeenAt,
      generatedAt,
      resolveFreshnessWindowDays(
        reference.sourceClassification?.freshnessWindowDays,
      ),
    );
  }

  private getRegenerateAfter(
    reference: TrendSourceReferenceRecord,
  ): string | undefined {
    const lastSeenAt = new Date(reference.lastSeenAt).getTime();
    if (!Number.isFinite(lastSeenAt)) {
      return undefined;
    }

    const freshnessWindowDays = resolveFreshnessWindowDays(
      reference.sourceClassification?.freshnessWindowDays,
    );
    return new Date(
      lastSeenAt + freshnessWindowDays * 24 * 60 * 60 * 1000,
    ).toISOString();
  }

  private getRegenerationTrigger(
    freshness: TrendPromptReferencePackFreshness,
  ): TrendPromptReferencePack['regeneration']['trigger'] {
    if (freshness.expiredSourceIds.length > 0) {
      return 'source_expired';
    }
    if (freshness.staleSourceIds.length > 0) {
      return 'source_stale';
    }
    return 'cache_key_changed';
  }

  private toSource(
    reference: TrendSourceReferenceRecord,
    generatedAt: Date,
  ): TrendPromptReferencePackSource {
    const source: TrendPromptReferencePackSource = {
      authorHandle: reference.authorHandle,
      canonicalUrl: reference.canonicalUrl,
      confidence: reference.sourceClassification?.confidence ?? 'low',
      contentType: reference.contentType,
      freshnessStatus: this.getFreshnessStatus(reference, generatedAt),
      id: reference.id,
      lastSeenAt: reference.lastSeenAt,
      platform: reference.platform,
      sourceClassification: reference.sourceClassification,
    };

    return optionalSourceFields(source, reference.text, reference.title);
  }

  private buildSourceFingerprint(
    references: TrendSourceReferenceRecord[],
  ): string {
    return references
      .map(
        (reference) =>
          `${reference.id}:${reference.lastSeenAt}:${reference.latestTrendViralityScore}:${reference.currentEngagementTotal}`,
      )
      .sort()
      .join('|');
  }

  private hashCacheKey(parts: string[]): string {
    return createHash('sha256')
      .update(parts.join('|'))
      .digest('hex')
      .slice(0, 16);
  }

  private aggregateConfidence(
    references: TrendSourceReferenceRecord[],
  ): TrendSourceConfidence {
    const confidences = references.map(
      (reference) => reference.sourceClassification?.confidence ?? 'low',
    );

    if (confidences.every((confidence) => confidence === 'high')) {
      return 'high';
    }
    if (confidences.some((confidence) => confidence !== 'low')) {
      return 'medium';
    }
    return 'low';
  }

  private getBrandSuitability(
    references: TrendSourceReferenceRecord[],
  ): TrendPromptReferenceBrandSuitability {
    if (
      references.some(
        (reference) =>
          reference.sourceClassification?.sourceKind ===
            'paid_creative_reference' ||
          reference.sourceClassification?.confidence === 'low',
      )
    ) {
      return 'requires_review';
    }

    return references.every((reference) => reference.sourceClassification)
      ? 'brand_safe'
      : 'unknown';
  }

  private getUniqueSourceKinds(
    references: TrendSourceReferenceRecord[],
  ): TrendSourceKind[] {
    return this.uniqueStrings(
      references
        .map((reference) => reference.sourceClassification?.sourceKind)
        .filter((value): value is TrendSourceKind => Boolean(value)),
    ) as TrendSourceKind[];
  }

  private getUniqueContentTypes(
    references: TrendSourceReferenceRecord[],
  ): TrendSourceItem['contentType'][] {
    return this.uniqueStrings(
      references.map((reference) => reference.contentType),
    ) as TrendSourceItem['contentType'][];
  }

  private getUniqueMatchedTopics(
    references: TrendSourceReferenceRecord[],
  ): string[] {
    return this.uniqueStrings(
      references.flatMap((reference) => reference.matchedTrendTopics),
    ).slice(0, 12);
  }

  private describeSources(references: TrendSourceReferenceRecord[]): string {
    const platforms = this.uniqueStrings(
      references.map((reference) => reference.platform),
    );
    return platforms.length === 1
      ? platforms[0]
      : `${platforms.length} platforms`;
  }

  private getReferenceLabel(reference: TrendSourceReferenceRecord): string {
    return SecurityUtil.sanitizePromptInput(
      reference.title || reference.text || reference.canonicalUrl,
      180,
    );
  }

  private toTitleCase(value: string): string {
    return value
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
      .join(' ');
  }

  private uniqueStrings(values: string[]): string[] {
    return Array.from(new Set(values.filter((value) => value.length > 0)));
  }
}
