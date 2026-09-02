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
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
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
import { BadRequestException, Injectable } from '@nestjs/common';

const RSS_SCHEDULE_DELAY_MS = 5 * 60 * 1000;

const SIGNATURE_SELECT = {
  body: true,
  id: true,
  isEnabled: true,
  platforms: true,
} as const;

export type RssSourceWorkflowRequest = RssSourceScope & { sourceId: string };

export type RssItemWorkflowRequest = {
  channels: RssTargetChannel[];
  context: RssSourceScope;
  item: ParsedRssFeedItem;
  signatures: StoredPostingSignatureRow[];
  source: StoredRssSourceRow;
};

export type RssItemClaim = RssItemWorkflowRequest & {
  itemRowId: string;
  outcome?: 'skipped';
  shouldImport: boolean;
  shouldPublish: boolean;
  targets: ChannelTargetInput[];
};

export type RssItemRelease = RssItemClaim & { releaseId: string };

@Injectable()
export class RssSourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly postGroupsService: PostGroupsService,
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

  async fetchWorkflowItems(
    request: RssSourceWorkflowRequest,
  ): Promise<{ items: RssItemWorkflowRequest[] }> {
    const source = await this.requireRow(request.sourceId, request);
    const channels = parseStoredTargetChannels(source.targetChannels);
    const xml = await this.fetchFeedXml(source.feedUrl);
    const items = parseRssFeed(xml);
    const signatures = await this.loadSignatures(
      channels,
      request.organizationId,
    );
    return {
      items: items.map((item) => ({
        channels,
        context: {
          ...(request.brandId ? { brandId: request.brandId } : {}),
          organizationId: request.organizationId,
          userId: request.userId,
        },
        item,
        signatures,
        source,
      })),
    };
  }

  async claimWorkflowItem(
    request: RssItemWorkflowRequest,
  ): Promise<RssItemClaim> {
    const { channels, item, signatures, source } = request;
    const existing = await this.prisma.rssFeedItem.findFirst({
      where: scopedWhere(source.organizationId, {
        guid: item.guid,
        rssSourceId: source.id,
      }),
    });

    if (existing?.status === RssFeedItemStatus.IMPORTED) {
      return {
        ...request,
        itemRowId: existing.id,
        outcome: 'skipped',
        shouldImport: false,
        shouldPublish: false,
        targets: [],
      };
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
        where: scopedWhere(source.organizationId, { id: itemRow.id }),
      });
      return {
        ...request,
        itemRowId: itemRow.id,
        outcome: 'skipped',
        shouldImport: false,
        shouldPublish: false,
        targets,
      };
    }
    return {
      ...request,
      itemRowId: itemRow.id,
      shouldImport: true,
      shouldPublish:
        source.importPolicy === RssImportPolicy.PUBLISH_NOW &&
        source.approvalMode === RssApprovalMode.AUTO,
      targets,
    };
  }

  async createWorkflowRelease(claim: RssItemClaim): Promise<RssItemRelease> {
    const { context, item, source } = claim;
    const scheduledDate = this.resolveScheduledDate(source);
    const release = await this.postGroupsService.create(
      context.organizationId,
      context.userId,
      {
        baseContent: this.buildBaseContent(item),
        ...(source.brandId ? { brandId: source.brandId } : {}),
        idempotencyKey: rssItemDedupeKey(source.id, item),
        rssFeedItemId: claim.itemRowId,
        rssSourceId: source.id,
        ...(scheduledDate ? { scheduledDate } : {}),
        status: this.resolveReleaseStatus(source),
        targets: claim.targets,
        timezone: source.timezone,
        title: item.title,
      },
      rssItemDedupeKey(source.id, item),
      { source: 'rss' },
    );
    return { ...claim, releaseId: release.id };
  }

  async publishWorkflowRelease(
    release: RssItemRelease,
  ): Promise<RssItemRelease> {
    await this.postGroupsService.publishNow(
      release.context.organizationId,
      release.context.userId,
      release.releaseId,
    );
    return release;
  }

  async finalizeWorkflowItem(
    request: RssItemWorkflowRequest,
    outcome: RssItemClaim | RssItemRelease | undefined,
    failure?: unknown,
  ): Promise<{ outcome: 'failed' | 'imported' | 'skipped' }> {
    // The claim node owns the row identity; only a failure raised before the
    // claim ran has to fall back to the feed guid to find the row.
    const itemRowId =
      outcome?.itemRowId ??
      (
        await this.prisma.rssFeedItem.findFirst({
          select: { id: true },
          where: scopedWhere(request.source.organizationId, {
            guid: request.item.guid,
            rssSourceId: request.source.id,
          }),
        })
      )?.id;
    if (!itemRowId) throw new Error('RSS feed item claim is missing');
    if (failure) {
      await this.prisma.rssFeedItem.update({
        data: {
          error: errorMessage(failure),
          status: RssFeedItemStatus.FAILED,
        },
        where: scopedWhere(request.source.organizationId, { id: itemRowId }),
      });
      return { outcome: 'failed' };
    }
    if (outcome?.outcome === 'skipped') {
      return { outcome: 'skipped' };
    }
    const releaseId =
      outcome && 'releaseId' in outcome ? outcome.releaseId : null;
    if (!releaseId)
      throw new Error('RSS item finalization is missing a release');
    await this.prisma.rssFeedItem.update({
      data: {
        error: null,
        postGroupId: releaseId,
        status: RssFeedItemStatus.IMPORTED,
      },
      where: scopedWhere(request.source.organizationId, { id: itemRowId }),
    });
    return { outcome: 'imported' };
  }

  async finalizeWorkflowSource(
    request: RssSourceWorkflowRequest,
    results: unknown,
    failure?: unknown,
  ): Promise<RssSourceDocument> {
    const source = await this.requireRow(request.sourceId, request);
    const outcomes = this.readWorkflowOutcomes(results);
    const updated = await this.delegate().update({
      data: {
        failedCount: { increment: failure ? 1 : outcomes.failed },
        importedCount: { increment: outcomes.imported },
        lastError: failure ? errorMessage(failure) : null,
        lastPolledAt: new Date(),
        skippedCount: { increment: outcomes.skipped },
      },
      where: scopedWhere(request.organizationId, { id: source.id }),
    });
    return this.toDocument(updated);
  }

  private readWorkflowOutcomes(results: unknown): {
    failed: number;
    imported: number;
    skipped: number;
  } {
    const rows =
      results && typeof results === 'object' && 'results' in results
        ? (results as { results?: unknown }).results
        : undefined;
    if (!Array.isArray(rows)) return { failed: 0, imported: 0, skipped: 0 };
    const totals = { failed: 0, imported: 0, skipped: 0 };
    for (const row of rows) {
      const result =
        row && typeof row === 'object' && 'result' in row
          ? (row as { result?: unknown }).result
          : undefined;
      const outcome =
        result && typeof result === 'object' && 'outcome' in result
          ? (result as { outcome?: unknown }).outcome
          : undefined;
      if (
        outcome === 'failed' ||
        outcome === 'imported' ||
        outcome === 'skipped'
      ) {
        totals[outcome] += 1;
      }
    }
    return totals;
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
