import { randomUUID } from 'node:crypto';
import {
  canonicalizeBrandedGenerationJsonV1,
  hashBrandedGenerationOperationV1,
  hashBrandedGenerationRequestV1,
  hashBrandedGenerationTextV1,
} from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import { BrandedGenerationReceiptAccessService } from '@api/services/branded-generation-receipts/branded-generation-receipt-access.service';
import type {
  BrandedGenerationActorV1,
  BrandedGenerationCompiledReadV1,
  BrandedGenerationPreparedPromptV1,
  BrandedGenerationPromptReadV1,
  BrandedGenerationPromptStageV1,
} from '@api/services/branded-generation-receipts/branded-generation-receipts.types';
import type { BrandedGenerationCompilerRecipeV1 } from '@api/services/branded-generation-receipts/branded-generation-recompile.types';
import {
  encodeBrandedGenerationCompilerRecipeV1,
  parseBrandedGenerationCompilerRecipeV1,
} from '@api/services/branded-generation-receipts/branded-generation-recompile-codec.util';
import {
  brandedGenerationInputV1Schema,
  brandGenerationDiagnosticSchema,
  brandGenerationLayerReceiptV1Schema,
  brandLearningApplicationV1Schema,
  learningContractIdSchema,
} from '@genfeedai/contracts/api-types/contracts';
import type {
  BrandedGenerationInputV1,
  BrandedGenerationReceiptV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import { LEARNING_ARMS, learningContribution } from '@genfeedai/harness';
import type { Prisma } from '@genfeedai/prisma';
import { resolveTokenEncryptionKey } from '@libs/crypto/credential-cipher';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { z } from 'zod';

const TEXT_FORMAT = 'genfeed.branded-generation-prompt.v1';
const COMPILED_FORMAT = 'genfeed.branded-generation-compiled.v1';
const COMPILED_ENVELOPE_MAX_BYTES = 4194304;
const COMPILED_CIPHERTEXT_MAX_CHARS = 8388674;
const INPUT_MAX_BYTES = 1048576;
const PROMPT_TEXT_MAX_BYTES = 65536;
const PROMPT_ENVELOPE_MAX_BYTES = 393245;
const PROMPT_CIPHERTEXT_MAX_CHARS = 786556;
const envelope = z.strictObject({
  schemaVersion: z.literal(1),
  text: z
    .string()
    .refine((text) => Buffer.byteLength(text, 'utf8') <= PROMPT_TEXT_MAX_BYTES),
});
function isBoundedPromptCiphertext(
  value: unknown,
  maximum = PROMPT_CIPHERTEXT_MAX_CHARS,
): value is string {
  return (
    typeof value === 'string' &&
    value.length <= maximum &&
    /^[0-9a-fA-F]{32}:(?:[0-9a-fA-F]{2})+:[0-9a-fA-F]{32}$/.test(value)
  );
}
const OPTIONAL_INPUT_FIELDS = new Set([
  'platform',
  'objective',
  'destinationCredentialId',
  'draftRevisionId',
  'parentRequestId',
  'runId',
  'workflowExecutionId',
  'generationId',
]);
function invalidInput(): never {
  throw new BadRequestException('compiler_recipe_invalid');
}
function inputLimit(): never {
  throw new BadRequestException('compiler_recipe_limit');
}
function detachInput(
  value: unknown,
  maximum = INPUT_MAX_BYTES,
  allowInputUndefined = true,
): unknown {
  let nodes = 0;
  let bytes = 0;
  const ancestors = new Set<object>();
  const add = (count: number) => {
    bytes += count;
    if (bytes > maximum) inputLimit();
  };
  const stringBytes = (text: string) => {
    if (text.length > maximum) inputLimit();
    add(2);
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      if (code === 34 || code === 92 || [8, 9, 10, 12, 13].includes(code))
        add(2);
      else if (code < 32) add(6);
      else if (code >= 0xd800 && code <= 0xdbff) {
        const next = text.charCodeAt(index + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          add(4);
          index += 1;
        } else add(6);
      } else if (code >= 0xdc00 && code <= 0xdfff) add(6);
      else add(code < 128 ? 1 : code < 2048 ? 2 : 3);
    }
  };
  const visit = (current: unknown, depth: number): unknown => {
    nodes += 1;
    if (nodes > 262144 || depth > 16) inputLimit();
    if (current === undefined) {
      invalidInput();
      return undefined;
    }
    if (typeof current === 'string') {
      stringBytes(current);
      return current;
    }
    if (current === null || typeof current === 'boolean') {
      add(current === null ? 4 : current ? 4 : 5);
      return current;
    }
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) invalidInput();
      add(JSON.stringify(current).length);
      return current;
    }
    if (
      typeof current !== 'object' ||
      current === null ||
      ancestors.has(current)
    )
      invalidInput();
    const array = Array.isArray(current);
    const prototype = Object.getPrototypeOf(current);
    if (
      array
        ? prototype !== Array.prototype
        : prototype !== Object.prototype && prototype !== null
    )
      invalidInput();
    if (Object.getOwnPropertySymbols(current).length) invalidInput();
    let length = 0;
    if (array) {
      const descriptor = Object.getOwnPropertyDescriptor(current, 'length');
      if (
        !descriptor ||
        !('value' in descriptor) ||
        !Number.isSafeInteger(descriptor.value) ||
        descriptor.value < 0
      )
        invalidInput();
      length = descriptor.value;
      if (length > 65536) inputLimit();
    }
    const descriptors = Object.getOwnPropertyDescriptors(current);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (array && key === 'length') continue;
      if (key.length > maximum) inputLimit();
      if (
        !descriptor.enumerable ||
        !('value' in descriptor) ||
        ['__proto__', 'constructor', 'prototype'].includes(key)
      )
        invalidInput();
      if (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= length))
        invalidInput();
    }
    if (array && Object.keys(descriptors).length !== length + 1) invalidInput();
    ancestors.add(current);
    try {
      add(2);
      if (array) {
        const result: unknown[] = [];
        for (let index = 0; index < length; index += 1) {
          if (index) add(1);
          result.push(visit(descriptors[String(index)].value, depth + 1));
        }
        return result;
      }
      const result: Record<string, unknown> = {};
      let emitted = 0;
      for (const [key, descriptor] of Object.entries(descriptors)) {
        if (descriptor.value === undefined) {
          if (
            !allowInputUndefined ||
            depth !== 0 ||
            !OPTIONAL_INPUT_FIELDS.has(key)
          )
            invalidInput();
          nodes += 1;
          if (nodes > 262144) inputLimit();
          continue;
        }
        if (emitted++) add(1);
        stringBytes(key);
        add(1);
        result[key] = visit(descriptor.value, depth + 1);
      }
      return result;
    } finally {
      ancestors.delete(current);
    }
  };
  return visit(value, 0);
}
function normalizeRetainedInput(value: unknown): BrandedGenerationInputV1 {
  try {
    const parsed = brandedGenerationInputV1Schema.parse(detachInput(value));
    const canonical = JSON.parse(JSON.stringify(parsed));
    if (
      Buffer.byteLength(
        canonicalizeBrandedGenerationJsonV1(canonical),
        'utf8',
      ) > INPUT_MAX_BYTES
    )
      inputLimit();
    return canonical;
  } catch (error) {
    if (
      error instanceof BadRequestException &&
      error.message === 'compiler_recipe_limit'
    )
      throw error;
    invalidInput();
  }
}
const contributionFields = [
  'systemDirectives',
  'styleDirectives',
  'guardrails',
  'evaluationCriteria',
  'providerHints',
  'sources',
] as const;
function limit(): never {
  return inputLimit();
}
function boundedString(value: string, maximum: number, utf8: boolean): boolean {
  if ((utf8 ? Buffer.byteLength(value, 'utf8') : value.length) > maximum)
    limit();
  return true;
}
const futureSectionShape = z.strictObject({
  header: z.string().refine((value) => boundedString(value, 512, false)),
  content: z.string().refine((value) => boundedString(value, 65536, true)),
  instructions: z
    .string()
    .refine((value) => boundedString(value, 65536, true))
    .optional(),
  untrusted: z.boolean(),
  isAtomic: z.literal(true),
});
const futureStageShape = z
  .tuple([
    brandGenerationLayerReceiptV1Schema,
    z.array(futureSectionShape),
    z.array(
      z.array(learningContractIdSchema).refine((ids) => {
        if (ids.length > 256) limit();
        return new Set(ids).size === ids.length;
      }),
    ),
  ])
  .refine(([layer, sections, rows]) => {
    if (
      !['skill', 'knowledge', 'harness_profile', 'pack'].includes(layer.kind) ||
      !['not_applicable', 'unavailable'].includes(layer.status)
    )
      return false;
    if (layer.status === 'unavailable' && (sections.length || rows.length))
      return false;
    return (
      (!sections.length || Boolean(layer.id)) && rows.length === sections.length
    );
  });
