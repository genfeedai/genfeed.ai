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
import {
  CACHE_PATTERNS,
  CACHE_TAGS,
} from '@api/common/constants/cache-patterns.constants';
import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ListeningSourcePlatform } from '@genfeedai/enums';
import {
  type IAuthorizedListeningSource,
  type IListeningScope,
  type INormalizedListeningTopicContract,
  LISTENING_CONTRACT_VERSION,
} from '@genfeedai/interfaces';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

const topicInclude = {
  sources: {
    orderBy: { createdAt: 'asc' as const },
    where: { isDeleted: false },
  },
} as const;

const FINGERPRINT_UNIQUE_CONSTRAINT = 'listening_topics_scope_fingerprint_key';

@Injectable()
export class ListeningTopicsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheInvalidationService: CacheInvalidationService,
  ) {}

  async createScoped(
    dto: CreateListeningTopicDto,
    context: Required<IListeningScope>,
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
      const created = (await this.prisma.listeningTopic.create({
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
              platform: source.platform,
              sourceId: source.id,
            })),
          },
          userId: context.userId,
        },
        include: topicInclude,
      })) as unknown as ListeningTopicDocument;
      await this.invalidateTopicCaches(context.organizationId, created.id);
      return created;
    } catch (error) {
      if (!isFingerprintUniqueViolation(error)) {
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

      await this.invalidateTopicCaches(
        context.organizationId,
        concurrentWinner.id,
      );
      return concurrentWinner as unknown as ListeningTopicDocument;
    }
  }

  async findAllScoped(
    context: IListeningScope,
    query: ListeningTopicsQueryDto,
  ) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 25));
    const search = query.search?.trim();
    const where = {
      brandId: context.brandId,
      isActive: query.isActive,
      isDeleted: query.isDeleted ?? false,
      organizationId: context.organizationId,
      ...(query.source && {
        sources: {
          some: {
            isDeleted: false,
            sourceId: query.source,
          },
        },
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
    context: IListeningScope,
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
    context: IListeningScope,
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

    try {
      const updated = (await this.prisma.listeningTopic.update({
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
                upsert: addedSources.map((source) => ({
                  create: {
                    platform: source.platform,
                    sourceId: source.id,
                  },
                  update: {
                    isDeleted: false,
                    platform: source.platform,
                  },
                  where: {
                    topicId_sourceId: {
                      sourceId: source.id,
                      topicId: id,
                    },
                  },
                })),
              }),
              ...(removedSourceIds.length > 0 && {
                updateMany: {
                  data: { isDeleted: true },
                  where: {
                    isDeleted: false,
                    sourceId: { in: removedSourceIds },
                  },
                },
              }),
            },
          }),
        },
        include: topicInclude,
        where: activeTopicWriteWhere(id, context),
      })) as unknown as ListeningTopicDocument;
      await this.invalidateTopicCaches(context.organizationId, id);
      return updated;
    } catch (error) {
      if (isFingerprintUniqueViolation(error)) {
        throw new ConflictException(
          'An equivalent listening topic already exists for this brand',
        );
      }
      if (isRecordNotFoundError(error)) {
        throw new NotFoundException({ message: 'Listening topic not found' });
      }
      throw error;
    }
  }

  async removeScoped(
    id: string,
    context: IListeningScope,
  ): Promise<ListeningTopicDocument> {
    await this.findOneScoped(id, context);
    let removed: ListeningTopicDocument;
    try {
      removed = (await this.prisma.listeningTopic.update({
        data: { isActive: false, isDeleted: true },
        include: topicInclude,
        where: activeTopicWriteWhere(id, context),
      })) as unknown as ListeningTopicDocument;
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw new NotFoundException({ message: 'Listening topic not found' });
      }
      throw error;
    }
    await this.invalidateTopicCaches(context.organizationId, id);
    return removed;
  }

  async listEvidence(
    topicId: string,
    context: IListeningScope,
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
      topicSource: {
        isDeleted: false,
        ...(query.source && {
          sourceId: query.source,
        }),
      },
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
    context: IListeningScope,
  ): Promise<IAuthorizedListeningSource[]> {
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

    return sources
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((source) => ({
        ...source,
        platform: source.platform as ListeningSourcePlatform,
      }));
  }

  private async invalidateTopicCaches(
    organizationId: string,
    topicId: string,
  ): Promise<void> {
    await Promise.all([
      this.cacheInvalidationService.invalidate(
        CACHE_PATTERNS.LISTENING_TOPICS_LIST(organizationId),
        CACHE_PATTERNS.LISTENING_TOPICS_SINGLE(topicId),
      ),
      this.cacheInvalidationService.invalidateByTags([
        CACHE_TAGS.LISTENING_TOPICS,
      ]),
    ]);
  }
}

function normalizeTopicContract(
  input: CreateListeningTopicDto,
): INormalizedListeningTopicContract {
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

function buildTopicFingerprint(
  contract: INormalizedListeningTopicContract,
): string {
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

function activeTopicWriteWhere(id: string, context: IListeningScope) {
  return {
    brandId: context.brandId,
    id,
    isDeleted: false,
    organizationId: context.organizationId,
  };
}

function isFingerprintUniqueViolation(error: unknown): boolean {
  const candidate = error as {
    code?: unknown;
    meta?: { target?: unknown };
  };
  if (candidate?.code !== 'P2002') {
    return false;
  }

  const target = candidate.meta?.target;
  if (typeof target === 'string') {
    return (
      target === FINGERPRINT_UNIQUE_CONSTRAINT ||
      (target.includes('fingerprint') &&
        target.includes('brand') &&
        target.includes('organization'))
    );
  }

  return (
    Array.isArray(target) &&
    target.includes('organizationId') &&
    target.includes('brandId') &&
    target.includes('fingerprint')
  );
}

function isRecordNotFoundError(error: unknown): boolean {
  return (error as { code?: unknown })?.code === 'P2025';
}
