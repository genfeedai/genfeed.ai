import { createHash } from 'node:crypto';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { hashBrandedGenerationArtifactManifestV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import {
  bindBrandedPostMaterialLayout,
  brandedPostMaterialSelect,
  describeBrandedPostMaterialLayout,
} from '@api/services/branded-generation-receipts/branded-generation-post-material.util';
import { BrandedGenerationReceiptAccessService } from '@api/services/branded-generation-receipts/branded-generation-receipt-access.service';
import { BrandedGenerationReceiptsService } from '@api/services/branded-generation-receipts/branded-generation-receipts.service';
import type {
  BrandedGenerationAcquiredMaterialV1,
  BrandedGenerationActorV1,
  BrandedGenerationArtifactBindingV1,
} from '@api/services/branded-generation-receipts/branded-generation-receipts.types';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AssetParent, IngredientCategory } from '@genfeedai/contracts';
import type {
  BrandArtifactValidationMaterialV1,
  BrandGenerationArtifactV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
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
        select: brandedPostMaterialSelect,
      });
    });
    if (!post)
      throw new NotFoundException({ message: 'receipt_artifact_not_found' });
    const layout = describeBrandedPostMaterialLayout(actor, post);
    let materialBytes = layout.textBytes?.byteLength ?? 0;
    this.limit(materialBytes);
    const parts: BrandGenerationArtifactV1['parts'] = [];
    for (const entry of layout.entries) {
      if (entry.kind === 'text') {
        materialBytes += entry.bytes.byteLength;
        this.limit(materialBytes);
        parts.push({
          id: entry.id,
          role: entry.role,
          version: entry.version,
          contentHash: entry.contentHash,
        });
      } else {
        const { bytes, version } = await this.read(
          this.key(entry.id),
          undefined,
          STORAGE_READ_MAX_BYTES - materialBytes,
        );
        materialBytes += bytes.byteLength;
        this.limit(materialBytes);
        parts.push({
          id: entry.id,
          role: entry.role,
          version,
          contentHash: this.hash(bytes),
        });
      }
    }
    return bindBrandedPostMaterialLayout(layout, parts);
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
        select: brandedPostMaterialSelect,
      });
      if (!post)
        throw new NotFoundException({ message: 'receipt_artifact_not_found' });
      const layout = describeBrandedPostMaterialLayout(actor, post);
      if (layout.format !== receipt.format)
        throw new BadRequestException('receipt_artifact_unsupported');
      const current = bindBrandedPostMaterialLayout(layout, artifact.parts);
      if (
        current.artifact.version !== artifact.version ||
        current.artifact.mediaKind !== artifact.mediaKind
      )
        throw new ConflictException('receipt_artifact_version_mismatch');
      textHash = layout.textHash;
      material.textBytes = layout.textBytes;
      materialBytes = layout.textBytes?.byteLength ?? 0;
      this.limit(materialBytes);
      const acquiredParts: BrandArtifactValidationMaterialV1['parts'][number][] =
        [];
      for (let index = 0; index < layout.entries.length; index += 1) {
        const entry = layout.entries[index];
        const part = artifact.parts[index];
        const bytes =
          entry.kind === 'text'
            ? entry.bytes
            : (
                await this.read(
                  this.key(entry.id),
                  part.version,
                  STORAGE_READ_MAX_BYTES - materialBytes,
                )
              ).bytes;
        materialBytes += bytes.byteLength;
        this.limit(materialBytes);
        if (this.hash(bytes) !== part.contentHash)
          throw new ConflictException('receipt_artifact_hash_mismatch');
        acquiredParts.push({
          partId: part.id,
          partVersion: part.version,
          bytes,
        });
      }
      material.parts = acquiredParts;
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
    material.references = await this.acquireReferences(
      actor,
      receipt,
      materialBytes,
    );
    return { receipt, material };
  }

  private async acquireReferences(
    actor: BrandedGenerationActorV1,
    receipt: BrandedGenerationAcquiredMaterialV1['receipt'],
    materialBytes: number,
  ): Promise<BrandArtifactValidationMaterialV1['references']> {
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
    return acquired;
  }
}
