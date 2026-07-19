import { createHash } from 'node:crypto';
import type { CreateListeningTopicDto } from '@api/collections/listening-topics/dto/create-listening-topic.dto';
import type {
  ListeningEvidenceQueryDto,
  ListeningTopicsQueryDto,
} from '@api/collections/listening-topics/dto/listening-topics-query.dto';
import type { UpdateListeningTopicDto } from '@api/collections/listening-topics/dto/update-listening-topic.dto';
import type {
  ListeningEvidenceDocument,
  ListeningTopicDocument,
} from '@api/collections/listening-topics/schemas/listening-topic.schema';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ListeningSourcePlatform } from '@genfeedai/enums';
import { LISTENING_CONTRACT_VERSION } from '@genfeedai/interfaces';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

interface ListeningScope {
  organizationId: string;
  brandId: string;
  userId?: string;
}

interface NormalizedTopicContract {
  label: string;
  description: string | null;
  keywords: string[];
  excludedKeywords: string[];
  languages: string[];
  sourceIds: string[];
  freshnessHours: number;
  isActive: boolean;
}

const topicInclude = {
  sources: {
    orderBy: { createdAt: 'asc' as const },
    where: { isDeleted: false },
  },
} as const;

@Injectable()
export class ListeningTopicsService {
  constructor(private readonly prisma: PrismaService) {}

  async createScoped(
    dto: CreateListeningTopicDto,
    context: Required<ListeningScope>,
  ): Promise<ListeningTopicDocument> {
    const normalized = normalizeTopicContract(dto);
    const sources = await this.resolveAuthorizedSources(
      normalized.sourceIds,
      context,
    );
    const fingerprint = buildTopicFingerprint(normalized);
    const existing = await this.prisma.listeningTopic.findFirst({
      include: topicInclude,
      where: {
        brandId: context.brandId,
        fingerprint,
        isDeleted: false,
        organizationId: context.organizationId,
      },
    });

    if (existing) {
      return existing as unknown as ListeningTopicDocument;
    }

    try {
      return (await this.prisma.listeningTopic.create({
        data: {
          auditedAt: new Date(),
          brandId: context.brandId,
          contractVersion: LISTENING_CONTRACT_VERSION,
          description: normalized.description,
          excludedKeywords: normalized.excludedKeywords,
          fingerprint,
          freshnessHours: normalized.freshnessHours,
          isActive: normalized.isActive,
          keywords: normalized.keywords,
          label: normalized.label,
          languages: normalized.languages,
          organizationId: context.organizationId,
          sources: {
            create: sources.map((source) => ({
              brandId: context.brandId,
              organizationId: context.organizationId,
              platform: source.platform,
              sourceId: source.id,
            })),
          },
          userId: context.userId,
        },
        include: topicInclude,
      })) as unknown as ListeningTopicDocument;
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') {
        throw error;
      }

      const concurrentWinner = await this.prisma.listeningTopic.findFirst({
        include: topicInclude,
        where: {
          brandId: context.brandId,
          fingerprint,
          isDeleted: false,
          organizationId: context.organizationId,
        },
      });
      if (!concurrentWinner) {
        throw error;
      }

      return concurrentWinner as unknown as ListeningTopicDocument;
    }
  }

  async findAllScoped(context: ListeningScope, query: ListeningTopicsQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 25));
    const search = query.search?.trim();
    const where = {
      brandId: context.brandId,
      isActive: query.isActive,
      isDeleted: query.isDeleted ?? false,
      organizationId: context.organizationId,
      ...(query.source && {
        sources: { some: { sourceId: query.source } },
      }),
      ...(search && {
        OR: [
          { label: { contains: search, mode: 'insensitive' as const } },
          { description: { contains: search, mode: 'insensitive' as const } },
          { keywords: { has: search.toLocaleLowerCase() } },
        ],
      }),
    };
    const [docs, total] = await Promise.all([
      this.prisma.listeningTopic.findMany({
        include: topicInclude,
        orderBy: { createdAt: 'desc' },
        ...(query.pagination === false
          ? {}
          : { skip: (page - 1) * limit, take: limit }),
        where,
      }),
      this.prisma.listeningTopic.count({ where }),
    ]);

    return {
      docs: docs as unknown as ListeningTopicDocument[],
      limit,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      total,
    };
  }

  async findOneScoped(
    id: string,
    context: ListeningScope,
  ): Promise<ListeningTopicDocument> {
    const topic = await this.prisma.listeningTopic.findFirst({
      include: topicInclude,
      where: {
        brandId: context.brandId,
        id,
        isDeleted: false,
        organizationId: context.organizationId,
      },
    });

    if (!topic) {
      throw new NotFoundException({ message: 'Listening topic not found' });
    }

    return topic as unknown as ListeningTopicDocument;
  }

  async updateScoped(
    id: string,
    dto: UpdateListeningTopicDto,
    context: ListeningScope,
  ): Promise<ListeningTopicDocument> {
    const existing = await this.findOneScoped(id, context);
    const normalized = normalizeTopicContract({
      description: dto.description ?? existing.description ?? undefined,
      excludedKeywords: dto.excludedKeywords ?? existing.excludedKeywords,
      freshnessHours: dto.freshnessHours ?? existing.freshnessHours,
      isActive: dto.isActive ?? existing.isActive,
      keywords: dto.keywords ?? existing.keywords,
      label: dto.label ?? existing.label,
      languages: dto.languages ?? existing.languages,
      sourceIds:
        dto.sourceIds ?? existing.sources.map(({ sourceId }) => sourceId),
    });
    const sources = await this.resolveAuthorizedSources(
      normalized.sourceIds,
      context,
    );
    const fingerprint = buildTopicFingerprint(normalized);
    const duplicate = await this.prisma.listeningTopic.findFirst({
      select: { id: true },
      where: {
        brandId: context.brandId,
        fingerprint,
        id: { not: id },
        isDeleted: false,
        organizationId: context.organizationId,
      },
    });

    if (duplicate) {
      throw new ConflictException(
        'An equivalent listening topic already exists for this brand',
      );
    }

    const existingSourceIds = new Set(
      existing.sources.map(({ sourceId }) => sourceId),
    );
    const requestedSourceIds = new Set(normalized.sourceIds);
    const addedSources = sources.filter(
      ({ id: sourceId }) => !existingSourceIds.has(sourceId),
    );
    const removedSourceIds = existing.sources
      .map(({ sourceId }) => sourceId)
      .filter((sourceId) => !requestedSourceIds.has(sourceId));

    return (await this.prisma.listeningTopic.update({
      data: {
        auditedAt: new Date(),
        description: normalized.description,
        excludedKeywords: normalized.excludedKeywords,
        fingerprint,
        freshnessHours: normalized.freshnessHours,
        isActive: normalized.isActive,
        keywords: normalized.keywords,
        label: normalized.label,
        languages: normalized.languages,
        ...((addedSources.length > 0 || removedSourceIds.length > 0) && {
          sources: {
            ...(addedSources.length > 0 && {
              create: addedSources.map((source) => ({
                brandId: context.brandId,
                organizationId: context.organizationId,
                platform: source.platform,
                sourceId: source.id,
              })),
            }),
            ...(removedSourceIds.length > 0 && {
              deleteMany: { sourceId: { in: removedSourceIds } },
            }),
          },
        }),
      },
      include: topicInclude,
      where: { id },
    })) as unknown as ListeningTopicDocument;
  }

  async removeScoped(
    id: string,
    context: ListeningScope,
  ): Promise<ListeningTopicDocument> {
    await this.findOneScoped(id, context);
    return (await this.prisma.listeningTopic.update({
      data: { isActive: false, isDeleted: true },
      include: topicInclude,
      where: { id },
    })) as unknown as ListeningTopicDocument;
  }

  async listEvidence(
    topicId: string,
    context: ListeningScope,
    query: ListeningEvidenceQueryDto,
  ) {
    await this.findOneScoped(topicId, context);
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 25));
    const where = {
      brandId: context.brandId,
      eventType: query.eventType,
      isDeleted: query.isDeleted ?? false,
      organizationId: context.organizationId,
      topicId,
      ...(query.source && {
        topicSource: { sourceId: query.source },
      }),
    };
    const [docs, total] = await Promise.all([
      this.prisma.listeningEvidence.findMany({
        orderBy: { occurredAt: 'desc' },
        ...(query.pagination === false
          ? {}
          : { skip: (page - 1) * limit, take: limit }),
        where,
      }),
      this.prisma.listeningEvidence.count({ where }),
    ]);

    return {
      docs: docs as unknown as ListeningEvidenceDocument[],
      limit,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      total,
    };
  }

  private async resolveAuthorizedSources(
    sourceIds: string[],
    context: ListeningScope,
  ): Promise<
    Array<{ id: string; platform: ListeningSourcePlatform | string }>
  > {
    const sources = await this.prisma.socialSource.findMany({
      select: { id: true, platform: true },
      where: {
        brandId: context.brandId,
        id: { in: sourceIds },
        isActive: true,
        isDeleted: false,
        organizationId: context.organizationId,
      },
    });

    if (sources.length !== sourceIds.length) {
      throw new BadRequestException(
        'One or more listening sources are unavailable for this brand',
      );
    }

    const supportedPlatforms = new Set<string>(
      Object.values(ListeningSourcePlatform),
    );
    const unsupportedSource = sources.find(
      ({ platform }) => !supportedPlatforms.has(platform),
    );
    if (unsupportedSource) {
      throw new BadRequestException(
        `Listening source platform is not supported: ${unsupportedSource.platform}`,
      );
    }

    return sources.sort((left, right) => left.id.localeCompare(right.id));
  }
}

