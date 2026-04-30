import type { UpsertHarnessProfileDto } from '@api/collections/harness-profiles/dto/upsert-harness-profile.dto';
import type { HarnessProfileDocument } from '@api/collections/harness-profiles/schemas/harness-profile.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { ContentHarnessContribution } from '@genfeedai/harness';
import type {
  HarnessProfileScope,
  HarnessProfileStatus,
  IHarnessProfileExamples,
  IHarnessProfileStructure,
  IHarnessProfileThesis,
  IHarnessProfileVoice,
} from '@genfeedai/interfaces';
import type { Profile as PrismaProfile } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, NotFoundException } from '@nestjs/common';

const HARNESS_PROFILE_TYPE = 'harness';

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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

function serializeJsonRecord(value: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
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
  ): Promise<HarnessProfileDocument> {
    const existingProfiles = await this.findForBrand(
      organizationId,
      dto.brandId,
    );
    const isDefault = dto.isDefault ?? existingProfiles.length === 0;
    const data = this.normalizePayload(dto, isDefault);

    if (data.isDefault) {
      await this.unsetDefaultForBrand(organizationId, dto.brandId);
    }

    const profile = await this.prisma.profile.create({
      data: {
        createdById: userId,
        data: serializeJsonRecord(data as unknown as Record<string, unknown>),
        isDeleted: false,
        organizationId,
      } as never,
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
  ): Promise<HarnessProfileDocument[]> {
    const profiles = await this.prisma.profile.findMany({
      orderBy: { updatedAt: 'desc' },
      where: { isDeleted: false, organizationId },
    });

    return profiles
      .map((profile) => this.normalizeProfile(profile))
      .filter(
        (profile) =>
          profile.profileType === HARNESS_PROFILE_TYPE &&
          profile.brandId === brandId,
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
    dto: Partial<UpsertHarnessProfileDto>,
    organizationId: string,
  ): Promise<HarnessProfileDocument> {
    const existing = await this.findOneRaw(id, organizationId);
    const existingProfile = this.normalizeProfile(existing);
    const data = this.normalizePayload(
      {
        ...existingProfile,
        ...dto,
        brandId: dto.brandId ?? existingProfile.brandId,
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
    );

    if (data.isDefault && data.brandId) {
      await this.unsetDefaultForBrand(organizationId, data.brandId, id);
    }

    const updated = await this.prisma.profile.update({
      data: {
        data: serializeJsonRecord(data as unknown as Record<string, unknown>),
      } as never,
      where: { id: existing.id },
    });

    return this.normalizeProfile(updated);
  }

  async remove(id: string, organizationId: string): Promise<void> {
    const existing = await this.findOneRaw(id, organizationId);
    await this.prisma.profile.update({
      data: { isDeleted: true } as never,
      where: { id: existing.id },
    });
  }

  async buildContributionForBrand(
    organizationId: string,
    brandId: string,
  ): Promise<ContentHarnessContribution | null> {
    const profile = await this.getActiveForBrand(organizationId, brandId);

    if (!profile) {
      return null;
    }

    return this.toContribution(profile);
  }

  private async findOneRaw(
    id: string,
    organizationId: string,
  ): Promise<PrismaProfile> {
    const profile = await this.prisma.profile.findFirst({
      where: {
        id,
        isDeleted: false,
        organizationId,
      },
    });

    if (!profile) {
      throw new NotFoundException('Harness profile not found');
    }

    const normalized = this.normalizeProfile(profile);
    if (normalized.profileType !== HARNESS_PROFILE_TYPE) {
      throw new NotFoundException('Harness profile not found');
    }

    return profile;
  }

  private async unsetDefaultForBrand(
    organizationId: string,
    brandId: string,
    excludeId?: string,
  ): Promise<void> {
    const profiles = await this.findForBrand(organizationId, brandId);
    await Promise.all(
      profiles
        .filter((profile) => profile.id !== excludeId && profile.isDefault)
        .map((profile) =>
          this.prisma.profile.update({
            data: {
              data: serializeJsonRecord({
                ...readRecord(profile.data),
                isDefault: false,
              }),
            } as never,
            where: { id: profile.id },
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
      _id: profile.mongoId ?? profile.id,
      audience: readStringArray(data.audience),
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
  ) {
    return {
      audience: readStringArray(dto.audience),
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
