import type { UpdateHarnessProfileDto } from '@api/collections/harness-profiles/dto/update-harness-profile.dto';
import type { UpsertHarnessProfileDto } from '@api/collections/harness-profiles/dto/upsert-harness-profile.dto';
import type { HarnessProfileDocument } from '@api/collections/harness-profiles/schemas/harness-profile.schema';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { ExpertHarnessDraft } from '@api/services/expert-path/utils/expert-harness-draft.util';
import {
  type HarnessPackSeed,
  mergeSeedIntoExistingExamples,
  packSeedToProfilePayload,
} from '@api/services/harness/harness-profile-seed.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { findOrThrow } from '@api/shared/utils/find-or-throw/find-or-throw.util';
import { readRecordOrEmpty as readRecord } from '@api/shared/utils/object/read-record-or-empty.util';
import { scopedWhere } from '@api/tenancy/scoped-where';
import type {
  ExpertPositioningDimensionKey,
  ExpertPositioningRating,
  HarnessProfileScope,
  HarnessProfileStatus,
  IExpertPositioningDimensionScore,
  IExpertPositioningScore,
  IHarnessAvoidFeedbackEntry,
  IHarnessProfileExamples,
  IHarnessProfileStructure,
  IHarnessProfileThesis,
  IHarnessProfileVoice,
} from '@genfeedai/contracts/interfaces';
import type { ContentHarnessContribution } from '@genfeedai/harness';
import { type Profile as PrismaProfile, toPrismaJson } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

const HARNESS_PROFILE_TYPE = 'harness';

/**
 * Thesis keys owned by the Expert Path interview. Re-answering the interview
 * replaces them; every other thesis list is merged so operator edits survive.
 */
const EXPERT_OWNED_THESIS_KEYS = [
  'bigDomino',
  'newOpportunity',
  'notFor',
  'originStory',
  'transformation',
] as const;

const EXPERT_POSITIONING_DIMENSION_KEYS: readonly ExpertPositioningDimensionKey[] =
  [
    'attractiveCharacter',
    'originStory',
    'bigDomino',
    'newOpportunity',
    'authoritySignals',
    'differentiation',
  ];

const EXPERT_POSITIONING_RATINGS: readonly ExpertPositioningRating[] = [
  'expert_positioned',
  'good_foundation',
  'needs_work',
  'commodity_zone',
  'invisible',
];

/** Fields only the server writes; never accepted from the HTTP DTOs. */
export interface HarnessProfileServerFields {
  positioning?: IExpertPositioningScore;
}

export interface HarnessProfileContributionResult {
  contribution: ContentHarnessContribution;
  profileId: string;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function readStringRecord(value: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(readRecord(value))
      .map(([key, item]) => [key, readString(item)])
      .filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
}

function readStringArrayRecord(value: unknown): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(readRecord(value))
      .map(([key, item]) => [key, readStringArray(item)])
      .filter(([, items]) => items.length > 0),
  );
}

/**
 * `avoidFeedback` entries carry non-string fields (isAutoAdded, nested
 * content/reason/source/addedAt), so they cannot round-trip through the
 * generic `readStringArrayRecord` helpers above — validate the shape
 * explicitly instead.
 */
function readAvoidFeedbackEntry(
  value: unknown,
): IHarnessAvoidFeedbackEntry | undefined {
  const record = readRecord(value);
  const content = readString(record.content);
  const source = readString(record.source);
  const addedAt = readString(record.addedAt);
  if (!content || !source || !addedAt) {
    return undefined;
  }

  return {
    addedAt,
    content,
    isAutoAdded: Boolean(record.isAutoAdded),
    reason: readString(record.reason),
    source,
  };
}