const futureContributionShape = z
  .strictObject({
    systemDirectives: z.array(z.string()).optional(),
    styleDirectives: z.array(z.string()).optional(),
    guardrails: z.array(z.string()).optional(),
    evaluationCriteria: z.array(z.string()).optional(),
    providerHints: z.array(z.string()).optional(),
    sources: z.array(z.never()).optional(),
  })
  .refine(
    (value) =>
      LEARNING_ARMS.filter((arm) => {
        const actual = learningContribution(arm);
        return contributionFields.every((field) => {
          const supplied = value[field] ?? [];
          const expected = actual[field] ?? [];
          return (
            supplied.length === expected.length &&
            supplied.every((entry, index) => entry === expected[index])
          );
        });
      }).length === 1,
  );
const futureRecipeShape = z
  .tuple([
    z.string().refine((value) => {
      if (value.length > 26 || !/^snapshot-brief-v[1-9][0-9]{0,9}$/.test(value))
        return false;
      const version = Number(value.slice('snapshot-brief-v'.length));
      return (
        Number.isSafeInteger(version) && version >= 2 && version <= 2147483647
      );
    }),
    z.array(futureStageShape),
    z.array(futureStageShape),
    z.array(brandGenerationDiagnosticSchema),
    brandLearningApplicationV1Schema,
    futureContributionShape,
  ])
  .refine(([, required, optional, diagnostics]) => {
    if (required.length + optional.length > 256 || diagnostics.length > 128)
      limit();
    const stages = [...required, ...optional];
    if (
      stages.reduce((count, [, sections]) => count + sections.length, 0) > 256
    )
      limit();
    if (
      required.some(([layer]) => !['skill', 'knowledge'].includes(layer.kind))
    )
      return false;
    const identities = new Set<string>();
    for (const [layer] of stages) {
      if (layer.id === undefined) continue;
      const identity = `${layer.kind}\0${layer.id}`;
      if (identities.has(identity)) return false;
      identities.add(identity);
    }
    return true;
  });

