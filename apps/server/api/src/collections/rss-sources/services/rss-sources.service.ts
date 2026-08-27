import { PostGroupsService } from '@api/collections/post-groups/services/post-groups.service';
import type { CreateRssSourceDto } from '@api/collections/rss-sources/dto/create-rss-source.dto';
import type { RssSourcesQueryDto } from '@api/collections/rss-sources/dto/rss-sources-query.dto';
import type { UpdateRssSourceDto } from '@api/collections/rss-sources/dto/update-rss-source.dto';
import type {
  RssSourceDocument,
  RssSourceScope,
} from '@api/collections/rss-sources/schemas/rss-source.schema';
import {
  errorMessage,
  parseCreateRssSourceInput,
  parseStoredTargetChannels,
  parseUpdateRssSourceInput,
  type StoredPostingSignatureRow,
  type StoredRssSourceRow,
  toCredentialPlatform,
} from '@api/collections/rss-sources/services/rss-source-persistence.helpers';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  type ParsedRssFeedItem,
  parseRssFeed,
  type RssTargetChannel,
  rssItemDedupeKey,
} from '@api-types/contracts/rss-sources.contract';
import type { ChannelTargetInput } from '@api-types/contracts/scheduler.contract';
import {
  PostVisibility,
  parseRssApprovalMode,
  parseRssImportPolicy,
  ReleaseAttachmentKind,
  ReleaseStatus,
  RssApprovalMode,
  RssFeedItemStatus,
  RssImportPolicy,
} from '@genfeedai/enums';
import { toPrismaJson } from '@genfeedai/prisma';
import { scopedWhere } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

const RSS_SCHEDULE_DELAY_MS = 5 * 60 * 1000;

const SIGNATURE_SELECT = {
  body: true,
  id: true,
  isEnabled: true,
  platforms: true,
} as const;

