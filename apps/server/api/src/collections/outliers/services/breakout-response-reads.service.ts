import { readBreakoutLiveCapacity } from '@api/collections/outliers/services/breakout-live-capacity.util';
import { readBreakoutOutputRecovery } from '@api/collections/outliers/services/breakout-output-recovery.util';
import { loadBreakoutPublication } from '@api/collections/outliers/services/breakout-publication-source.util';
import type {
  BreakoutResponseListQuery,
  BreakoutResponseReadActor,
  BreakoutResponseReadPage,
} from '@api/collections/outliers/services/breakout-response-reads.types';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { BrandedGenerationReceiptAccessService } from '@api/services/branded-generation-receipts/branded-generation-receipt-access.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { isPlatform } from '@genfeedai/contracts';
import type { BreakoutResponseView } from '@genfeedai/contracts/interfaces';
import type { BreakoutResponse, Prisma } from '@genfeedai/prisma';
import { BadRequestException, Injectable } from '@nestjs/common';
import { z } from 'zod';

const number = z.number().finite().nonnegative();
const triggerSchema = z.object({
  status: z.literal('breakout'),
  ratio: number.nullable(),
  median: number.nullable(),
  targetValue: number.nullable(),
  sampleSize: z.number().int().nonnegative().max(50),
  source: z.string().min(1).max(2048).nullable(),
  exposureScope: z
    .enum(['organic', 'paid', 'aggregate', 'unknown'])
    .nullable()
    .optional(),
  timeBasis: z.enum(['provider_as_of', 'collection_interval']),
});

