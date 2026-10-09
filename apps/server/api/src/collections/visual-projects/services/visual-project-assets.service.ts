import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { stampIngredientGenerationEntry } from '@api/collections/ingredients/utils/ingredient-generation-entry.util';
import { VisualProjectAuthorizationService } from '@api/collections/visual-projects/services/visual-project-authorization.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  IngredientCategory,
  IngredientOrigin,
  IngredientStatus,
  MetadataExtension,
} from '@genfeedai/contracts';
import { VISUAL_CODE_LIMITS } from '@genfeedai/contracts/constants';
import type {
  IVisualCodeMedia,
  IVisualSandboxAsset,
  IVisualSandboxMedia,
} from '@genfeedai/contracts/interfaces';
import { toPrismaJson, type VisualRevision } from '@genfeedai/prisma';
import { createStorageProvider } from '@genfeedai/storage';
import {
  ConflictException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { z } from 'zod';

const mimeByExtension: Record<string, string> = {
  PNG: 'image/png',
  JPG: 'image/jpeg',
  JPEG: 'image/jpeg',
  MP4: 'video/mp4',
  MP3: 'audio/mpeg',
  WAV: 'audio/wav',
};
const allowedCategories = new Set<string>([
  IngredientCategory.IMAGE,
  IngredientCategory.VIDEO,
  IngredientCategory.AUDIO,
  IngredientCategory.MUSIC,
  IngredientCategory.VOICE,
]);
export function visualOutputId(
  label: string,
  revision: VisualRevision,
  index: number,
): string {
  return `c${createHash('sha256')
    .update(
      JSON.stringify([
        label,
        revision.organizationId,
        revision.brandId,
        revision.id,
        index,
      ]),
    )
    .digest('hex')
    .slice(0, 24)}`;
}
@Injectable()
export class VisualProjectAssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: VisualProjectAuthorizationService,
    private readonly ingredients: IngredientsService,
  ) {}
  async authorize(user: AuthenticatedUser, brandId: string, ids: string[]) {
    await this.authorization.authorizeBrand(user, brandId);
    const rows = await this.prisma.ingredient.findMany({
      where: {
        id: { in: ids },
        organizationId: user.organizationId,
        brandId,
        isDeleted: false,
      },
      include: { metadata: true },
    });
    if (rows.length !== ids.length)
      throw new UnprocessableEntityException('visual_source_asset_unavailable');
    for (const row of rows) {
      const key = row.s3Key;
      if (
        !key ||
        key.startsWith('/') ||
        key.includes('..') ||
        key.includes('://') ||
        !row.metadata ||
        !allowedCategories.has(row.category) ||
        !mimeByExtension[row.metadata.extension]
      )
        throw new UnprocessableEntityException(
          'visual_source_asset_not_canonical',
        );
      const size = row.fileSize ?? row.metadata.size;
      if (!size || size > VISUAL_CODE_LIMITS.inputBytes)
        throw new UnprocessableEntityException(
          'visual_source_asset_size_unavailable',
        );
    }
    return rows;
  }
  async stage(
    user: AuthenticatedUser,
    revision: VisualRevision,
  ): Promise<IVisualSandboxAsset[]> {
    const ids = z.array(z.string()).parse(revision.sourceAssetIds);
    const rows = await this.authorize(user, revision.brandId, ids);
    const storage = createStorageProvider();
    const directory = await mkdtemp(join(tmpdir(), 'visual-assets-'));
    let total = 0;
    try {
      const results: IVisualSandboxAsset[] = [];
      for (const id of ids) {
        const row = rows.find((value) => value.id === id);
        if (!row?.s3Key || !row.metadata)
          throw new UnprocessableEntityException(
            'visual_source_asset_unavailable',
          );
        const target = join(directory, id);
        await storage.download(row.s3Key, target, directory);
        total += (await stat(target)).size;
        if (total > 48 * 1024 * 1024)
          throw new UnprocessableEntityException(
            'visual_source_assets_too_large',
          );
        results.push({
          id,
          mime: mimeByExtension[row.metadata.extension],
          bytes: (await readFile(target)).toString('base64'),
        });
      }
      return results;
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
  async previews(
    user: AuthenticatedUser,
    revision: VisualRevision,
    media: IVisualSandboxMedia[],
    attempt: number,
  ): Promise<IVisualCodeMedia[]> {
    await this.authorization.authorizeBrand(user, revision.brandId);
    const storage = createStorageProvider();
    const result: IVisualCodeMedia[] = [];
    for (const [index, item] of media.entries()) {
      const key = `visual-code/${revision.organizationId}/${revision.brandId}/${revision.id}/diagnostics/${attempt}-${index}.png`;
      const url = await storage.upload(
        Buffer.from(item.bytes, 'base64'),
        key,
        'image/png',
      );
      result.push({
        url,
        format: 'png',
        width: item.width,
        height: item.height,
        frame: item.frame,
      });
    }
    return result;
  }
  private outputRecord(
    revision: VisualRevision,
    item: IVisualSandboxMedia,
    index: number,
    bytes: Buffer,
  ) {
    return {
      id: visualOutputId('ingredient', revision, index),
      organization: { connect: { id: revision.organizationId } },
      brand: { connect: { id: revision.brandId } },
      user: { connect: { id: revision.userId } },
      category:
        item.format === 'mp4'
          ? IngredientCategory.VIDEO
          : IngredientCategory.IMAGE,
      origin: IngredientOrigin.GENERATED,
      status: IngredientStatus.PROCESSING,
      s3Key: `visual-code/${revision.organizationId}/${revision.brandId}/${revision.id}/outputs/${index}.${item.format}`,
      mimeType: item.format === 'mp4' ? 'video/mp4' : `image/${item.format}`,
      fileSize: bytes.length,
      generationSource: `visual-code:${revision.projectId}@${revision.number}`,
      modelUsed: revision.prompt ? revision.modelKey : null,
      sourceActionId: 'visual-code.generate',
      providerData: toPrismaJson(
        stampIngredientGenerationEntry(IngredientOrigin.GENERATED, {
          projectId: revision.projectId,
          revisionId: revision.id,
          sourceHash: revision.sourceHash,
          rendererVersion: revision.rendererVersion,
          sourceAssetIds: revision.sourceAssetIds,
          outputHash: createHash('sha256').update(bytes).digest('hex'),
          authoringModel: revision.prompt ? revision.modelKey : null,
          inspectionModel: revision.modelKey,
        }),
      ),
      metadata: {
        create: {
          id: visualOutputId('metadata', revision, index),
          label: `Visual ${revision.number} / ${index + 1}`,
          extension:
            item.format === 'mp4'
              ? MetadataExtension.MP4
              : item.format === 'png'
                ? MetadataExtension.PNG
                : MetadataExtension.JPEG,
          result: '',
          width: item.width,
          height: item.height,
          size: bytes.length,
          duration:
            item.format === 'mp4'
              ? Number(
                  (revision.settings as Record<string, unknown>).durationFrames,
                ) / Number((revision.settings as Record<string, unknown>).fps)
              : 0,
          fps:
            item.format === 'mp4'
              ? Number((revision.settings as Record<string, unknown>).fps)
              : null,
        },
      },
    };
  }
  async commit(
    user: AuthenticatedUser,
    revision: VisualRevision,
    media: IVisualSandboxMedia[],
    assertOwnership: () => Promise<void>,
  ): Promise<IVisualCodeMedia[]> {
    await assertOwnership();
    await this.authorization.authorizeBrand(user, revision.brandId);
    await this.authorize(
      user,
      revision.brandId,
      z.array(z.string()).parse(revision.sourceAssetIds),
    );
    const storage = createStorageProvider();
    const outputs: IVisualCodeMedia[] = [];
    for (const [index, item] of media.entries()) {
      const bytes = Buffer.from(item.bytes, 'base64');
      if (bytes.length > VISUAL_CODE_LIMITS.resultBytes)
        throw new UnprocessableEntityException('visual_output_too_large');
      const id = visualOutputId('ingredient', revision, index);
      const metadataId = visualOutputId('metadata', revision, index);
      const key = `visual-code/${revision.organizationId}/${revision.brandId}/${revision.id}/outputs/${index}.${item.format}`;
      const generationSource = `visual-code:${revision.projectId}@${revision.number}`;
      const outputHash = createHash('sha256').update(bytes).digest('hex');
      const scope = {
        id,
        organizationId: revision.organizationId,
        brandId: revision.brandId,
        isDeleted: false,
      };
      const mime = item.format === 'mp4' ? 'video/mp4' : `image/${item.format}`;
      const verify = (value: {
        metadataId: string | null;
        s3Key: string | null;
        generationSource: string | null;
        providerData: unknown;
      }) => {
        const provenance = z
          .object({ sourceHash: z.string(), outputHash: z.string() })
          .passthrough()
          .safeParse(value.providerData);
        if (
          value.metadataId !== metadataId ||
          value.s3Key !== key ||
          value.generationSource !== generationSource ||
          !provenance.success ||
          provenance.data.sourceHash !== revision.sourceHash ||
          provenance.data.outputHash !== outputHash
        )
          throw new ConflictException('visual_output_collision');
      };
      await assertOwnership();
      await this.authorization.authorizeBrand(user, revision.brandId);
      await assertOwnership();
      const admitted = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM visual_revisions WHERE id=${revision.id} AND "organizationId"=${revision.organizationId} AND "brandId"=${revision.brandId} AND "isDeleted"=false FOR UPDATE`;
        const current = await tx.visualRevision.findFirstOrThrow({
          where: {
            id: revision.id,
            organizationId: revision.organizationId,
            brandId: revision.brandId,
            isDeleted: false,
          },
        });
        if (current.cancelRequestedAt)
          throw new ConflictException('visual_cancelled');
        const existing = await tx.ingredient.findFirst({
          where: scope,
          include: { metadata: true },
        });
        if (existing) {
          verify(existing);
          return existing;
        }
        return tx.ingredient.create({
          include: { metadata: true },
          data: this.outputRecord(revision, item, index, bytes),
        });
      });
      verify(admitted);
      await assertOwnership();
      const uploadedUrl =
        admitted.metadata?.result || (await storage.upload(bytes, key, mime));
      await assertOwnership();
      await this.authorization.authorizeBrand(user, revision.brandId);
      const canonical = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM visual_revisions WHERE id=${revision.id} AND "organizationId"=${revision.organizationId} AND "brandId"=${revision.brandId} AND "isDeleted"=false FOR UPDATE`;
        const current = await tx.visualRevision.findFirstOrThrow({
          where: {
            id: revision.id,
            organizationId: revision.organizationId,
            brandId: revision.brandId,
            isDeleted: false,
          },
        });
        if (current.cancelRequestedAt)
          throw new ConflictException('visual_cancelled');
        const existing = await tx.ingredient.findFirstOrThrow({
          where: scope,
          include: { metadata: true },
        });
        verify(existing);
        if (existing.metadata?.result) return existing;
        return tx.ingredient.update({
          where: scope,
          include: { metadata: true },
          data: { metadata: { update: { result: uploadedUrl } } },
        });
      });
      verify(canonical);
      const url = canonical.metadata?.result;
      if (!url) throw new ConflictException('visual_output_pending');
      await assertOwnership();
      await this.authorization.authorizeBrand(user, revision.brandId);
      const current = await this.prisma.visualRevision.findFirstOrThrow({
        where: {
          id: revision.id,
          organizationId: revision.organizationId,
          brandId: revision.brandId,
          isDeleted: false,
        },
      });
      if (current.cancelRequestedAt)
        throw new ConflictException('visual_cancelled');
      await assertOwnership();
      await this.ingredients.patch(id, { status: IngredientStatus.GENERATED });
      outputs.push({
        ingredientId: id,
        url,
        format: item.format,
        width: item.width,
        height: item.height,
        ...(item.frame === undefined ? {} : { frame: item.frame }),
      });
    }
    return outputs;
  }
}
