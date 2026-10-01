import { randomUUID } from 'node:crypto';
import {
  canonicalizeBrandedGenerationJsonV1,
  hashBrandedGenerationTextV1,
} from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import { BrandedGenerationReceiptAccessService } from '@api/services/branded-generation-receipts/branded-generation-receipt-access.service';
import type {
  BrandedGenerationActorV1,
  BrandedGenerationPreparedPromptV1,
  BrandedGenerationPromptReadV1,
  BrandedGenerationPromptStageV1,
} from '@api/services/branded-generation-receipts/branded-generation-receipts.types';
import type { BrandedGenerationReceiptV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
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

const envelope = z.strictObject({
  schemaVersion: z.literal(1),
  text: z.string().refine((text) => Buffer.byteLength(text, 'utf8') <= 65536),
});
const cipher = /^[0-9a-fA-F]{32}:[0-9a-fA-F]+:[0-9a-fA-F]{32}$/;
@Injectable()
export class BrandedGenerationPromptStoreService {
  constructor(private readonly access: BrandedGenerationReceiptAccessService) {}
  prepare(text: string): BrandedGenerationPreparedPromptV1 {
    if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > 65536)
      throw new BadRequestException('prompt_payload_out_of_range');
    const contentHash = hashBrandedGenerationTextV1(text);
    try {
      const plaintext = canonicalizeBrandedGenerationJsonV1({
        schemaVersion: 1,
        text,
      });
      const ciphertext = EncryptionUtil.encrypt(plaintext);
      if (!cipher.test(ciphertext)) throw new Error('Invalid cipher');
      const decoded = envelope.parse(
        JSON.parse(EncryptionUtil.decrypt(ciphertext)),
      );
      if (
        decoded.text !== text ||
        hashBrandedGenerationTextV1(decoded.text) !== contentHash
      )
        throw new Error('Invalid roundtrip');
      const id = randomUUID();
      return {
        reference: { retention: 'retained', snapshotId: id, contentHash },
        record: { id, ciphertext, contentHash },
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
      !cipher.test(prepared.record.ciphertext)
    )
      throw new InternalServerErrorException('prompt_integrity_failed');
    await tx.generationPromptSnapshot.create({
      data: {
        id: prepared.record.id,
        organizationId: actor.organizationId,
        brandId: actor.brandId,
        userId: actor.actorId,
        format: 'genfeed.branded-generation-prompt.v1',
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
    const permission = await this.access.assertBrand(actor, tx);
    if (actor.actorId !== receipt.actorId && !permission.isOwnerOrAdmin)
      throw new ForbiddenException('receipt_access_denied');
    const reference = receipt.prompts[stage];
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
    if (
      row.format !== 'genfeed.branded-generation-prompt.v1' ||
      row.contentHash !== reference.contentHash ||
      !cipher.test(row.ciphertext)
    )
      return { status: 'unavailable', reasonCode: 'prompt_integrity_failed' };
    try {
      resolveTokenEncryptionKey();
    } catch {
      return {
        status: 'unavailable',
        reasonCode: 'prompt_snapshot_unavailable',
      };
    }
    try {
      const decoded = envelope.parse(
        JSON.parse(EncryptionUtil.decrypt(row.ciphertext)),
      );
      if (hashBrandedGenerationTextV1(decoded.text) !== row.contentHash)
        throw new Error('Invalid hash');
      return {
        status: 'retained',
        text: decoded.text,
        contentHash: row.contentHash,
      };
    } catch {
      return { status: 'unavailable', reasonCode: 'prompt_integrity_failed' };
    }
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
        format: 'genfeed.branded-generation-prompt.v1',
        isDeleted: false,
      },
      data: { ciphertext: '', retentionState: 'purged', isDeleted: true },
    });
  }
}