function normalizeTopicContract(
  input: CreateListeningTopicDto,
): NormalizedTopicContract {
  const keywords = normalizeValues(input.keywords);
  if (!keywords.length) {
    throw new BadRequestException(
      'A listening topic requires at least one keyword',
    );
  }

  const sourceIds = [...new Set(input.sourceIds.map((id) => id.trim()))].sort();
  if (!sourceIds.length) {
    throw new BadRequestException(
      'A listening topic requires at least one authorized source',
    );
  }

  const label = input.label.trim();
  if (!label) {
    throw new BadRequestException('Listening topic label cannot be empty');
  }

  return {
    description: input.description?.trim() || null,
    excludedKeywords: normalizeValues(input.excludedKeywords ?? []),
    freshnessHours: input.freshnessHours ?? 24,
    isActive: input.isActive ?? true,
    keywords,
    label,
    languages: normalizeValues(input.languages ?? []),
    sourceIds,
  };
}

function normalizeValues(values: string[]): string[] {
  return [
    ...new Set(
      values.map((value) => value.trim().toLocaleLowerCase()).filter(Boolean),
    ),
  ].sort();
}

function buildTopicFingerprint(contract: NormalizedTopicContract): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        excludedKeywords: contract.excludedKeywords,
        freshnessHours: contract.freshnessHours,
        keywords: contract.keywords,
        languages: contract.languages,
        sourceIds: contract.sourceIds,
      }),
    )
    .digest('hex');
}