@Injectable()
export class RssSourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly postGroupsService: PostGroupsService,
    private readonly logger: LoggerService,
  ) {}

  async createScoped(
    dto: CreateRssSourceDto,
    context: RssSourceScope,
  ): Promise<RssSourceDocument> {
    const input = parseCreateRssSourceInput(dto);
    const created = await this.delegate().create({
      data: {
        approvalMode: input.approvalMode ?? RssApprovalMode.APPROVAL,
        brandId: input.brandId ?? context.brandId ?? null,
        feedUrl: input.feedUrl,
        importPolicy: input.importPolicy ?? RssImportPolicy.DRAFT,
        isEnabled: input.isEnabled ?? true,
        label: input.label,
        organizationId: context.organizationId,
        targetChannels: toPrismaJson(input.targetChannels),
        timezone: input.timezone ?? 'UTC',
        userId: context.userId,
      },
    });
    return this.toDocument(created);
  }

  async findAllScoped(context: RssSourceScope, query: RssSourcesQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const where = scopedWhere(context.organizationId, {
      ...(query.brandId ? { brandId: query.brandId } : {}),
      ...(query.isEnabled === undefined ? {} : { isEnabled: query.isEnabled }),
      ...(query.label ? { label: query.label } : {}),
    });
    const [docs, total] = await Promise.all([
      this.delegate().findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.delegate().count({ where }),
    ]);

    return {
      docs: docs.map((row) => this.toDocument(row)),
      limit,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      total,
    };
  }

  async findOneScoped(
    id: string,
    context: RssSourceScope,
  ): Promise<RssSourceDocument> {
    const row = await this.requireRow(id, context);
    return this.toDocument(row);
  }

  async updateScoped(
    id: string,
    dto: UpdateRssSourceDto,
    context: RssSourceScope,
  ): Promise<RssSourceDocument> {
    const existing = await this.requireRow(id, context);
    const input = parseUpdateRssSourceInput(dto);
    const updated = await this.delegate().update({
      data: {
        ...(input.approvalMode === undefined
          ? {}
          : { approvalMode: input.approvalMode }),
        ...(input.brandId === undefined ? {} : { brandId: input.brandId }),
        ...(input.feedUrl === undefined ? {} : { feedUrl: input.feedUrl }),
        ...(input.importPolicy === undefined
          ? {}
          : { importPolicy: input.importPolicy }),
        ...(input.isEnabled === undefined
          ? {}
          : { isEnabled: input.isEnabled }),
        ...(input.label === undefined ? {} : { label: input.label }),
        ...(input.targetChannels === undefined
          ? {}
          : { targetChannels: toPrismaJson(input.targetChannels) }),
        ...(input.timezone === undefined ? {} : { timezone: input.timezone }),
      },
      where: scopedWhere(context.organizationId, { id: existing.id }),
    });
    return this.toDocument(updated);
  }

  async removeScoped(id: string, context: RssSourceScope): Promise<void> {
    const existing = await this.requireRow(id, context);
    await this.delegate().update({
      data: { isDeleted: true },
      where: scopedWhere(context.organizationId, { id: existing.id }),
    });
  }

  async listEnabledForSweep(): Promise<StoredRssSourceRow[]> {
    const rows = await this.delegate().findMany({
      orderBy: { createdAt: 'asc' },
      where: { isDeleted: false, isEnabled: true },
    });
    return rows as StoredRssSourceRow[];
  }

  async pollSource(
    id: string,
    context: RssSourceScope,
  ): Promise<RssSourceDocument> {
    const source = await this.requireRow(id, context);
    const channels = parseStoredTargetChannels(source.targetChannels);

    let xml: string;
    try {
      xml = await this.fetchFeedXml(source.feedUrl);
    } catch (error: unknown) {
      return this.recordSourceFailure(source, context, errorMessage(error));
    }

    let items: ParsedRssFeedItem[];
    try {
      items = parseRssFeed(xml);
    } catch (error: unknown) {
      return this.recordSourceFailure(source, context, errorMessage(error));
    }

    const signatures = await this.loadSignatures(
      channels,
      context.organizationId,
    );
    let importedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const item of items) {
      try {
        const outcome = await this.importFeedItem({
          channels,
          context,
          item,
          signatures,
          source,
        });
        if (outcome === 'imported') {
          importedCount += 1;
        } else if (outcome === 'skipped') {
          skippedCount += 1;
        } else {
          failedCount += 1;
        }
      } catch (error: unknown) {
        failedCount += 1;
        this.logger.error('RSS feed item import failed', {
          error: errorMessage(error),
          guid: item.guid,
          sourceId: source.id,
        });
      }
    }

    const updated = await this.delegate().update({
      data: {
        failedCount: { increment: failedCount },
        importedCount: { increment: importedCount },
        lastError: null,
        lastPolledAt: new Date(),
        skippedCount: { increment: skippedCount },
      },
      where: scopedWhere(context.organizationId, { id: source.id }),
    });
    return this.toDocument(updated);
  }

  private async importFeedItem(params: {
    channels: RssTargetChannel[];
    context: RssSourceScope;
    item: ParsedRssFeedItem;
    signatures: StoredPostingSignatureRow[];
    source: StoredRssSourceRow;
  }): Promise<'imported' | 'skipped' | 'failed'> {
    const { channels, context, item, signatures, source } = params;
    const existing = await this.prisma.rssFeedItem.findFirst({
      where: {
        guid: item.guid,
        isDeleted: false,
        rssSourceId: source.id,
      },
    });

    if (existing?.status === RssFeedItemStatus.IMPORTED) {
      return 'skipped';
    }

    const itemRow =
      existing ??
      (await this.prisma.rssFeedItem.create({
        data: {
          brandId: source.brandId,
          guid: item.guid,
          imageUrl: item.imageUrl,
          organizationId: source.organizationId,
          publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
          rssSourceId: source.id,
          status: RssFeedItemStatus.PENDING,
          summary: item.summary,
          title: item.title,
          url: item.url,
          userId: source.userId,
        },
      }));

    const scheduledDate = this.resolveScheduledDate(source);
    const targets = this.toChannelTargets(
      channels,
      signatures,
      scheduledDate,
      source.timezone,
    );
    if (targets.length === 0) {
      await this.prisma.rssFeedItem.update({
        data: {
          error: 'No valid target channels.',
          status: RssFeedItemStatus.SKIPPED,
        },
        where: { id: itemRow.id },
      });
      return 'skipped';
    }

    const status = this.resolveReleaseStatus(source);
    const baseContent = this.buildBaseContent(item);

    try {
      const release = await this.postGroupsService.create(
        context.organizationId,
        context.userId,
        {
          baseContent,
          ...(source.brandId ? { brandId: source.brandId } : {}),
          idempotencyKey: rssItemDedupeKey(source.id, item),
          rssFeedItemId: itemRow.id,
          rssSourceId: source.id,
          ...(scheduledDate ? { scheduledDate } : {}),
          status,
          targets,
          timezone: source.timezone,
          title: item.title,
        },
        rssItemDedupeKey(source.id, item),
        { source: 'rss' },
      );

      if (
        source.importPolicy === RssImportPolicy.PUBLISH_NOW &&
        source.approvalMode === RssApprovalMode.AUTO
      ) {
        await this.postGroupsService.publishNow(
          context.organizationId,
          context.userId,
          release.id,
        );
      }

      await this.prisma.rssFeedItem.update({
        data: {
          error: null,
          postGroupId: release.id,
          status: RssFeedItemStatus.IMPORTED,
        },
        where: { id: itemRow.id },
      });
      return 'imported';
    } catch (error: unknown) {
      await this.prisma.rssFeedItem.update({
        data: {
          error: errorMessage(error),
          status: RssFeedItemStatus.FAILED,
        },
        where: { id: itemRow.id },
      });
      return 'failed';
    }
  }

  private resolveReleaseStatus(source: StoredRssSourceRow): ReleaseStatus {
    if (
      source.importPolicy === RssImportPolicy.DRAFT ||
      source.approvalMode === RssApprovalMode.APPROVAL
    ) {
      return ReleaseStatus.DRAFT;
    }

    if (
      source.importPolicy === RssImportPolicy.SCHEDULED &&
      source.approvalMode === RssApprovalMode.AUTO
    ) {
      return ReleaseStatus.SCHEDULED;
    }

    return ReleaseStatus.DRAFT;
  }

  private resolveScheduledDate(source: StoredRssSourceRow): string | undefined {
    if (
      source.importPolicy !== RssImportPolicy.SCHEDULED ||
      source.approvalMode !== RssApprovalMode.AUTO
    ) {
      return undefined;
    }
    return new Date(Date.now() + RSS_SCHEDULE_DELAY_MS).toISOString();
  }

  private buildBaseContent(item: ParsedRssFeedItem): string {
    const summary = item.summary?.trim() ?? '';
    if (summary && item.url) {
      return `${summary}\n\n${item.url}`;
    }
    return summary || item.url || item.title;
  }

  private toChannelTargets(
    channels: RssTargetChannel[],
    signatures: StoredPostingSignatureRow[],
    scheduledDate: string | undefined,
    timezone: string,
  ): ChannelTargetInput[] {
    const signatureById = new Map(
      signatures.map((signature) => [signature.id, signature]),
    );

    return channels.flatMap((channel, order) => {
      const platform = toCredentialPlatform(channel.platform);
      if (!platform) {
        return [];
      }

      const signature = channel.signatureId
        ? signatureById.get(channel.signatureId)
        : undefined;
      const attachments = signature?.isEnabled
        ? [
            {
              body: signature.body,
              kind: ReleaseAttachmentKind.SIGNATURE,
              order: 0,
              platform,
            },
          ]
        : undefined;

      return [
        {
          ...(attachments ? { attachments } : {}),
          credentialId: channel.credentialId,
          order,
          platform,
          ...(scheduledDate ? { scheduledDate } : {}),
          timezone,
          visibility: PostVisibility.PUBLIC,
        },
      ];
    });
  }

  private async loadSignatures(
    channels: RssTargetChannel[],
    organizationId: string,
  ): Promise<StoredPostingSignatureRow[]> {
    const signatureIds = channels.flatMap((channel) =>
      channel.signatureId ? [channel.signatureId] : [],
    );
    if (signatureIds.length === 0) {
      return [];
    }

    const rows = await this.prisma.postingSignature.findMany({
      select: SIGNATURE_SELECT,
      where: scopedWhere(organizationId, {
        id: { in: signatureIds },
        isEnabled: true,
      }),
    });
    return rows as StoredPostingSignatureRow[];
  }

  private async fetchFeedXml(feedUrl: string): Promise<string> {
    const response = await fetch(feedUrl, {
      headers: {
        Accept:
          'application/rss+xml, application/atom+xml, application/xml, text/xml',
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`Feed request failed with status ${response.status}.`);
    }
    return response.text();
  }

  private async recordSourceFailure(
    source: StoredRssSourceRow,
    context: RssSourceScope,
    lastError: string,
  ): Promise<RssSourceDocument> {
    const updated = await this.delegate().update({
      data: {
        failedCount: { increment: 1 },
        lastError,
        lastPolledAt: new Date(),
      },
      where: scopedWhere(context.organizationId, { id: source.id }),
    });
    return this.toDocument(updated);
  }

  private async requireRow(
    id: string,
    context: RssSourceScope,
  ): Promise<StoredRssSourceRow> {
    if (!context.organizationId) {
      throw new BadRequestException('Organization context is required');
    }
    const row = await this.delegate().findFirst({
      where: scopedWhere(context.organizationId, { id }),
    });
    if (!row) {
      throw new NotFoundException('RSS source', id);
    }
    return row as StoredRssSourceRow;
  }

  private toDocument(row: StoredRssSourceRow): RssSourceDocument {
    return {
      approvalMode: parseRssApprovalMode(row.approvalMode),
      brandId: row.brandId,
      createdAt: row.createdAt,
      failedCount: row.failedCount,
      feedUrl: row.feedUrl,
      id: row.id,
      importedCount: row.importedCount,
      importPolicy: parseRssImportPolicy(row.importPolicy),
      isDeleted: row.isDeleted,
      isEnabled: row.isEnabled,
      label: row.label,
      lastError: row.lastError,
      lastPolledAt: row.lastPolledAt,
      organizationId: row.organizationId,
      skippedCount: row.skippedCount,
      targetChannels: parseStoredTargetChannels(row.targetChannels),
      timezone: row.timezone,
      updatedAt: row.updatedAt,
      userId: row.userId,
    };
  }

  private delegate() {
    return this.prisma.rssSource;
  }
}
