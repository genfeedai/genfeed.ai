import { BrandRemixRunPlanningService } from '@api/collections/content-runs/services/brand-remix-run-planning.service';
import { BrandRemixSceneSourceService } from '@api/collections/content-runs/services/brand-remix-scene-source.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { StoryboardPlan } from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import type {
  StoryboardSourceSelector,
  StoryboardSourceSnapshot,
} from '@genfeedai/contracts/api-types/contracts/storyboard-source.contract';
import { ConflictException, Injectable } from '@nestjs/common';

@Injectable()
export class StoryboardSourceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planning: BrandRemixRunPlanningService,
    private readonly videos: BrandRemixSceneSourceService,
  ) {}

  async resolve(
    organizationId: string,
    brandId: string,
    source: StoryboardSourceSelector,
  ): Promise<StoryboardSourceSnapshot> {
    const capturedAt = new Date().toISOString();
    if (source.kind === 'brief') {
      if (source.seedImageAssetId)
        await this.requireImage(
          organizationId,
          brandId,
          source.seedImageAssetId,
        );
      return { selector: source, capturedAt };
    }
    if (source.kind === 'uploaded_video') {
      const video = await this.videos.libraryAsset(
        organizationId,
        brandId,
        source.assetId,
      );
      const asset = await this.prisma.ingredient.findFirst({
        where: scopedWhere(organizationId, { brandId, id: source.assetId }),
        select: { label: true, updatedAt: true },
      });
      if (!asset || asset.updatedAt.toISOString() !== video.assetUpdatedAt)
        throw new ConflictException(
          'The video changed while preparing this draft. Select it again.',
        );
      return {
        selector: source,
        capturedAt,
        assetId: source.assetId,
        assetUpdatedAt: video.assetUpdatedAt,
        title: asset.label ?? '',
        durationSeconds: video.durationSeconds,
        sizeBytes: video.sizeBytes,
      };
    }
    if (source.kind === 'connected_ad')
      await this.planning.assertConnectedCredential(
        organizationId,
        brandId,
        source.credentialId,
        source.platform,
      );
    return (await this.planning.resolveSource(organizationId, brandId, source))
      .snapshot;
  }

  async revalidate(
    organizationId: string,
    brandId: string,
    snapshot: StoryboardSourceSnapshot,
  ): Promise<void> {
    const current = await this.resolve(
      organizationId,
      brandId,
      snapshot.selector,
    );
    if (
      'assetUpdatedAt' in snapshot &&
      (!('assetUpdatedAt' in current) ||
        current.assetUpdatedAt !== snapshot.assetUpdatedAt ||
        current.durationSeconds !== snapshot.durationSeconds ||
        current.sizeBytes !== snapshot.sizeBytes)
    )
      throw new ConflictException(
        'The source video changed. Select it again before analysis or generation.',
      );
  }

  private async requireImage(
    organizationId: string,
    brandId: string,
    assetId: string,
  ) {
    const image = await this.prisma.ingredient.findFirst({
      where: scopedWhere(organizationId, {
        brandId,
        id: assetId,
        category: 'IMAGE' as const,
        scope: 'USER' as const,
        status: {
          in: ['UPLOADED' as const, 'GENERATED' as const, 'VALIDATED' as const],
        },
      }),
      select: { id: true },
    });
    if (!image) throw new NotFoundException('Storyboard image', assetId);
  }

  async validatePlanAssets(
    organizationId: string,
    brandId: string,
    plan: StoryboardPlan,
  ): Promise<void> {
    const ids = [
      ...new Set([
        ...plan.styleReferenceAssetIds,
        ...plan.cast.flatMap((member) => [
          ...member.referenceAssetIds,
          ...(member.avatarAssetId ? [member.avatarAssetId] : []),
          ...(member.voiceId ? [member.voiceId] : []),
        ]),
        ...plan.shots.flatMap((shot) =>
          shot.stillAssetId ? [shot.stillAssetId] : [],
        ),
      ]),
    ];
    if (!ids.length) return;
    const [ingredients, references] = await Promise.all([
      this.prisma.ingredient.findMany({
        where: scopedWhere(organizationId, {
          OR: [{ brandId }, { brandId: null }],
          id: { in: ids },
          status: {
            in: [
              'UPLOADED' as const,
              'GENERATED' as const,
              'VALIDATED' as const,
            ],
          },
        }),
        select: { id: true, category: true },
      }),
      this.prisma.asset.findMany({
        where: {
          isDeleted: false,
          category: 'REFERENCE',
          id: { in: ids },
          OR: [
            { parentBrandId: brandId, parentOrgId: organizationId },
            { parentBrandId: null, parentOrgId: organizationId },
          ],
        },
        select: { id: true },
      }),
    ]);
    const available = new Set(
      [...ingredients, ...references].map((asset) => asset.id),
    );
    if (ids.some((id) => !available.has(id)))
      throw new NotFoundException(
        'Storyboard reference or identity not found.',
      );
    const byId = new Map(ingredients.map((asset) => [asset.id, asset]));
    if (
      plan.shots.some(
        (shot) =>
          shot.stillAssetId &&
          byId.get(shot.stillAssetId)?.category !== 'IMAGE',
      ) ||
      plan.cast.some(
        (member) =>
          (member.voiceId && byId.get(member.voiceId)?.category !== 'VOICE') ||
          (member.avatarAssetId &&
            byId.get(member.avatarAssetId)?.category !== 'IMAGE'),
      )
    )
      throw new ConflictException(
        'Storyboard stills, avatar images and voices must use the correct asset category.',
      );
  }
}