function readAvoidFeedback(value: unknown): IHarnessAvoidFeedbackEntry[] {
  return Array.isArray(value)
    ? value
        .map((item) => readAvoidFeedbackEntry(item))
        .filter((item): item is IHarnessAvoidFeedbackEntry => Boolean(item))
    : [];
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function isPositioningDimensionKey(
  value: unknown,
): value is ExpertPositioningDimensionKey {
  return (
    typeof value === 'string' &&
    (EXPERT_POSITIONING_DIMENSION_KEYS as readonly string[]).includes(value)
  );
}

function readPositioningDimension(
  value: unknown,
): IExpertPositioningDimensionScore | undefined {
  const record = readRecord(value);
  const score = readNumber(record.score);
  const weight = readNumber(record.weight);
  if (
    !isPositioningDimensionKey(record.key) ||
    score === undefined ||
    !weight
  ) {
    return undefined;
  }

  return {
    followUpFieldKey: readString(record.followUpFieldKey) ?? '',
    followUpQuestion: readString(record.followUpQuestion) ?? '',
    key: record.key,
    label: readString(record.label) ?? record.key,
    maxWeightedScore: readNumber(record.maxWeightedScore) ?? weight * 10,
    score,
    weight,
    weightedScore: readNumber(record.weightedScore) ?? score * weight,
  };
}

/**
 * The positioning scorecard is server-computed; validate the stored JSON
 * shape instead of trusting it so a malformed row never reaches the UI.
 */
function readPositioning(value: unknown): IExpertPositioningScore | undefined {
  const record = readRecord(value);
  const totalScore = readNumber(record.totalScore);
  const scoredAt = readString(record.scoredAt);
  const rating = record.rating;
  if (
    totalScore === undefined ||
    !scoredAt ||
    !isPositioningDimensionKey(record.weakestDimension) ||
    typeof rating !== 'string' ||
    !(EXPERT_POSITIONING_RATINGS as readonly string[]).includes(rating)
  ) {
    return undefined;
  }

  const dimensions = Array.isArray(record.dimensions)
    ? record.dimensions
        .map((item) => readPositioningDimension(item))
        .filter((item): item is IExpertPositioningDimensionScore =>
          Boolean(item),
        )
    : [];

  return {
    dimensions,
    rating: rating as ExpertPositioningRating,
    scoredAt,
    totalScore,
    version: 1,
    weakestDimension: record.weakestDimension,
  };
}

function mergeUnique(...lists: (string[] | undefined)[]): string[] {
  return Array.from(new Set(lists.flatMap((list) => list ?? [])));
}

@Injectable()
export class HarnessProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async create(
    dto: UpsertHarnessProfileDto,
    organizationId: string,
    userId: string,
    serverFields: HarnessProfileServerFields = {},
  ): Promise<HarnessProfileDocument> {
    const existingProfiles = await this.findForBrand(
      organizationId,
      dto.brandId,
    );
    const isDefault = dto.isDefault ?? existingProfiles.length === 0;
    const data = this.normalizePayload(dto, isDefault, serverFields);

    if (data.isDefault) {
      await this.unsetDefaultForBrand(organizationId, dto.brandId);
    }

    const profile = await this.prisma.profile.create({
      data: {
        createdById: userId,
        data: toPrismaJson(data),
        isDeleted: false,
        organizationId,
      },
    });

    this.logger.log('Harness profile created', {
      brandId: dto.brandId,
      organizationId,
      profileId: profile.id,
    });

    return this.normalizeProfile(profile);
  }

  async findForBrand(
    organizationId: string,
    brandId: string,
    filters?: { isActive?: boolean },
  ): Promise<HarnessProfileDocument[]> {
    const profiles = await this.prisma.profile.findMany({
      orderBy: { updatedAt: 'desc' },
      where: scopedWhere(organizationId, {
        AND: [
          { data: { equals: brandId, path: ['brandId'] } },
          {
            data: {
              equals: HARNESS_PROFILE_TYPE,
              path: ['profileType'],
            },
          },
        ],
      }),
    });

    const normalized = profiles.map((profile) =>
      this.normalizeProfile(profile),
    );

    if (filters?.isActive === undefined) {
      return normalized;
    }

    return normalized.filter(
      (profile) => (profile.status === 'active') === filters.isActive,
    );
  }

  async getActiveForBrand(
    organizationId: string,
    brandId: string,
  ): Promise<HarnessProfileDocument | null> {
    const profiles = await this.findForBrand(organizationId, brandId);
    return (
      profiles.find(
        (profile) => profile.isDefault && profile.status === 'active',
      ) ??
      profiles.find((profile) => profile.status === 'active') ??
      profiles[0] ??
      null
    );
  }

  async update(
    id: string,
    dto: UpdateHarnessProfileDto,
    organizationId: string,
    serverFields: HarnessProfileServerFields = {},
  ): Promise<HarnessProfileDocument> {
    const existing = await this.findOneRaw(id, organizationId);
    const existingProfile = this.normalizeProfile(existing);
    const brandId = existingProfile.brandId;
    if (!brandId) {
      throw new NotFoundException('Harness profile brand');
    }

    const data = this.normalizePayload(
      {
        ...existingProfile,
        ...dto,
        brandId,
        examples: {
          ...existingProfile.examples,
          ...dto.examples,
        },
        handles: {
          ...existingProfile.handles,
          ...dto.handles,
        },
        label: dto.label ?? existingProfile.label,
        scope: dto.scope ?? existingProfile.scope,
        structure: {
          ...existingProfile.structure,
          ...dto.structure,
        },
        thesis: {
          ...existingProfile.thesis,
          ...dto.thesis,
        },
        voice: {
          ...existingProfile.voice,
          ...dto.voice,
        },
      },
      dto.isDefault ?? existingProfile.isDefault,
      {
        positioning: serverFields.positioning ?? existingProfile.positioning,
      },
    );

    if (data.isDefault && data.brandId) {
      await this.unsetDefaultForBrand(organizationId, data.brandId, id);
    }

    const updated = await this.prisma.profile.update({
      data: {
        data: toPrismaJson(data),
      },
      where: scopedWhere(organizationId, { id: existing.id }),
    });

    return this.normalizeProfile(updated);
  }

  async remove(id: string, organizationId: string): Promise<void> {
    const existing = await this.findOneRaw(id, organizationId);
    await this.prisma.profile.update({
      data: { isDeleted: true },
      where: scopedWhere(organizationId, { id: existing.id }),
    });
  }

  async buildContributionForBrand(
    organizationId: string,
    brandId: string,
  ): Promise<ContentHarnessContribution | null> {
    const resolved = await this.resolveContributionForBrand(
      organizationId,
      brandId,
    );
    return resolved?.contribution ?? null;
  }

  /**
   * Contribution plus the id of the profile it came from, so harness briefs
   * can record which profile shaped a generation.
   */
  async resolveContributionForBrand(
    organizationId: string,
    brandId: string,
  ): Promise<HarnessProfileContributionResult | null> {
    const profile = await this.getActiveForBrand(organizationId, brandId);

    if (!profile) {
      return null;
    }

    return {
      contribution: this.toContribution(profile),
      profileId: profile.id,
    };
  }

  /**
   * Create or merge the Expert Path positioning draft into the brand's
   * default harness profile. Mirrors `upsertSeedForBrand`: operator-set
   * scalars win, lists merge, and only the interview-owned thesis keys and
   * the positioning scorecard are replaced.
   */
  async upsertPositioningDraftForBrand(params: {
    draft: ExpertHarnessDraft;
    organizationId: string;
    userId: string;
  }): Promise<HarnessProfileDocument> {
    const { draft } = params;
    const existing = await this.getActiveForBrand(
      params.organizationId,
      draft.brandId,
    );

    if (!existing) {
      return this.create(
        {
          ...draft,
          thesis: { ...draft.thesis },
          voice: { ...draft.voice },
        },
        params.organizationId,
        params.userId,
        { positioning: draft.positioning },
      );
    }

    const thesis: Record<string, string[]> = {
      ...Object.fromEntries(
        Object.entries(existing.thesis ?? {}).map(([key, value]) => [
          key,
          value ?? [],
        ]),
      ),
      beliefs: mergeUnique(existing.thesis?.beliefs, draft.thesis.beliefs),
      enemies: mergeUnique(existing.thesis?.enemies, draft.thesis.enemies),
      proofPoints: mergeUnique(
        existing.thesis?.proofPoints,
        draft.thesis.proofPoints,
      ),
    };
    for (const key of EXPERT_OWNED_THESIS_KEYS) {
      thesis[key] = draft.thesis[key] ?? [];
    }

    return this.update(
      existing.id,
      {
        audience: mergeUnique(existing.audience, draft.audience),
        description: existing.description ?? draft.description,
        guardrails: mergeUnique(existing.guardrails, draft.guardrails),
        isDefault: true,
        label: existing.label || draft.label,
        metadata: { ...existing.metadata, ...draft.metadata },
        platforms: mergeUnique(existing.platforms, draft.platforms),
        thesis,
        voice: {
          ...existing.voice,
          bannedPhrases: mergeUnique(
            existing.voice?.bannedPhrases,
            draft.voice.bannedPhrases,
          ),
          stance: existing.voice?.stance ?? draft.voice.stance,
          style: existing.voice?.style ?? draft.voice.style,
          tone: existing.voice?.tone ?? draft.voice.tone,
          vocabulary: mergeUnique(
            existing.voice?.vocabulary,
            draft.voice.vocabulary,
          ),
        },
      },
      params.organizationId,
      { positioning: draft.positioning },
    );
  }

  /**
   * Create or merge a seed payload into the brand's default harness profile.
   * Existing operator examples are preserved; seed examples append when new.
   */
  async upsertSeedForBrand(params: {
    organizationId: string;
    userId: string;
    brandId: string;
    seed: HarnessPackSeed;
  }): Promise<HarnessProfileDocument> {
    const existing = await this.getActiveForBrand(
      params.organizationId,
      params.brandId,
    );
    const payload = packSeedToProfilePayload(params.seed, params.brandId);
    const examples = mergeSeedIntoExistingExamples(
      existing?.examples,
      params.seed,
    );

    if (!existing) {
      return this.create(
        {
          ...payload,
          examples,
        },
        params.organizationId,
        params.userId,
      );
    }

    return this.update(
      existing.id,
      {
        audience:
          payload.audience.length > 0 ? payload.audience : existing.audience,
        description: existing.description ?? payload.description,
        examples,
        guardrails:
          payload.guardrails.length > 0
            ? Array.from(
                new Set([
                  ...(existing.guardrails ?? []),
                  ...payload.guardrails,
                ]),
              )
            : existing.guardrails,
        handles: { ...payload.handles, ...existing.handles },
        isDefault: true,
        label: existing.label || payload.label,
        thesis: {
          ...existing.thesis,
          offers:
            payload.thesis.offers.length > 0
              ? payload.thesis.offers
              : (existing.thesis?.offers ?? []),
        },
        voice: {
          ...existing.voice,
          bannedPhrases: Array.from(
            new Set([
              ...(existing.voice?.bannedPhrases ?? []),
              ...payload.voice.bannedPhrases,
            ]),
          ),
          style: existing.voice?.style ?? payload.voice.style,
          tone: existing.voice?.tone ?? payload.voice.tone,
        },
      },
      params.organizationId,
    );
  }

  private async findOneRaw(
    id: string,
    organizationId: string,
  ): Promise<PrismaProfile> {
    const profile = await findOrThrow(
      this.prisma.profile,
      {
        where: scopedWhere(organizationId, { id }),
      },
      'Harness profile',
    );

    const normalized = this.normalizeProfile(profile);
    if (normalized.profileType !== HARNESS_PROFILE_TYPE) {
      throw new NotFoundException('Harness profile');
    }

    return profile;
  }

  private async unsetDefaultForBrand(
    organizationId: string,
    brandId: string,
    excludeId?: string,
  ): Promise<void> {
    const profiles = await this.findForBrand(organizationId, brandId);
    const profilesToUpdate = profiles.filter(
      (profile) => profile.id !== excludeId && profile.isDefault,
    );

    if (profilesToUpdate.length === 0) {
      return;
    }

    await this.prisma.$transaction(
      profilesToUpdate.map((profile) =>
        this.prisma.profile.update({
          data: {
            data: toPrismaJson({
              ...readRecord(profile.data),
              isDefault: false,
            }),
          },
          where: scopedWhere(organizationId, { id: profile.id }),
        }),
      ),
    );
  }

  private normalizeProfile(profile: PrismaProfile): HarnessProfileDocument {
    const data = readRecord(profile.data);
    const voiceRecord = readRecord(data.voice);

    return {
      ...profile,
      ...data,
      audience: readStringArray(data.audience),
      avoidFeedback: readAvoidFeedback(data.avoidFeedback),
      brandId: readString(data.brandId) ?? '',
      createdBy: profile.createdById,
      description: readString(data.description),
      examples: readStringArrayRecord(data.examples) as IHarnessProfileExamples,
      guardrails: readStringArray(data.guardrails),
      handles: readStringRecord(data.handles),
      isDefault: Boolean(data.isDefault),
      label: readString(data.label) ?? 'Harness profile',
      metadata: readRecord(data.metadata),
      organization: profile.organizationId,
      platforms: readStringArray(data.platforms),
      positioning: readPositioning(data.positioning),
      profileType: HARNESS_PROFILE_TYPE,
      scope: this.readScope(data.scope),
      status: this.readStatus(data.status),
      structure: readStringArrayRecord(
        data.structure,
      ) as IHarnessProfileStructure,
      thesis: readStringArrayRecord(data.thesis) as IHarnessProfileThesis,
      voice: {
        ...voiceRecord,
        aggression: readString(voiceRecord.aggression),
        bannedPhrases: readStringArray(voiceRecord.bannedPhrases),
        sarcasm: readString(voiceRecord.sarcasm),
        stance: readString(voiceRecord.stance),
        style: readString(voiceRecord.style),
        tone: readString(voiceRecord.tone),
        vocabulary: readStringArray(voiceRecord.vocabulary),
      } as IHarnessProfileVoice,
    } as HarnessProfileDocument;
  }

  private normalizePayload(
    dto: Partial<UpsertHarnessProfileDto> & {
      brandId: string;
      label: string;
      scope: HarnessProfileScope;
    },
    isDefault: boolean,
    serverFields: HarnessProfileServerFields = {},
  ) {
    const positioning = readPositioning(serverFields.positioning);
    return {
      ...(positioning ? { positioning } : {}),
      audience: readStringArray(dto.audience),
      avoidFeedback: readAvoidFeedback(dto.avoidFeedback),
      brandId: dto.brandId,
      description: readString(dto.description),
      examples: readStringArrayRecord(dto.examples),
      guardrails: readStringArray(dto.guardrails),
      handles: readStringRecord(dto.handles),
      isDefault,
      label: dto.label,
      metadata: readRecord(dto.metadata),
      platforms: readStringArray(dto.platforms),
      profileType: HARNESS_PROFILE_TYPE,
      scope: this.readScope(dto.scope),
      status: this.readStatus(dto.status),
      structure: readStringArrayRecord(dto.structure),
      thesis: readStringArrayRecord(dto.thesis),
      voice: {
        ...readRecord(dto.voice),
        bannedPhrases: readStringArray(readRecord(dto.voice).bannedPhrases),
        vocabulary: readStringArray(readRecord(dto.voice).vocabulary),
      },
    };
  }

  private readScope(value: unknown): HarnessProfileScope {
    return value === 'brand' ||
      value === 'channel' ||
      value === 'company' ||
      value === 'founder'
      ? value
      : 'brand';
  }

  private readStatus(value: unknown): HarnessProfileStatus {
    return value === 'draft' ? 'draft' : 'active';
  }

  private toContribution(
    profile: HarnessProfileDocument,
  ): ContentHarnessContribution {
    const voice = profile.voice ?? {};
    const thesis = profile.thesis ?? {};
    const structure = profile.structure ?? {};
    const examples = profile.examples ?? {};
    const styleDirectives = [
      `Harness profile: ${profile.label} (${profile.scope}).`,
      profile.audience.length
        ? `Write for: ${profile.audience.join(', ')}.`
        : undefined,
      voice.tone ? `Voice tone: ${voice.tone}.` : undefined,
      voice.style ? `Voice style: ${voice.style}.` : undefined,
      voice.stance ? `Point of view: ${voice.stance}.` : undefined,
      voice.aggression ? `Edge level: ${voice.aggression}.` : undefined,
      voice.sarcasm ? `Sarcasm mode: ${voice.sarcasm}.` : undefined,
      voice.vocabulary?.length
        ? `Use native vocabulary: ${voice.vocabulary.join(', ')}.`
        : undefined,
      structure.lineRules?.length
        ? `Line rules: ${structure.lineRules.join(' | ')}.`
        : undefined,
      structure.transitions?.length
        ? `Transitions: ${structure.transitions.join(' | ')}.`
        : undefined,
    ].filter((item): item is string => Boolean(item));

    const systemDirectives = [
      thesis.bigDomino?.length
        ? `Big Domino — every piece ladders to this belief: ${thesis.bigDomino.join(' | ')}`
        : undefined,
      thesis.originStory?.length
        ? `Origin story (use as lived experience, never embellish): ${thesis.originStory.join(' | ')}`
        : undefined,
      thesis.newOpportunity?.length
        ? `Frame as a new opportunity, not an improvement: ${thesis.newOpportunity.join(' | ')}`
        : undefined,
      thesis.transformation?.length
        ? `Transformation delivered: ${thesis.transformation.join(' | ')}`
        : undefined,
      thesis.notFor?.length
        ? `Not for: ${thesis.notFor.join(' | ')}`
        : undefined,
      thesis.beliefs?.length
        ? `Core beliefs: ${thesis.beliefs.join(' | ')}.`
        : undefined,
      thesis.enemies?.length
        ? `Oppose: ${thesis.enemies.join(' | ')}.`
        : undefined,
      thesis.offers?.length
        ? `Commercial angle: ${thesis.offers.join(' | ')}.`
        : undefined,
      thesis.proofPoints?.length
        ? `Proof points: ${thesis.proofPoints.join(' | ')}.`
        : undefined,
    ].filter((item): item is string => Boolean(item));

    const guardrails = [
      ...profile.guardrails,
      ...(voice.bannedPhrases?.map((phrase) => `Avoid phrase: ${phrase}.`) ??
        []),
    ];

    const evaluationCriteria = [
      structure.shortFormSkeleton?.length
        ? `Short-form structure follows: ${structure.shortFormSkeleton.join(' -> ')}.`
        : undefined,
      structure.longFormSkeleton?.length
        ? `Long-form structure follows: ${structure.longFormSkeleton.join(' -> ')}.`
        : undefined,
      structure.endings?.length
        ? `Conclusion style matches: ${structure.endings.join(' | ')}.`
        : undefined,
    ].filter((item): item is string => Boolean(item));

    const goodSources =
      examples.good?.map((content, index) => ({
        content,
        id: `harness-${profile.id}-good-${index}`,
        kind: 'brand_example' as const,
        source: profile.label,
        weight: 0.9,
      })) ?? [];
    const avoidSources =
      examples.avoid?.map((content, index) => ({
        content,
        id: `harness-${profile.id}-avoid-${index}`,
        kind: 'anti_example' as const,
        source: profile.label,
        weight: 0.8,
      })) ?? [];

    return {
      evaluationCriteria,
      guardrails,
      sources: [...goodSources, ...avoidSources],
      styleDirectives,
      systemDirectives,
    };
  }
}
