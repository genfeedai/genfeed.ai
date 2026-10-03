import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { BrandedGenerationJsonV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import {
  canonicalizeBrandedGenerationJsonV1,
  hashBrandArtifactValidationReportV1,
  hashBrandedGenerationArtifactManifestV1,
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
  BrandedGenerationArtifactCompletionV1,
  BrandedGenerationDispatchInputV1,
  BrandedGenerationDispatchRecoveryV1,
  BrandedGenerationFailureInputV1,
  BrandedGenerationMutationResultV1,
  BrandedGenerationMutationV1,
  BrandedGenerationPreparedPromptV1,
  BrandedGenerationPromptReadV1,
  BrandedGenerationPromptStageV1,
  BrandedGenerationReceiptHistoryV1,
  BrandedGenerationReceiptPageV1,
} from '@api/services/branded-generation-receipts/branded-generation-receipts.types';
import type { BrandedGenerationCompilerRecipeV1 } from '@api/services/branded-generation-receipts/branded-generation-recompile.types';
import {
  encodeBrandedGenerationCompilerRecipeV1,
  parseBrandedGenerationCompilerRecipeV1,
} from '@api/services/branded-generation-receipts/branded-generation-recompile-codec.util';
import {
  BRANDED_GENERATION_DISPATCH_WINDOW_MS,
  type BrandedGenerationOperationKindV1,
  canTransitionBrandedGenerationStateV1,
  classifyBrandedGenerationReadinessV1,
} from '@api/services/branded-generation-receipts/branded-generation-state.util';
import { compileSnapshotBriefResolution } from '@api/services/harness/branded-generation-compiler';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  brandArtifactValidationReportV1Schema,
  brandedGenerationInputV1Schema,
  brandedGenerationReceiptV1Schema,
  brandedGenerationResolutionV1Schema,
  brandGenerationArtifactV1Schema,
  learningContractIdSchema,
} from '@genfeedai/contracts/api-types/contracts';
import type {
  BrandArtifactValidationReportV1,
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

const RECEIPT_CURSOR_MAX_JSON_BYTES = 1584;
const RECEIPT_CURSOR_MAX_ENCODED_CHARS = 2112;
const cursorSchema = z.strictObject({
  createdAt: z.iso.datetime().refine((value) => {
    try {
      return value.length === 24 && new Date(value).toISOString() === value;
    } catch {
      return false;
    }
  }),
  id: learningContractIdSchema,
});
function withDiagnostic(
  diagnostics: BrandedGenerationReceiptV1['diagnostics'],
  canonical: BrandedGenerationReceiptV1['diagnostics'][number],
): BrandedGenerationReceiptV1['diagnostics'] {
  const result = diagnostics.map((diagnostic) => ({
    ...diagnostic,
    ...(diagnostic.evidenceIds !== undefined
      ? { evidenceIds: [...diagnostic.evidenceIds] }
      : {}),
  }));
  const existing = result.findIndex(
    (diagnostic) => diagnostic.code === canonical.code,
  );
  if (existing >= 0) {
    result[existing] = canonical;
    return result;
  }
  if (result.length === 128) {
    let index = -1;
    for (const severity of ['info', 'warning', 'error'] as const) {
      for (let candidate = result.length - 1; candidate >= 0; candidate -= 1) {
        if (result[candidate].severity === severity) {
          index = candidate;
          break;
        }
      }
      if (index >= 0) break;
    }
    const omitted = result[index];
    const projection = {
      code: omitted.code,
      severity: omitted.severity,
      message: omitted.message,
      ...(omitted.ruleId !== undefined ? { ruleId: omitted.ruleId } : {}),
      ...(omitted.evidenceIds !== undefined
        ? { evidenceIds: omitted.evidenceIds }
        : {}),
    };
    const hash = hashBrandedGenerationTextV1(
      canonicalizeBrandedGenerationJsonV1(projection),
    );
    result.splice(index, 1);
    canonical.message = `${canonical.message}. One prior diagnostic was omitted: ${omitted.code} (${omitted.severity}); diagnostic hash ${hash}.`;
  }
  result.push(canonical);
  return result;
}
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
          OR: [{ isDeleted: false }, { isDeleted: true }],
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
    if (query.cursor !== undefined) {
      try {
        if (
          typeof query.cursor !== 'string' ||
          query.cursor.length < 1 ||
          query.cursor.length > RECEIPT_CURSOR_MAX_ENCODED_CHARS
        )
          throw new Error('Invalid cursor');
        if (
          !/^[A-Za-z0-9_-]+$/.test(query.cursor) ||
          query.cursor.length % 4 === 1
        )
          throw new Error('Invalid cursor');
        const bytes = Buffer.from(query.cursor, 'base64url');
        if (bytes.byteLength > RECEIPT_CURSOR_MAX_JSON_BYTES)
          throw new Error('Invalid cursor');
        cursor = cursorSchema.parse(
          JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
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
        where: scopedWhere(actor.organizationId, {
          brandId: actor.brandId,
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
        }),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
      });
      const items = rows
        .slice(0, query.limit)
        .map((row) => this.parse(row.projection));
      const last = items.at(-1);
      let nextCursor: string | null = null;
      if (rows.length > query.limit && last) {
        const parsed = cursorSchema.safeParse({
          createdAt: last.createdAt,
          id: last.id,
        });
        if (!parsed.success)
          throw new InternalServerErrorException('receipt_integrity_failed');
        nextCursor = Buffer.from(
          canonicalizeBrandedGenerationJsonV1(parsed.data),
        ).toString('base64url');
      }
      return { items, nextCursor };
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
          OR: [{ isDeleted: false }, { isDeleted: true }],
        },
      });
      if (!row) throw new NotFoundException({ message: 'receipt_not_found' });
      const current = this.parse(row.projection);
      this.creator(actor, current, permission.isOwnerOrAdmin);
      const prior = row.isDeleted
        ? await tx.brandedGenerationReceiptEvent.findFirst({
            where: {
              receiptId: id,
              organizationId: actor.organizationId,
              brandId: actor.brandId,
              operationKey: mutation.operationKey,
              OR: [{ isDeleted: false }, { isDeleted: true }],
            },
          })
        : await tx.brandedGenerationReceiptEvent.findFirst({
            where: {
              receiptId: id,
              organizationId: actor.organizationId,
              brandId: actor.brandId,
              operationKey: mutation.operationKey,
              isDeleted: false,
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
    return this.recordPreparedResolution(
      actor,
      id,
      mutation,
      resolution,
      enhanced,
      compiled,
      {
        resolutionHash,
        enhancedPromptHash:
          enhancedPrompt === undefined
            ? null
            : hashBrandedGenerationTextV1(enhancedPrompt),
      },
    );
  }
  async recordCompiledResolution(
    actor: BrandedGenerationActorV1,
    id: string,
    mutation: BrandedGenerationMutationV1,
    value: BrandedGenerationResolutionV1,
    retainedInput: BrandedGenerationInputV1,
    recipe: BrandedGenerationCompilerRecipeV1,
    enhancedPrompt?: string,
  ): Promise<BrandedGenerationMutationResultV1> {
    const resolution = brandedGenerationResolutionV1Schema.parse(value);
    if (resolution.status !== 'resolved')
      throw new BadRequestException('compiler_recipe_invalid');
    if (
      resolution.snapshot &&
      hashBrandIdentitySnapshotV1(resolution.snapshot) !==
        resolution.snapshot.contentHash
    )
      throw new BadRequestException('brand_identity_snapshot_hash_mismatch');
    const resolutionHash = hashBrandedGenerationResolutionV1(resolution);
    const compiled = this.prompts.prepareCompiled(
      resolution.compiledPrompt,
      retainedInput,
      recipe,
    );
    const input = JSON.parse(
      JSON.stringify(brandedGenerationInputV1Schema.parse(retainedInput)),
    ) as BrandedGenerationInputV1;
    const canonicalRecipe = parseBrandedGenerationCompilerRecipeV1(
      JSON.parse(encodeBrandedGenerationCompilerRecipeV1(recipe)),
    );
    const reproduced = compileSnapshotBriefResolution(
      input,
      resolution.snapshot,
      canonicalRecipe[4],
      canonicalRecipe[5],
      canonicalRecipe[1],
      canonicalRecipe[2],
      canonicalRecipe[3],
    );
    if (
      reproduced.status !== 'resolved' ||
      reproduced.compiledPrompt !== resolution.compiledPrompt ||
      hashBrandedGenerationResolutionV1(reproduced) !== resolutionHash
    )
      throw new ConflictException('compiler_recipe_mismatch');
    const enhanced =
      enhancedPrompt === undefined
        ? null
        : this.prompts.prepare(enhancedPrompt);
    return this.recordPreparedResolution(
      actor,
      id,
      mutation,
      resolution,
      enhanced,
      compiled,
      {
        resolutionHash,
        enhancedPromptHash:
          enhancedPrompt === undefined
            ? null
            : hashBrandedGenerationTextV1(enhancedPrompt),
        compilerRecipeHash: hashBrandedGenerationOperationV1('recompose', {
          compilerRecipe: JSON.parse(
            encodeBrandedGenerationCompilerRecipeV1(canonicalRecipe),
          ),
        }),
        retainedInputHash: hashBrandedGenerationOperationV1('recompose', {
          retainedInput: JSON.parse(
            canonicalizeBrandedGenerationJsonV1(
              input as unknown as BrandedGenerationJsonV1,
            ),
          ),
        }),
      },
      input,
    );
  }
  private recordPreparedResolution(
    actor: BrandedGenerationActorV1,
    id: string,
    mutation: BrandedGenerationMutationV1,
    resolution: BrandedGenerationResolutionV1,
    enhanced: BrandedGenerationPreparedPromptV1 | null,
    compiled: BrandedGenerationPreparedPromptV1 | null,
    operationBody: BrandedGenerationJsonV1,
    retainedInput?: BrandedGenerationInputV1,
  ): Promise<BrandedGenerationMutationResultV1> {
    const resolutionHash = hashBrandedGenerationResolutionV1(resolution);
    return this.mutate(
      actor,
      id,
      mutation,
      'resolve',
      operationBody,
      async (tx, current) => {
        if (
          retainedInput &&
          (retainedInput.actorId !== current.actorId ||
            retainedInput.organizationId !== current.organizationId ||
            retainedInput.brandId !== current.brandId ||
            retainedInput.requestKey !== current.requestKey ||
            retainedInput.candidateIndex !== current.candidateIndex ||
            hashBrandedGenerationRequestV1(retainedInput) !==
              current.requestHash ||
            hashBrandedGenerationTextV1(retainedInput.originalPrompt) !==
              current.prompts.original.contentHash ||
            [
              'parentRequestId',
              'runId',
              'workflowExecutionId',
              'generationId',
            ].some(
              (field) =>
                Reflect.get(retainedInput, field) !==
                Reflect.get(current, field),
            ))
        )
          throw new ConflictException('request_payload_conflict');
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
          diagnostics: unavailable
            ? withDiagnostic(resolution.diagnostics, {
                code: 'prompt_snapshot_unavailable',
                severity: 'error',
                message: 'Prompt retention unavailable',
              })
            : resolution.diagnostics,
          compliance: current.mode === 'raw' ? 'not_claimed' : 'unverified',
        };
      },
    );
  }
  async recordDispatch(
    actor: BrandedGenerationActorV1,
    id: string,
    mutation: BrandedGenerationMutationV1,
    input: BrandedGenerationDispatchInputV1,
  ): Promise<BrandedGenerationMutationResultV1> {
    try {
      return await this.mutate(
        actor,
        id,
        mutation,
        'dispatch',
        {
          provider: input.provider,
          model: input.model,
          ...(input.capabilityId !== undefined
            ? { capabilityId: input.capabilityId }
            : {}),
          ...(input.capabilityVersion !== undefined
            ? { capabilityVersion: input.capabilityVersion }
            : {}),
          providerAttemptRef: input.providerAttemptRef,
          dispatchClaimedAt: input.dispatchClaimedAt,
          providerAcceptedAt: input.providerAcceptedAt,
        },
        async (_tx, current) => {
          if (
            !canTransitionBrandedGenerationStateV1(
              current.state,
              'dispatched',
              'dispatch',
            )
          )
            throw new ConflictException('receipt_state_conflict');
          const now = Date.now();
          const resolvedAt = Date.parse(current.updatedAt);
          if (now > resolvedAt + BRANDED_GENERATION_DISPATCH_WINDOW_MS)
            throw new ConflictException('receipt_dispatch_window_expired');
          const claimedAt = Date.parse(input.dispatchClaimedAt);
          const acceptedAt = Date.parse(input.providerAcceptedAt);
          if (
            !(
              resolvedAt <= claimedAt &&
              claimedAt <= acceptedAt &&
              acceptedAt <= now
            )
          )
            throw new BadRequestException('receipt_dispatch_timing_invalid');
          const candidate = {
            ...current,
            state: 'dispatched' as const,
            execution: { ...input, result: 'pending' as const },
            budget: { ...current.budget, generationAttemptsUsed: 1 as const },
          };
          if (!brandedGenerationReceiptV1Schema.safeParse(candidate).success)
            throw new ConflictException('receipt_state_conflict');
          return candidate;
        },
      );
    } catch (error) {
      if (
        error !== null &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2002'
      )
        throw new ConflictException('provider_attempt_ref_conflict');
      throw error;
    }
  }
  async blockBeforeDispatch(
    actor: BrandedGenerationActorV1,
    id: string,
    mutation: BrandedGenerationMutationV1,
    reasonCode: 'provider_attempt_ref_unavailable',
  ): Promise<BrandedGenerationMutationResultV1> {
    return this.mutate(
      actor,
      id,
      mutation,
      'block',
      { reasonCode },
      async (_tx, current) => {
        if (current.state !== 'resolved')
          throw new ConflictException('receipt_state_conflict');
        return {
          ...current,
          state: 'blocked',
          diagnostics: withDiagnostic(current.diagnostics, {
            code: reasonCode,
            severity: 'error',
            message: 'Provider attempt reference unavailable',
          }),
        };
      },
    );
  }
  async recoverExpiredDispatches(
    actor: BrandedGenerationActorV1,
    query: { limit: number; now?: Date },
  ): Promise<BrandedGenerationDispatchRecoveryV1> {
    this.limit(query.limit);
    const cutoff = new Date(
      (query.now ?? new Date()).getTime() -
        BRANDED_GENERATION_DISPATCH_WINDOW_MS,
    );
    const rows = await this.transaction(async (tx) => {
      const permission = await this.access.assertBrand(actor, tx);
      return tx.brandedGenerationReceipt.findMany({
        where: {
          organizationId: actor.organizationId,
          brandId: actor.brandId,
          isDeleted: false,
          state: 'resolved',
          updatedAt: { lt: cutoff },
          ...(!permission.isOwnerOrAdmin ? { actorId: actor.actorId } : {}),
        },
        take: query.limit,
      });
    });
    const result: BrandedGenerationDispatchRecoveryV1 = {
      blocked: [],
      skipped: [],
    };
    for (const row of rows) {
      try {
        await this.mutate(
          actor,
          row.id,
          {
            operationKey: `dispatch-window-expired:${row.id}:${row.revision}`,
            expectedRevision: row.revision,
          },
          'block',
          { reasonCode: 'dispatch_window_expired' },
          async (_tx, current) => {
            if (
              current.state !== 'resolved' ||
              Date.parse(current.updatedAt) > cutoff.getTime()
            )
              throw new ConflictException('receipt_state_conflict');
            return {
              ...current,
              state: 'blocked',
              diagnostics: withDiagnostic(current.diagnostics, {
                code: 'dispatch_window_expired',
                severity: 'error',
                message: 'Dispatch window expired',
              }),
            };
          },
        );
        result.blocked.push(row.id);
      } catch (error) {
        if (
          error instanceof Error &&
          [
            'receipt_version_conflict',
            'receipt_state_conflict',
            'request_payload_conflict',
            'receipt_deleted',
          ].includes(error.message)
        )
          result.skipped.push(row.id);
        else throw error;
      }
    }
    return result;
  }
  async bindArtifact(
    actor: BrandedGenerationActorV1,
    id: string,
    mutation: BrandedGenerationMutationV1,
    input: BrandedGenerationArtifactCompletionV1,
  ): Promise<BrandedGenerationMutationResultV1> {
    const parsed = brandGenerationArtifactV1Schema.safeParse(input.artifact);
    if (!parsed.success)
      throw new BadRequestException('receipt_artifact_invalid');
    const artifact = parsed.data;
    try {
      if (
        hashBrandedGenerationArtifactManifestV1({
          mediaKind: artifact.mediaKind,
          textHash: input.textHash,
          parts: artifact.parts,
        }) !== artifact.contentHash ||
        (artifact.kind === 'post'
          ? artifact.mediaKind !== 'text' ||
            artifact.parts.length !== 0 ||
            input.textHash !== artifact.version
          : artifact.kind !== 'ingredient' ||
            !['image', 'video'].includes(artifact.mediaKind) ||
            input.textHash !== null ||
            artifact.parts.length !== 1 ||
            artifact.version !== artifact.parts[0].version ||
            artifact.parts[0].role !== artifact.mediaKind)
      )
        throw new Error('Invalid artifact');
    } catch {
      throw new BadRequestException('receipt_artifact_invalid');
    }
    return this.mutate(
      actor,
      id,
      mutation,
      'bind_artifact',
      {
        kind: artifact.kind,
        id: artifact.id,
        version: artifact.version,
        contentHash: artifact.contentHash,
        completedAt: input.completedAt,
      },
      async (tx, current) => {
        if (
          !canTransitionBrandedGenerationStateV1(
            current.state,
            'checking',
            'bind_artifact',
          ) ||
          !current.execution
        )
          throw new ConflictException('receipt_state_conflict');
        const where = {
          id: artifact.id,
          organizationId: actor.organizationId,
          brandId: actor.brandId,
          isDeleted: false,
        };
        if (artifact.kind === 'post') {
          const post = await tx.post.findFirst({ where });
          if (!post)
            throw new NotFoundException({
              message: 'receipt_artifact_not_found',
            });
          if (
            hashBrandedGenerationTextV1(post.description) !== artifact.version
          )
            throw new ConflictException('receipt_artifact_version_mismatch');
        } else {
          const ingredient = await tx.ingredient.findFirst({ where });
          if (!ingredient)
            throw new NotFoundException({
              message: 'receipt_artifact_not_found',
            });
          if (ingredient.s3Key !== artifact.parts[0].id)
            throw new ConflictException('receipt_artifact_version_mismatch');
        }
        const candidate = {
          ...current,
          state: 'checking' as const,
          artifact,
          execution: {
            ...current.execution,
            result: 'completed' as const,
            completedAt: input.completedAt,
          },
        };
        if (!brandedGenerationReceiptV1Schema.safeParse(candidate).success)
          throw new ConflictException('receipt_state_conflict');
        return candidate;
      },
    );
  }
  async fail(
    actor: BrandedGenerationActorV1,
    id: string,
    mutation: BrandedGenerationMutationV1,
    input: BrandedGenerationFailureInputV1,
  ): Promise<BrandedGenerationMutationResultV1> {
    return this.mutate(
      actor,
      id,
      mutation,
      'fail',
      { reasonCode: input.reasonCode, completedAt: input.completedAt },
      async (_tx, current) => {
        if (
          !canTransitionBrandedGenerationStateV1(
            current.state,
            'failed',
            'fail',
          ) ||
          !current.execution
        )
          throw new ConflictException('receipt_state_conflict');
        const candidate = {
          ...current,
          state: 'failed' as const,
          execution: {
            ...current.execution,
            result: 'failed' as const,
            completedAt: input.completedAt,
          },
          diagnostics: withDiagnostic(current.diagnostics, {
            code: input.reasonCode,
            severity: 'error',
            message: 'Generation failed',
          }),
        };
        if (!brandedGenerationReceiptV1Schema.safeParse(candidate).success)
          throw new ConflictException('receipt_state_conflict');
        return candidate;
      },
    );
  }
  async recordValidation(
    actor: BrandedGenerationActorV1,
    id: string,
    mutation: BrandedGenerationMutationV1,
    kind: 'validate' | 'revalidate',
    report: BrandArtifactValidationReportV1 | null,
  ): Promise<BrandedGenerationMutationResultV1> {
    if (
      report !== null &&
      !brandArtifactValidationReportV1Schema.safeParse(report).success
    )
      throw new BadRequestException('receipt_validation_invalid');
    return this.mutate(
      actor,
      id,
      mutation,
      kind,
      {
        reportHash: report ? hashBrandArtifactValidationReportV1(report) : null,
      },
      async (_tx, current) => {
        if (
          !(
            kind === 'validate'
              ? ['checking']
              : ['checking', 'ready', 'needs_review', 'blocked']
          ).includes(current.state)
        )
          throw new ConflictException('receipt_state_conflict');
        if (!current.artifact || current.execution?.result !== 'completed')
          throw new ConflictException('receipt_state_conflict');
        if (current.mode === 'raw' && report !== null)
          throw new BadRequestException('receipt_validation_binding_mismatch');
        if (current.mode !== 'raw' && current.snapshot === null)
          throw new ConflictException('receipt_state_conflict');
        if (
          report !== null &&
          (report.artifactId !== current.artifact.id ||
            report.artifactVersion !== current.artifact.version ||
            report.artifactHash !== current.artifact.contentHash ||
            report.snapshotHash !== current.snapshot?.contentHash)
        )
          throw new BadRequestException('receipt_validation_binding_mismatch');
        let result: ReturnType<typeof classifyBrandedGenerationReadinessV1>;
        try {
          result = classifyBrandedGenerationReadinessV1({
            receipt: current,
            validation: report,
          });
        } catch (error) {
          if (error instanceof TypeError)
            throw new ConflictException('receipt_state_conflict');
          throw error;
        }
        if (
          !canTransitionBrandedGenerationStateV1(
            current.state,
            result.state,
            kind,
          )
        )
          throw new ConflictException('receipt_state_conflict');
        const candidate = { ...current, ...result, validation: report };
        if (!brandedGenerationReceiptV1Schema.safeParse(candidate).success)
          throw new ConflictException('receipt_state_conflict');
        return candidate;
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
