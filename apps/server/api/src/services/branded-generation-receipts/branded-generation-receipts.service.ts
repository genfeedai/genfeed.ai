import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { BrandedGenerationJsonV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import {
  canonicalizeBrandedGenerationJsonV1,
  hashBrandedGenerationOperationV1,
  hashBrandedGenerationRequestV1,
  hashBrandedGenerationResolutionV1,
  hashBrandedGenerationTextV1,
  hashBrandIdentitySnapshotV1,
} from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import { BrandedGenerationPromptStoreService } from '@api/services/branded-generation-receipts/branded-generation-prompt-store.service';
import { BrandedGenerationReceiptAccessService } from '@api/services/branded-generation-receipts/branded-generation-receipt-access.service';
import type {
  BrandedGenerationActorV1,
  BrandedGenerationMutationResultV1,
  BrandedGenerationMutationV1,
  BrandedGenerationPromptReadV1,
  BrandedGenerationPromptStageV1,
  BrandedGenerationReceiptHistoryV1,
  BrandedGenerationReceiptPageV1,
} from '@api/services/branded-generation-receipts/branded-generation-receipts.types';
import {
  type BrandedGenerationOperationKindV1,
  canTransitionBrandedGenerationStateV1,
} from '@api/services/branded-generation-receipts/branded-generation-state.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  brandedGenerationInputV1Schema,
  brandedGenerationReceiptV1Schema,
  brandedGenerationResolutionV1Schema,
} from '@genfeedai/contracts/api-types/contracts';
import type {
  BrandedGenerationInputV1,
  BrandedGenerationReceiptV1,
  BrandedGenerationResolutionV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import { type Prisma, toPrismaJson } from '@genfeedai/prisma';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { z } from 'zod';

const cursorSchema = z.strictObject({
  createdAt: z.iso.datetime(),
  id: z.string().min(1).max(256),
});
const mutationSchema = z.strictObject({
  operationKey: z
    .string()
    .min(1)
    .max(256)
    .refine((value) =>
      [...value].every((char) => {
        const code = char.charCodeAt(0);
        return code > 31 && (code < 127 || code > 159);
      }),
    ),
  expectedRevision: z.number().int().nonnegative().max(2147483647),
});
@Injectable()
export class BrandedGenerationReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BrandedGenerationReceiptAccessService,
    private readonly prompts: BrandedGenerationPromptStoreService,
  ) {}
  private transaction<T>(
    run: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(run, {
      isolationLevel: 'ReadCommitted',
      maxWait: 5000,
      timeout: 10000,
    });
  }
  private parse(value: unknown): BrandedGenerationReceiptV1 {
    const parsed = brandedGenerationReceiptV1Schema.safeParse(value);
    if (!parsed.success)
      throw new InternalServerErrorException('receipt_integrity_failed');
    return parsed.data;
  }
  private counter(value: number): void {
    if (!Number.isSafeInteger(value) || value < 0 || value > 2147483647)
      throw new BadRequestException('receipt_counter_out_of_range');
  }
  private limit(value: number): void {
    if (!Number.isInteger(value) || value < 1 || value > 100)
      throw new BadRequestException('receipt_limit_out_of_range');
  }
  private async lockBrand(
    tx: Prisma.TransactionClient,
    actor: BrandedGenerationActorV1,
  ) {
    const rows = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM brands WHERE id=${actor.brandId} AND "organizationId"=${actor.organizationId} AND "isDeleted"=false FOR KEY SHARE`;
    if (!rows.length) throw new ForbiddenException('receipt_access_denied');
    return this.access.assertBrand(actor, tx);
  }
  private async current(
    tx: Prisma.TransactionClient,
    actor: BrandedGenerationActorV1,
    id: string,
  ) {
    const row = await tx.brandedGenerationReceipt.findFirst({
      where: {
        id,
        organizationId: actor.organizationId,
        brandId: actor.brandId,
        isDeleted: false,
      },
    });
    if (!row) throw new NotFoundException({ message: 'receipt_not_found' });
    return this.parse(row.projection);
  }
  private creator(
    actor: BrandedGenerationActorV1,
    receipt: BrandedGenerationReceiptV1,
    isOwnerOrAdmin: boolean,
  ) {
    if (actor.actorId !== receipt.actorId && !isOwnerOrAdmin)
      throw new ForbiddenException('receipt_access_denied');
  }
  async create(
    value: BrandedGenerationInputV1,
  ): Promise<BrandedGenerationMutationResultV1> {
    const input = brandedGenerationInputV1Schema.parse(value);
    this.counter(input.candidateIndex);
    const actor = {
      organizationId: input.organizationId,
      brandId: input.brandId,
      actorId: input.actorId,
    };
    const requestHash = hashBrandedGenerationRequestV1(input);
    return this.transaction(async (tx) => {
      await this.lockBrand(tx, actor);
      const lock = canonicalizeBrandedGenerationJsonV1([
        'brand-generation-request-v1',
        actor.organizationId,
        actor.brandId,
        input.requestKey,
        input.candidateIndex,
      ]);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lock},0))`;
      // Tombstones participate in request uniqueness and cannot authorize another attempt.
      const existing = await tx.brandedGenerationReceipt.findFirst({
        where: {
          organizationId: actor.organizationId,
          brandId: actor.brandId,
          requestKey: input.requestKey,
          candidateIndex: input.candidateIndex,
        },
      });
      if (existing) {
        if (existing.isDeleted) throw new GoneException('receipt_deleted');
        const receipt = this.parse(existing.projection);
        if (
          receipt.requestHash !== requestHash ||
          [
            'parentRequestId',
            'runId',
            'workflowExecutionId',
            'generationId',
          ].some(
            (key) =>
              receipt[key as keyof BrandedGenerationReceiptV1] !==
              input[key as keyof BrandedGenerationInputV1],
          )
        )
          throw new ConflictException('request_payload_conflict');
        return { receipt, replayed: true };
      }
      const prepared = this.prompts.prepare(input.originalPrompt);
      const now = new Date().toISOString();
      const receipt = brandedGenerationReceiptV1Schema.parse({
        schemaVersion: 1,
        id: randomUUID(),
        ...actor,
        requestKey: input.requestKey,
        candidateIndex: input.candidateIndex,
        requestHash,
        revision: 0,
        state: 'created',
        mode: input.mode,
        surface: input.surface,
        contentType: input.contentType,
        format: input.format,
        platform: input.platform,
        parentRequestId: input.parentRequestId,
        runId: input.runId,
        workflowExecutionId: input.workflowExecutionId,
        generationId: input.generationId,
        createdAt: now,
        updatedAt: now,
        snapshot: null,
        resolutionHash: null,
        layers: [],
        learning: null,
        prompts: {
          original: prepared.reference,
          enhanced: null,
          compiled: null,
        },
        execution: null,
        artifact: null,
        validation: null,
        compliance: input.mode === 'raw' ? 'not_claimed' : 'unverified',
        diagnostics: [],
        costs: [],
        budget: {
          version: 'brand-enforcement-v1',
          maximumGenerationAttempts: 1,
          automaticPaidRetries: 0,
          generationAttemptsUsed: 0,
        },
        isDeleted: false,
      });
      await tx.brandedGenerationReceipt.create({
        data: {
          id: receipt.id,
          ...actor,
          requestKey: receipt.requestKey,
          candidateIndex: receipt.candidateIndex,
          requestHash,
          revision: 0,
          state: receipt.state,
          mode: receipt.mode,
          surface: receipt.surface,
          projection: toPrismaJson(receipt),
          createdAt: new Date(now),
          updatedAt: new Date(now),
        },
      });
      await this.prompts.persist(
        tx,
        actor,
        receipt.id,
        0,
        'original',
        prepared,
      );
      await this.event(tx, actor, receipt, 'create', requestHash, 'create');
      return { receipt, replayed: false };
    });
  }
  private async event(
    tx: Prisma.TransactionClient,
    actor: BrandedGenerationActorV1,
    receipt: BrandedGenerationReceiptV1,
    operationKey: string,
    operationHash: string,
    type: string,
  ) {
    await tx.brandedGenerationReceiptEvent.create({
      data: {
        id: randomUUID(),
        receiptId: receipt.id,
        organizationId: actor.organizationId,
        brandId: actor.brandId,
        actorId: actor.actorId,
        operationKey,
        operationHash,
        revision: receipt.revision,
        type,
        projection: toPrismaJson(receipt),
        isDeleted: receipt.isDeleted,
      },
    });
  }
  async get(
    actor: BrandedGenerationActorV1,
    id: string,
  ): Promise<BrandedGenerationReceiptV1> {
    return this.transaction(async (tx) => {
      await this.access.assertBrand(actor, tx);
      return this.current(tx, actor, id);
    });
  }
  async list(
    actor: BrandedGenerationActorV1,
    query: { limit: number; cursor?: string },
  ): Promise<BrandedGenerationReceiptPageV1> {
    this.limit(query.limit);
    let cursor: z.infer<typeof cursorSchema> | undefined;
    if (query.cursor) {
      try {
        cursor = cursorSchema.parse(
          JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')),
        );
        if (
          Buffer.from(canonicalizeBrandedGenerationJsonV1(cursor)).toString(
            'base64url',
          ) !== query.cursor
        )
          throw new Error('Invalid cursor');
      } catch {
        throw new BadRequestException('receipt_cursor_invalid');
      }
    }
    return this.transaction(async (tx) => {
      await this.access.assertBrand(actor, tx);
      const rows = await tx.brandedGenerationReceipt.findMany({
        where: {
          organizationId: actor.organizationId,
          brandId: actor.brandId,
          isDeleted: false,
          ...(cursor
            ? {
                OR: [
                  { createdAt: { lt: new Date(cursor.createdAt) } },
                  {
                    createdAt: new Date(cursor.createdAt),
                    id: { lt: cursor.id },
                  },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
      });
      const items = rows
        .slice(0, query.limit)
        .map((row) => this.parse(row.projection));
      const last = items.at(-1);
      return {
        items,
        nextCursor:
          rows.length > query.limit && last
            ? Buffer.from(
                canonicalizeBrandedGenerationJsonV1({
                  createdAt: last.createdAt,
                  id: last.id,
                }),
              ).toString('base64url')
            : null,
      };
    });
  }
  async history(
    actor: BrandedGenerationActorV1,
    id: string,
    query: { afterRevision?: number; limit: number },
  ): Promise<BrandedGenerationReceiptHistoryV1> {
    this.limit(query.limit);
    if (query.afterRevision !== undefined) this.counter(query.afterRevision);
    return this.transaction(async (tx) => {
      await this.access.assertBrand(actor, tx);
      await this.current(tx, actor, id);
      const rows = await tx.brandedGenerationReceiptEvent.findMany({
        where: {
          organizationId: actor.organizationId,
          brandId: actor.brandId,
          receiptId: id,
          isDeleted: false,
          revision: { gt: query.afterRevision ?? -1 },
        },
        orderBy: { revision: 'asc' },
        take: query.limit + 1,
      });
      const items = rows
        .slice(0, query.limit)
        .map((row) => this.parse(row.projection));
      return {
        items,
        nextAfterRevision:
          rows.length > query.limit ? (items.at(-1)?.revision ?? null) : null,
      };
    });
  }
  async readPrompt(
    actor: BrandedGenerationActorV1,
    id: string,
    stage: BrandedGenerationPromptStageV1,
    receiptRevision?: number,
  ): Promise<BrandedGenerationPromptReadV1> {
    if (!['original', 'enhanced', 'compiled'].includes(stage))
      throw new BadRequestException('prompt_stage_invalid');
    if (receiptRevision !== undefined) this.counter(receiptRevision);
    return this.transaction(async (tx) => {
      const permission = await this.access.assertBrand(actor, tx);
      let receipt = await this.current(tx, actor, id);
      this.creator(actor, receipt, permission.isOwnerOrAdmin);
      if (receiptRevision !== undefined) {
        const event = await tx.brandedGenerationReceiptEvent.findFirst({
          where: {
            receiptId: id,
            organizationId: actor.organizationId,
            brandId: actor.brandId,
            revision: receiptRevision,
            isDeleted: false,
          },
        });
        if (!event)
          throw new NotFoundException({ message: 'receipt_not_found' });
        receipt = this.parse(event.projection);
      }
      return this.prompts.read(tx, actor, receipt, stage);
    });
  }
  private async mutate(
    actor: BrandedGenerationActorV1,
    id: string,
    value: BrandedGenerationMutationV1,
    kind: BrandedGenerationOperationKindV1,
    body: BrandedGenerationJsonV1,
    apply: (
      tx: Prisma.TransactionClient,
      receipt: BrandedGenerationReceiptV1,
    ) => Promise<BrandedGenerationReceiptV1>,
  ): Promise<BrandedGenerationMutationResultV1> {
    this.counter(value.expectedRevision);
    const mutation = mutationSchema.parse(value);
    if (mutation.operationKey === 'create')
      throw new BadRequestException('receipt_operation_reserved');
    const operationHash = hashBrandedGenerationOperationV1(kind, body);
    return this.transaction(async (tx) => {
      const permission = await this.lockBrand(tx, actor);
      await tx.$queryRaw`SELECT id FROM branded_generation_receipts WHERE id=${id} AND "organizationId"=${actor.organizationId} AND "brandId"=${actor.brandId} FOR UPDATE`;
      // Scoped tombstone lookup is required solely for authorized exact delete replay.
      const row = await tx.brandedGenerationReceipt.findFirst({
        where: {
          id,
          organizationId: actor.organizationId,
          brandId: actor.brandId,
        },
      });
      if (!row) throw new NotFoundException({ message: 'receipt_not_found' });
      const current = this.parse(row.projection);
      this.creator(actor, current, permission.isOwnerOrAdmin);
      const prior = await tx.brandedGenerationReceiptEvent.findFirst({
        where: {
          receiptId: id,
          organizationId: actor.organizationId,
          brandId: actor.brandId,
          operationKey: mutation.operationKey,
          ...(!row.isDeleted ? { isDeleted: false } : {}),
        },
      });
      if (
        row.isDeleted &&
        !(
          kind === 'delete' &&
          prior?.type === 'delete' &&
          prior.actorId === actor.actorId &&
          prior.operationHash === operationHash
        )
      )
        throw new GoneException('receipt_deleted');
      if (prior) {
        if (
          prior.actorId !== actor.actorId ||
          prior.operationHash !== operationHash ||
          prior.type !== kind
        )
          throw new ConflictException('request_payload_conflict');
        return { receipt: this.parse(prior.projection), replayed: true };
      }
      if (current.revision !== mutation.expectedRevision)
        throw new ConflictException('receipt_version_conflict');
      this.counter(current.revision + 1);
      const changed = await apply(tx, current);
      const receipt = brandedGenerationReceiptV1Schema.parse({
        ...changed,
        revision: current.revision + 1,
        updatedAt: new Date().toISOString(),
      });
      await tx.brandedGenerationReceipt.update({
        where: {
          id,
          organizationId: actor.organizationId,
          brandId: actor.brandId,
          isDeleted: false,
        },
        data: {
          revision: receipt.revision,
          state: receipt.state,
          mode: receipt.mode,
          surface: receipt.surface,
          providerAttemptRef: receipt.execution?.providerAttemptRef ?? null,
          projection: toPrismaJson(receipt),
          isDeleted: receipt.isDeleted,
          updatedAt: new Date(receipt.updatedAt),
        },
      });
      await this.event(
        tx,
        actor,
        receipt,
        mutation.operationKey,
        operationHash,
        kind,
      );
      if (kind === 'delete') {
        await this.prompts.purge(tx, actor, id);
        await tx.brandedGenerationReceiptEvent.updateMany({
          where: {
            receiptId: id,
            organizationId: actor.organizationId,
            brandId: actor.brandId,
            isDeleted: false,
          },
          data: { isDeleted: true },
        });
      }
      return { receipt, replayed: false };
    });
  }
  async recordResolution(
    actor: BrandedGenerationActorV1,
    id: string,
    mutation: BrandedGenerationMutationV1,
    value: BrandedGenerationResolutionV1,
    enhancedPrompt?: string,
  ): Promise<BrandedGenerationMutationResultV1> {
    const resolution = brandedGenerationResolutionV1Schema.parse(value);
    if (
      resolution.snapshot &&
      hashBrandIdentitySnapshotV1(resolution.snapshot) !==
        resolution.snapshot.contentHash
    )
      throw new BadRequestException('brand_identity_snapshot_hash_mismatch');
    const resolutionHash = hashBrandedGenerationResolutionV1(resolution);
    const enhanced =
      enhancedPrompt !== undefined
        ? this.prompts.prepare(enhancedPrompt)
        : null;
    const compiled =
      resolution.status === 'resolved'
        ? this.prompts.prepare(resolution.compiledPrompt)
        : null;
    return this.mutate(
      actor,
      id,
      mutation,
      'resolve',
      {
        resolutionHash,
        enhancedPromptHash:
          enhancedPrompt === undefined
            ? null
            : hashBrandedGenerationTextV1(enhancedPrompt),
      },
      async (tx, current) => {
        if (
          current.mode !== resolution.mode ||
          (resolution.snapshot &&
            (resolution.snapshot.organizationId !== actor.organizationId ||
              resolution.snapshot.brandId !== actor.brandId))
        )
          throw new BadRequestException('receipt_resolution_scope_mismatch');
        if (
          resolution.status === 'resolved' &&
          resolution.originalPromptHash !== current.prompts.original.contentHash
        )
          throw new ConflictException('request_payload_conflict');
        const unavailable =
          current.prompts.original.retention !== 'retained' ||
          enhanced?.reference.retention === 'unavailable' ||
          compiled?.reference.retention === 'unavailable';
        const state = unavailable
          ? 'blocked'
          : resolution.status === 'resolved'
            ? 'resolved'
            : 'blocked';
        if (
          !canTransitionBrandedGenerationStateV1(
            current.state,
            state,
            'resolve',
          )
        )
          throw new ConflictException('receipt_state_conflict');
        const savedActor = { ...actor, actorId: current.actorId };
        if (enhanced)
          await this.prompts.persist(
            tx,
            savedActor,
            id,
            current.revision + 1,
            'enhanced',
            enhanced,
          );
        if (compiled)
          await this.prompts.persist(
            tx,
            savedActor,
            id,
            current.revision + 1,
            'compiled',
            compiled,
          );
        return {
          ...current,
          state,
          snapshot: resolution.snapshot,
          resolutionHash,
          layers: resolution.layers,
          learning: resolution.learning,
          prompts: {
            original: current.prompts.original,
            enhanced: enhanced?.reference ?? null,
            compiled: compiled?.reference ?? null,
          },
          diagnostics: [
            ...resolution.diagnostics,
            ...(unavailable
              ? [
                  {
                    code: 'prompt_snapshot_unavailable',
                    severity: 'error' as const,
                    message: 'Prompt retention unavailable',
                  },
                ]
              : []),
          ],
          compliance: current.mode === 'raw' ? 'not_claimed' : 'unverified',
        };
      },
    );
  }
  async cancel(
    actor: BrandedGenerationActorV1,
    id: string,
    mutation: BrandedGenerationMutationV1,
  ): Promise<BrandedGenerationMutationResultV1> {
    return this.mutate(
      actor,
      id,
      mutation,
      'cancel',
      {},
      async (_tx, current) => {
        if (
          !canTransitionBrandedGenerationStateV1(
            current.state,
            'cancelled',
            'cancel',
          )
        )
          throw new ConflictException('receipt_state_conflict');
        return { ...current, state: 'cancelled' };
      },
    );
  }
  async softDelete(
    actor: BrandedGenerationActorV1,
    id: string,
    mutation: BrandedGenerationMutationV1,
  ): Promise<BrandedGenerationMutationResultV1> {
    return this.mutate(
      actor,
      id,
      mutation,
      'delete',
      {},
      async (_tx, current) => ({ ...current, isDeleted: true }),
    );
  }
}
