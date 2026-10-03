import { createHash } from 'node:crypto';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import {
  hashBrandedGenerationArtifactManifestV1,
  hashBrandedGenerationTextV1,
} from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import { BrandedGenerationReceiptAccessService } from '@api/services/branded-generation-receipts/branded-generation-receipt-access.service';
import { BrandedGenerationReceiptsService } from '@api/services/branded-generation-receipts/branded-generation-receipts.service';
import type {
  BrandedGenerationAcquiredMaterialV1,
  BrandedGenerationActorV1,
  BrandedGenerationArtifactBindingV1,
} from '@api/services/branded-generation-receipts/branded-generation-receipts.types';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AssetParent, IngredientCategory } from '@genfeedai/contracts';
import type { BrandArtifactValidationMaterialV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import {
  assertSafeObjectKey,
  createStorageProvider,
  STORAGE_READ_MAX_BYTES,
  StorageReadError,
} from '@genfeedai/storage';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

@Injectable()
export class BrandedGenerationArtifactMaterialService {
  private readonly storage = createStorageProvider();
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BrandedGenerationReceiptAccessService,
    private readonly receipts: BrandedGenerationReceiptsService,
  ) {}
  private hash(bytes: Uint8Array): string {
    return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  }
  private limit(bytes: number): void {
    if (bytes > STORAGE_READ_MAX_BYTES)
      throw new BadRequestException('receipt_material_limit_exceeded');
  }
  private key(value: string | null, reference = false): string {
    if (!value)
      throw new NotFoundException({
        message: reference
          ? 'receipt_reference_not_found'
          : 'receipt_artifact_not_found',
      });
    return assertSafeObjectKey(
      value,
      () =>
        new NotFoundException({
          message: reference
            ? 'receipt_reference_not_found'
            : 'receipt_artifact_not_found',
        }),
    );
  }
  private async read(
    key: string,
    expectedVersion?: string,
    maxBytes = STORAGE_READ_MAX_BYTES,
  ) {
    if (maxBytes < 1)
      throw new BadRequestException('receipt_material_limit_exceeded');
    try {
      return await this.storage.readVersionedBytes(key, {
        maxBytes,
        timeoutMs: 15000,
        ...(expectedVersion !== undefined ? { expectedVersion } : {}),
      });
    } catch (error) {
      if (error instanceof StorageReadError) {
        if (error.code === 'storage_read_changed')
          throw new ConflictException('receipt_artifact_version_mismatch');
        if (error.code === 'storage_read_limit_exceeded')
          throw new BadRequestException('receipt_material_limit_exceeded');
      }
      throw new ServiceUnavailableException('receipt_material_unavailable');
    }
  }
  async describeIngredientArtifact(
    actor: BrandedGenerationActorV1,
    ingredientId: string,
  ): Promise<BrandedGenerationArtifactBindingV1> {
    const ingredient = await this.prisma.$transaction(async (tx) => {
      await this.access.assertBrand(actor, tx);
      return tx.ingredient.findFirst({
        where: {
          id: ingredientId,
          organizationId: actor.organizationId,
          brandId: actor.brandId,
          isDeleted: false,
        },
      });
    });
    if (!ingredient)
      throw new NotFoundException({ message: 'receipt_artifact_not_found' });
    if (
      ingredient.category !== IngredientCategory.IMAGE &&
      ingredient.category !== IngredientCategory.VIDEO
    )
      throw new BadRequestException('receipt_artifact_unsupported');
    const key = this.key(ingredient.s3Key);
    const { bytes, version } = await this.read(key);
    const mediaKind =
      ingredient.category === IngredientCategory.IMAGE ? 'image' : 'video';
    const parts = [
      { id: key, version, contentHash: this.hash(bytes), role: mediaKind },
    ];
    const artifact: BrandedGenerationArtifactBindingV1['artifact'] = {
      kind: 'ingredient',
      id: ingredient.id,
      version,
      mediaKind,
      parts: [{ ...parts[0], role: mediaKind }],
      contentHash: hashBrandedGenerationArtifactManifestV1({
        mediaKind,
        textHash: null,
        parts: [{ ...parts[0], role: mediaKind }],
      }),
    };
    return { artifact, textHash: null };
  }
  async describePostArtifact(
    actor: BrandedGenerationActorV1,
    postId: string,
  ): Promise<BrandedGenerationArtifactBindingV1> {
    const post = await this.prisma.$transaction(async (tx) => {
      await this.access.assertBrand(actor, tx);
      return tx.post.findFirst({
        where: {
          id: postId,
          organizationId: actor.organizationId,
          brandId: actor.brandId,
          isDeleted: false,
        },
      });
    });
    if (!post)
      throw new NotFoundException({ message: 'receipt_artifact_not_found' });
    if (!post.description)
      throw new BadRequestException('receipt_artifact_unsupported');
    this.limit(Buffer.byteLength(post.description));
    const textHash = hashBrandedGenerationTextV1(post.description);
    return {
      artifact: {
        kind: 'post',
        id: post.id,
        version: textHash,
        mediaKind: 'text',
        parts: [],
        contentHash: hashBrandedGenerationArtifactManifestV1({
          mediaKind: 'text',
          textHash,
          parts: [],
        }),
      },
      textHash,
    };
  }
  async acquire(
    actor: BrandedGenerationActorV1,
    receiptId: string,
  ): Promise<BrandedGenerationAcquiredMaterialV1> {
    const receipt = await this.receipts.get(actor, receiptId);
    const artifact = receipt.artifact;
    if (
      !artifact ||
      !['checking', 'ready', 'needs_review', 'blocked'].includes(
        receipt.state,
      ) ||
      (receipt.mode !== 'raw' && receipt.snapshot === null)
    )
      throw new ConflictException('receipt_state_conflict');
    const material: BrandArtifactValidationMaterialV1 = {
      artifactKind: artifact.kind,
      artifactId: artifact.id,
      artifactVersion: artifact.version,
      textBytes: null,
      parts: [],
      references: [],
    };
    let textHash: string | null = null;
    let materialBytes = 0;
    if (artifact.kind === 'post') {
      const post = await this.prisma.post.findFirst({
        where: {
          id: artifact.id,
          organizationId: actor.organizationId,
          brandId: actor.brandId,
          isDeleted: false,
        },
      });
      if (!post)
        throw new NotFoundException({ message: 'receipt_artifact_not_found' });
      textHash = hashBrandedGenerationTextV1(post.description);
      if (textHash !== artifact.version)
        throw new ConflictException('receipt_artifact_version_mismatch');
      if (!post.description)
        throw new BadRequestException('receipt_artifact_unsupported');
      materialBytes = Buffer.byteLength(post.description);
      this.limit(materialBytes);
      material.textBytes = Buffer.from(post.description);
    } else if (artifact.kind === 'ingredient' && artifact.parts.length === 1) {
      const ingredient = await this.prisma.ingredient.findFirst({
        where: {
          id: artifact.id,
          organizationId: actor.organizationId,
          brandId: actor.brandId,
          isDeleted: false,
        },
      });
      if (!ingredient)
        throw new NotFoundException({ message: 'receipt_artifact_not_found' });
      const part = artifact.parts[0];
      if (ingredient.s3Key !== part.id || artifact.version !== part.version)
        throw new ConflictException('receipt_artifact_version_mismatch');
      const { bytes } = await this.read(this.key(part.id), part.version);
      materialBytes = bytes.byteLength;
      this.limit(materialBytes);
      if (this.hash(bytes) !== part.contentHash)
        throw new ConflictException('receipt_artifact_hash_mismatch');
      material.parts = [{ partId: part.id, partVersion: part.version, bytes }];
    } else throw new BadRequestException('receipt_artifact_unsupported');
    if (
      hashBrandedGenerationArtifactManifestV1({
        mediaKind: artifact.mediaKind,
        textHash,
        parts: artifact.parts,
      }) !== artifact.contentHash
    )
      throw new ConflictException('receipt_artifact_hash_mismatch');
    const references =
      receipt.mode === 'raw'
        ? []
        : (receipt.snapshot?.generationRules.assets ?? []).filter(
            (asset) => asset.contentHash,
          );
    const selected = [
      ...references.filter((asset) => asset.required),
      ...references.filter((asset) => !asset.required),
    ].slice(0, 8);
    const assets = selected.length
      ? await this.prisma.asset.findMany({
          where: {
            id: { in: selected.map((asset) => asset.assetId) },
            parentType: AssetParent.BRAND,
            parentOrgId: actor.organizationId,
            parentBrandId: actor.brandId,
            isDeleted: false,
          },
        })
      : [];
    const acquired: BrandArtifactValidationMaterialV1['references'][number][] =
      [];
    for (const reference of selected) {
      const asset = assets.find((row) => row.id === reference.assetId);
      if (!asset)
        throw new NotFoundException({ message: 'receipt_reference_not_found' });
      const prefix =
        reference.role === 'logo'
          ? 'logos'
          : reference.role === 'banner'
            ? 'banners'
            : 'references';
      const key = this.key(
        asset.cloudObjectKey ??
          (reference.role === 'font' ? null : `${prefix}/${asset.id}`),
        true,
      );
      const { bytes } = await this.read(
        key,
        undefined,
        STORAGE_READ_MAX_BYTES - materialBytes,
      );
      materialBytes += bytes.byteLength;
      this.limit(materialBytes);
      if (this.hash(bytes) !== reference.contentHash)
        throw new ConflictException('receipt_reference_hash_mismatch');
      acquired.push({
        assetReferenceId: reference.id,
        assetId: reference.assetId,
        bytes,
      });
    }
    material.references = acquired;
    return { receipt, material };
  }
}