const compiledEnvelope = z.strictObject({
  schemaVersion: z.literal(1),
  text: envelope.shape.text,
  retainedInput: z.unknown(),
  compilerRecipe: z.unknown(),
  compilerRecipeHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
});
type DecodedStoredPrompt =
  | BrandedGenerationCompiledReadV1
  | { status: 'legacy'; text: string; contentHash: string };
function matchesReceipt(
  input: BrandedGenerationInputV1,
  receipt: BrandedGenerationReceiptV1,
): boolean {
  return (
    input.actorId === receipt.actorId &&
    input.organizationId === receipt.organizationId &&
    input.brandId === receipt.brandId &&
    input.requestKey === receipt.requestKey &&
    input.candidateIndex === receipt.candidateIndex &&
    hashBrandedGenerationRequestV1(input) === receipt.requestHash &&
    hashBrandedGenerationTextV1(input.originalPrompt) ===
      receipt.prompts.original.contentHash &&
    ['parentRequestId', 'runId', 'workflowExecutionId', 'generationId'].every(
      (field) => Reflect.get(input, field) === Reflect.get(receipt, field),
    )
  );
}
function decodeStoredPrompt(
  row: { format: string; ciphertext: string; contentHash: string },
  receipt: BrandedGenerationReceiptV1,
  stage: BrandedGenerationPromptStageV1,
): DecodedStoredPrompt {
  const compiled = row.format === COMPILED_FORMAT;
  if (
    (!compiled && row.format !== TEXT_FORMAT) ||
    (compiled && stage !== 'compiled') ||
    !isBoundedPromptCiphertext(
      row.ciphertext,
      compiled ? COMPILED_CIPHERTEXT_MAX_CHARS : PROMPT_CIPHERTEXT_MAX_CHARS,
    )
  )
    return { status: 'unavailable', reasonCode: 'prompt_integrity_failed' };
  try {
    resolveTokenEncryptionKey();
  } catch {
    return { status: 'unavailable', reasonCode: 'prompt_snapshot_unavailable' };
  }
  try {
    const plaintext = EncryptionUtil.decrypt(row.ciphertext);
    if (
      typeof plaintext !== 'string' ||
      Buffer.byteLength(plaintext, 'utf8') >
        (compiled ? COMPILED_ENVELOPE_MAX_BYTES : PROMPT_ENVELOPE_MAX_BYTES)
    )
      throw new Error('Invalid envelope');
    const value: unknown = JSON.parse(plaintext);
    if (!compiled) {
      const decoded = envelope.parse(value);
      if (hashBrandedGenerationTextV1(decoded.text) !== row.contentHash)
        throw new Error('Invalid hash');
      return {
        status: 'legacy',
        text: decoded.text,
        contentHash: row.contentHash,
      };
    }
    const decoded = compiledEnvelope.parse(value);
    const retainedInput = normalizeRetainedInput(decoded.retainedInput);
    const safeRecipe = detachInput(decoded.compilerRecipe, 2097152, false);
    if (futureRecipeShape.safeParse(safeRecipe).success) {
      const originalRecipe = JSON.parse(JSON.stringify(safeRecipe));
      if (
        hashBrandedGenerationOperationV1('recompose', {
          compilerRecipe: originalRecipe,
        }) !== decoded.compilerRecipeHash ||
        hashBrandedGenerationTextV1(decoded.text) !== row.contentHash ||
        !matchesReceipt(retainedInput, receipt)
      )
        throw new Error('Invalid future binding');
      return {
        status: 'unavailable',
        reasonCode: 'compiler_recipe_unavailable',
      };
    }
    const compilerRecipe = parseBrandedGenerationCompilerRecipeV1(safeRecipe);
    const compilerRecipeHash = hashBrandedGenerationOperationV1('recompose', {
      compilerRecipe: JSON.parse(
        encodeBrandedGenerationCompilerRecipeV1(compilerRecipe),
      ),
    });
    if (
      compilerRecipeHash !== decoded.compilerRecipeHash ||
      hashBrandedGenerationTextV1(decoded.text) !== row.contentHash ||
      !matchesReceipt(retainedInput, receipt)
    )
      throw new Error('Invalid binding');
    return {
      status: 'retained',
      text: decoded.text,
      contentHash: row.contentHash,
      retainedInput,
      compilerRecipe,
      compilerRecipeHash,
    };
  } catch {
    return { status: 'unavailable', reasonCode: 'prompt_integrity_failed' };
  }
}
@Injectable()
export class BrandedGenerationPromptStoreService {
  constructor(private readonly access: BrandedGenerationReceiptAccessService) {}
  prepare(text: string): BrandedGenerationPreparedPromptV1 {
    if (
      typeof text !== 'string' ||
      Buffer.byteLength(text, 'utf8') > PROMPT_TEXT_MAX_BYTES
    )
      throw new BadRequestException('prompt_payload_out_of_range');
    const contentHash = hashBrandedGenerationTextV1(text);
    try {
      const plaintext = canonicalizeBrandedGenerationJsonV1({
        schemaVersion: 1,
        text,
      });
      if (Buffer.byteLength(plaintext, 'utf8') > PROMPT_ENVELOPE_MAX_BYTES)
        throw new Error('Invalid envelope');
      const ciphertext = EncryptionUtil.encrypt(plaintext);
      if (!isBoundedPromptCiphertext(ciphertext))
        throw new Error('Invalid cipher');
      const roundtrip = EncryptionUtil.decrypt(ciphertext);
      if (
        typeof roundtrip !== 'string' ||
        Buffer.byteLength(roundtrip, 'utf8') > PROMPT_ENVELOPE_MAX_BYTES
      )
        throw new Error('Invalid envelope');
      const decoded = envelope.parse(JSON.parse(roundtrip));
      if (
        decoded.text !== text ||
        hashBrandedGenerationTextV1(decoded.text) !== contentHash
      )
        throw new Error('Invalid roundtrip');
      const id = randomUUID();
      return {
        reference: { retention: 'retained', snapshotId: id, contentHash },
        record: { id, format: TEXT_FORMAT, ciphertext, contentHash },
      };
    } catch {
      return {
        reference: {
          retention: 'unavailable',
          reasonCode: 'prompt_snapshot_unavailable',
          contentHash,
        },
        record: null,
      };
    }
  }
  prepareCompiled(
    text: string,
    retainedInput: BrandedGenerationInputV1,
    recipe: BrandedGenerationCompilerRecipeV1,
  ): BrandedGenerationPreparedPromptV1 {
    if (
      typeof text !== 'string' ||
      Buffer.byteLength(text, 'utf8') > PROMPT_TEXT_MAX_BYTES
    )
      throw new BadRequestException('prompt_payload_out_of_range');
    const normalizedInput = normalizeRetainedInput(retainedInput);
    const compilerRecipe = parseBrandedGenerationCompilerRecipeV1(
      JSON.parse(encodeBrandedGenerationCompilerRecipeV1(recipe)),
    );
    const compilerRecipeHash = hashBrandedGenerationOperationV1('recompose', {
      compilerRecipe: JSON.parse(
        encodeBrandedGenerationCompilerRecipeV1(compilerRecipe),
      ),
    });
    const plaintext = canonicalizeBrandedGenerationJsonV1({
      schemaVersion: 1,
      text,
      retainedInput: JSON.parse(JSON.stringify(normalizedInput)),
      compilerRecipe: JSON.parse(
        encodeBrandedGenerationCompilerRecipeV1(compilerRecipe),
      ),
      compilerRecipeHash,
    });
    if (Buffer.byteLength(plaintext, 'utf8') > COMPILED_ENVELOPE_MAX_BYTES)
      inputLimit();
    const contentHash = hashBrandedGenerationTextV1(text);
    try {
      const ciphertext = EncryptionUtil.encrypt(plaintext);
      if (!isBoundedPromptCiphertext(ciphertext, COMPILED_CIPHERTEXT_MAX_CHARS))
        throw new Error('Invalid cipher');
      const roundtrip = EncryptionUtil.decrypt(ciphertext);
      if (
        typeof roundtrip !== 'string' ||
        Buffer.byteLength(roundtrip, 'utf8') > COMPILED_ENVELOPE_MAX_BYTES ||
        roundtrip !== plaintext
      )
        throw new Error('Invalid roundtrip');
      const id = randomUUID();
      return {
        reference: { retention: 'retained', snapshotId: id, contentHash },
        record: { id, format: COMPILED_FORMAT, ciphertext, contentHash },
      };
    } catch {
      return {
        reference: {
          retention: 'unavailable',
          reasonCode: 'prompt_snapshot_unavailable',
          contentHash,
        },
        record: null,
      };
    }
  }
  async persist(
    tx: Prisma.TransactionClient,
    actor: BrandedGenerationActorV1,
    receiptId: string,
    receiptRevision: number,
    stage: BrandedGenerationPromptStageV1,
    prepared: BrandedGenerationPreparedPromptV1,
  ): Promise<void> {
    if (!prepared.record) {
      if (prepared.reference.retention !== 'unavailable')
        throw new InternalServerErrorException('prompt_integrity_failed');
      return;
    }
    if (
      prepared.reference.retention !== 'retained' ||
      prepared.reference.snapshotId !== prepared.record.id ||
      prepared.reference.contentHash !== prepared.record.contentHash ||
      ![TEXT_FORMAT, COMPILED_FORMAT].includes(prepared.record.format) ||
      (prepared.record.format === COMPILED_FORMAT && stage !== 'compiled') ||
      !isBoundedPromptCiphertext(
        prepared.record.ciphertext,
        prepared.record.format === COMPILED_FORMAT
          ? COMPILED_CIPHERTEXT_MAX_CHARS
          : PROMPT_CIPHERTEXT_MAX_CHARS,
      )
    )
      throw new InternalServerErrorException('prompt_integrity_failed');
    await tx.generationPromptSnapshot.create({
      data: {
        id: prepared.record.id,
        organizationId: actor.organizationId,
        brandId: actor.brandId,
        userId: actor.actorId,
        format: prepared.record.format,
        contentHash: prepared.record.contentHash,
        ciphertext: prepared.record.ciphertext,
        retentionState: 'retained',
        brandedGenerationReceiptId: receiptId,
        brandedGenerationReceiptRevision: receiptRevision,
        brandedGenerationReceiptStage: stage,
      },
    });
  }
  async read(
    tx: Prisma.TransactionClient,
    actor: BrandedGenerationActorV1,
    receipt: BrandedGenerationReceiptV1,
    stage: BrandedGenerationPromptStageV1,
  ): Promise<BrandedGenerationPromptReadV1> {
    const decoded = await this.loadDecoded(tx, actor, receipt, stage);
    if (decoded.status === 'unavailable')
      return {
        status: 'unavailable',
        reasonCode:
          decoded.reasonCode === 'compiler_recipe_unavailable'
            ? 'prompt_integrity_failed'
            : decoded.reasonCode,
      };
    return {
      status: 'retained',
      text: decoded.text,
      contentHash: decoded.contentHash,
    };
  }
  async readCompiled(
    tx: Prisma.TransactionClient,
    actor: BrandedGenerationActorV1,
    receipt: BrandedGenerationReceiptV1,
  ): Promise<BrandedGenerationCompiledReadV1> {
    const decoded = await this.loadDecoded(tx, actor, receipt, 'compiled');
    return decoded.status === 'legacy'
      ? { status: 'unavailable', reasonCode: 'compiler_recipe_unavailable' }
      : decoded;
  }
  private async loadDecoded(
    tx: Prisma.TransactionClient,
    actor: BrandedGenerationActorV1,
    receipt: BrandedGenerationReceiptV1,
    stage: BrandedGenerationPromptStageV1,
  ): Promise<DecodedStoredPrompt> {
    const permission = await this.access.assertBrand(actor, tx);
    if (actor.actorId !== receipt.actorId && !permission.isOwnerOrAdmin)
      throw new ForbiddenException('receipt_access_denied');
    const reference = receipt.prompts[stage];
    if (
      reference?.retention === 'unavailable' &&
      reference.reasonCode === 'prompt_payload_purged'
    )
      return { status: 'unavailable', reasonCode: 'prompt_payload_purged' };
    if (reference?.retention !== 'retained' || !reference.snapshotId)
      return {
        status: 'unavailable',
        reasonCode: 'prompt_snapshot_unavailable',
      };
    const row = await tx.generationPromptSnapshot.findFirst({
      where: {
        id: reference.snapshotId,
        organizationId: actor.organizationId,
        brandId: actor.brandId,
        userId: receipt.actorId,
        brandedGenerationReceiptId: receipt.id,
        brandedGenerationReceiptStage: stage,
        brandedGenerationReceiptRevision: { lte: receipt.revision },
        isDeleted: false,
        retentionState: 'retained',
      },
    });
    if (!row)
      return {
        status: 'unavailable',
        reasonCode: 'prompt_snapshot_unavailable',
      };
    if (row.contentHash !== reference.contentHash)
      return { status: 'unavailable', reasonCode: 'prompt_integrity_failed' };
    return decodeStoredPrompt(row, receipt, stage);
  }
  async purge(
    tx: Prisma.TransactionClient,
    actor: BrandedGenerationActorV1,
    receiptId: string,
  ): Promise<void> {
    await tx.generationPromptSnapshot.updateMany({
      where: {
        organizationId: actor.organizationId,
        brandId: actor.brandId,
        brandedGenerationReceiptId: receiptId,
        format: { in: [TEXT_FORMAT, COMPILED_FORMAT] },
        isDeleted: false,
      },
      data: { ciphertext: '', retentionState: 'purged', isDeleted: true },
    });
  }
}