/** Manual authenticated reads only; this service never resolves an automatic actor. */
@Injectable()
export class BreakoutResponseReadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BrandedGenerationReceiptAccessService,
  ) {}

  async list(
    actor: BreakoutResponseReadActor,
    query: BreakoutResponseListQuery,
  ): Promise<BreakoutResponseReadPage> {
    const page = query.page ?? 1,
      limit = query.limit ?? 20;
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > 1_000_000 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      throw new BadRequestException('breakout_query_invalid');
    return this.prisma.$transaction(
      async (tx) => {
        await this.access.assertBrand(actor, tx);
        const where = {
          organizationId: actor.organizationId,
          brandId: actor.brandId,
          isDeleted: false,
          ...(query.credentialId ? { credentialId: query.credentialId } : {}),
        };
        const rows = await tx.breakoutResponse.findMany({
          where,
          orderBy: [{ detectedAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * limit,
          take: limit,
        });
        const totalDocs = await tx.breakoutResponse.count({ where });
        const docs: BreakoutResponseView[] = [];
        for (const row of rows) docs.push(await this.project(tx, row, false));
        return {
          docs,
          page,
          limit,
          totalDocs,
          totalPages: Math.ceil(totalDocs / limit),
        };
      },
      { maxWait: 10_000, timeout: 60_000 },
    );
  }

  async detail(
    actor: BreakoutResponseReadActor,
    id: string,
    strategyId?: string,
  ): Promise<BreakoutResponseView> {
    return this.prisma.$transaction(
      async (tx) => {
        await this.access.assertBrand(actor, tx);
        const row = await tx.breakoutResponse.findFirst({
          where: {
            id,
            organizationId: actor.organizationId,
            brandId: actor.brandId,
            isDeleted: false,
          },
        });
        if (!row) throw new NotFoundException('Breakout response');
        return this.project(tx, row, true, strategyId);
      },
      { maxWait: 10_000, timeout: 60_000 },
    );
  }

  private async project(
    tx: Prisma.TransactionClient,
    row: BreakoutResponse,
    detail: boolean,
    strategyId?: string,
  ): Promise<BreakoutResponseView> {
    const readAt = new Date();
    const platform = isPlatform(row.platform) ? row.platform : null;
    const source = platform
      ? await loadBreakoutPublication(tx, {
          organizationId: row.organizationId,
          brandId: row.brandId,
          credentialId: row.credentialId,
          platform,
          postId: row.sourcePostId,
          nativeSourcePostId: row.nativeSourcePostId,
          externalId: row.externalId,
        })
      : null;
    const current =
      source !== null &&
      !source.isResponse &&
      source.logicalPostId === row.logicalPostId &&
      source.contentDigest === row.contentDigest &&
      source.publicationFingerprint === row.publicationFingerprint;
    const receipt = await tx.breakoutBaselineReceipt.findFirst({
      where: {
        id: row.triggerReceiptId,
        organizationId: row.organizationId,
        brandId: row.brandId,
        credentialId: row.credentialId,
        platform: row.platform,
        isDeleted: false,
      },
      select: {
        id: true,
        format: true,
        metric: true,
        evaluatedAt: true,
        evaluation: true,
      },
    });
    const trigger = triggerSchema.safeParse(receipt?.evaluation);
    const outputs: NonNullable<BreakoutResponseView['outputs']> = [];
    let registryStatus: BreakoutResponseView['outputRegistryStatus'] =
      'not_loaded';
    if (detail) {
      const slots = await tx.breakoutResponseOutput.findMany({
        where: {
          responseId: row.id,
          organizationId: row.organizationId,
          brandId: row.brandId,
          credentialId: row.credentialId,
          isDeleted: false,
        },
        orderBy: { ordinal: 'asc' },
        take: 6,
        select: { id: true, ordinal: true, kind: true, format: true },
      });
      const valid =
        platform &&
        slots.length <= 5 &&
        (row.outputPlanFingerprint === null
          ? slots.length === 0
          : slots.length > 0) &&
        slots.every(
          (slot, index) =>
            slot.ordinal === index + 1 &&
            ['text', 'image', 'carousel', 'video', 'short', 'thread'].includes(
              slot.format,
            ) &&
            (slot.kind === 'follow_up' ||
              (slot.kind === 'quote' &&
                slot.ordinal === 1 &&
                slot.format === 'text' &&
                platform === 'twitter')),
        );
      registryStatus = valid ? 'current' : 'conflict';
      if (valid && platform)
        for (const slot of slots)
          outputs.push({
            ...slot,
            recovery: await readBreakoutOutputRecovery(tx, {
              organizationId: row.organizationId,
              brandId: row.brandId,
              credentialId: row.credentialId,
              platform,
              responseId: row.id,
              outputId: slot.id,
            }),
          });
    }
    return {
      id: row.id,
      organizationId: row.organizationId,
      brandId: row.brandId,
      credentialId: row.credentialId,
      platform: row.platform,
      state: row.state,
      detectedAt: row.detectedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      isDeleted: false,
      source: {
        kind:
          Boolean(row.sourcePostId) === Boolean(row.nativeSourcePostId)
            ? 'unavailable'
            : row.sourcePostId
              ? 'post'
              : 'native_source_post',
        id: row.sourcePostId ?? row.nativeSourcePostId,
        externalId: row.externalId,
        logicalPostId: row.logicalPostId,
        format: receipt?.format ?? null,
        publishedAt: source?.publishedAt ?? null,
        status: current ? 'current' : 'changed_or_unavailable',
      },
      trigger:
        receipt && trigger.success
          ? {
              receiptId: receipt.id,
              metric: receipt.metric,
              evaluatedAt: receipt.evaluatedAt.toISOString(),
              ratio: trigger.data.ratio,
              median: trigger.data.median,
              sampleSize: trigger.data.sampleSize,
              targetValue: trigger.data.targetValue,
              metricSource: trigger.data.source,
              exposureScope: trigger.data.exposureScope ?? null,
              timeBasis: trigger.data.timeBasis,
            }
          : null,
      outputs: detail ? outputs : null,
      outputRegistryStatus: registryStatus,
      capacity:
        strategyId && platform
          ? await readBreakoutLiveCapacity(tx, {
              organizationId: row.organizationId,
              brandId: row.brandId,
              credentialId: row.credentialId,
              platform,
              strategyId,
              nowMs: readAt.getTime(),
            })
          : null,
      readAt: readAt.toISOString(),
    };
  }
}
