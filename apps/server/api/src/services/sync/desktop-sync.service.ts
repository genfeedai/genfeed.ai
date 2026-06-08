import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { User } from '@clerk/backend';
import { IS_SELF_HOSTED } from '@genfeedai/config';
import { FileInputType } from '@genfeedai/enums';
import { AssetCategory, AssetParent } from '@genfeedai/prisma';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { DesktopBrandManifestQueryDto } from './dto/desktop-brand-manifest-query.dto';
import type {
  DesktopAssetDto,
  PushDesktopAssetsDto,
} from './dto/push-desktop-assets.dto';
import type { PushDesktopSyncOpsDto } from './dto/push-desktop-sync-ops.dto';
import type { PushDesktopThreadsDto } from './dto/push-desktop-threads.dto';
import type { RequestDesktopAssetUploadDto } from './dto/request-desktop-asset-upload.dto';
import type { UploadDesktopAssetDto } from './dto/upload-desktop-asset.dto';

type DesktopAssetPushResult = {
  cloudAssetId?: string;
  cloudObjectKey?: string | null;
  deletedAt?: Date | null;
  localAssetId: string;
  needsUpload?: boolean;
  reason?: string;
  residency?: string | null;
  status: 'accepted' | 'rejected';
  updatedAt?: Date;
  uploadPolicy?: string | null;
};

type DesktopSyncOpPushResult = {
  id: string;
  reason?: string;
  status: 'accepted' | 'rejected';
};

const MAX_DESKTOP_ASSET_BYTES = 500 * 1024 * 1024; // 500 MB
const MAX_PROXY_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB (body-based upload)
const MAX_ORGANIZATION_DESKTOP_STORAGE_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB

const ALLOWED_DESKTOP_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/aac',
  'audio/flac',
  'audio/ogg',
  'application/pdf',
]);

@Injectable()
export class DesktopSyncService {
  constructor(
    private readonly filesClientService: FilesClientService,
    private readonly prisma: PrismaService,
  ) {}

  private getCloudContext(user: User): {
    brandId: string;
    organizationId: string;
    userId: string;
  } {
    const publicMetadata = getPublicMetadata(user);

    if (!publicMetadata.organization || !publicMetadata.user) {
      throw new BadRequestException(
        'Desktop sync requires a selected Genfeed organization and user.',
      );
    }

    return {
      brandId: publicMetadata.brand,
      organizationId: publicMetadata.organization,
      userId: publicMetadata.user,
    };
  }

  private async getOrganizationDesktopStorageBytes(
    organizationId: string,
    excludeAssetId?: string,
  ): Promise<number> {
    const result = await this.prisma.asset.aggregate({
      _sum: { sizeBytes: true },
      where: {
        isDeleted: false,
        parentOrgId: organizationId,
        uploadPolicy: 'full',
        ...(excludeAssetId ? { id: { not: excludeAssetId } } : {}),
      },
    });

    return Number(result._sum.sizeBytes ?? 0);
  }

  private assertAllowedDesktopMimeType(mimeType: string): void {
    if (!ALLOWED_DESKTOP_MIME_TYPES.has(mimeType)) {
      throw new UnsupportedMediaTypeException(
        `MIME type "${mimeType}" is not allowed for desktop uploads`,
      );
    }
  }

  private async assertOrganizationDesktopStorageQuota(
    organizationId: string,
    incomingBytes: number,
    excludeAssetId?: string,
  ): Promise<void> {
    const usedBytes = await this.getOrganizationDesktopStorageBytes(
      organizationId,
      excludeAssetId,
    );
    const projectedBytes = usedBytes + incomingBytes;

    if (projectedBytes > MAX_ORGANIZATION_DESKTOP_STORAGE_BYTES) {
      throw new PayloadTooLargeException(
        `Desktop asset upload would exceed organization storage quota of ${(MAX_ORGANIZATION_DESKTOP_STORAGE_BYTES / 1024 / 1024 / 1024).toFixed(0)}GB`,
      );
    }
  }

  private getCloudObjectKey(
    organizationId: string,
    asset: Pick<DesktopAssetDto, 'displayName' | 'originalFileName' | 'sha256'>,
  ): string {
    const safeName = (asset.originalFileName ?? asset.displayName)
      .replace(/[^a-zA-Z0-9._-]/g, '-')
      .replace(/-+/g, '-');

    return `${organizationId}/${asset.sha256}/${safeName}`;
  }

  @LogMethod()
  async pullThreads(user: User, cursor?: string) {
    const { organizationId, userId } = this.getCloudContext(user);
    const threads = await this.prisma.desktopThread.findMany({
      include: { messages: { orderBy: { createdAt: 'asc' } } },
      orderBy: { updatedAt: 'desc' },
      where: {
        organizationId,
        userId,
        ...(cursor ? { updatedAt: { gt: new Date(cursor) } } : {}),
      },
    });

    const updatedCursor = new Date().toISOString();

    return {
      data: {
        threads: threads.map((t) => ({
          createdAt: t.createdAt,
          id: t.id,
          messages: t.messages.map((m) => ({
            content: m.content,
            createdAt: m.createdAt,
            draftId: m.draftId,
            generatedContent: m.generatedContent,
            id: m.id,
            role: m.role,
          })),
          status: t.status,
          title: t.title,
          updatedAt: t.updatedAt,
          workspaceId: t.workspaceId,
        })),
        updatedCursor,
      },
    };
  }

  @LogMethod()
  async pushThreads(user: User, dto: PushDesktopThreadsDto) {
    const { organizationId, userId } = this.getCloudContext(user);
    let accepted = 0;
    let rejected = 0;

    for (const thread of dto.threads) {
      try {
        const existing = await this.prisma.desktopThread.findUnique({
          select: { organizationId: true, updatedAt: true, userId: true },
          where: { id: thread.id },
        });

        if (
          existing &&
          (existing.userId !== userId ||
            existing.organizationId !== organizationId)
        ) {
          rejected++;
          continue;
        }

        if (!existing || thread.updatedAt > existing.updatedAt.toISOString()) {
          await this.prisma.desktopThread.upsert({
            create: {
              createdAt: new Date(thread.createdAt),
              id: thread.id,
              localUserId: dto.localUserId,
              organizationId,
              status: thread.status ?? 'idle',
              title: thread.title,
              updatedAt: new Date(thread.updatedAt),
              userId,
              workspaceId: thread.workspaceId,
            },
            update: {
              createdAt: new Date(thread.createdAt),
              localUserId: dto.localUserId,
              organizationId,
              status: thread.status ?? 'idle',
              title: thread.title,
              updatedAt: new Date(thread.updatedAt),
              userId,
              workspaceId: thread.workspaceId,
            },
            where: { id: thread.id },
          });

          if (thread.messages.length > 0) {
            await this.prisma.desktopMessage.createMany({
              data: thread.messages.map((msg) => ({
                content: msg.content,
                createdAt: new Date(msg.createdAt),
                draftId: msg.draftId,
                generatedContent: msg.generatedContent ?? undefined,
                id: msg.id,
                role: msg.role,
                threadId: thread.id,
              })),
              skipDuplicates: true,
            });
          }

          accepted++;
        } else {
          rejected++;
        }
      } catch {
        rejected++;
      }
    }

    return {
      data: {
        accepted,
        rejected,
        updatedCursor: new Date().toISOString(),
      },
    };
  }

  @LogMethod()
  async getBrandManifest(user: User, query: DesktopBrandManifestQueryDto) {
    const { brandId: selectedBrandId, organizationId } =
      this.getCloudContext(user);
    const brandId = query.brandId ?? selectedBrandId;
    const updatedAfter = query.cursor ? new Date(query.cursor) : undefined;

    const [organization, brands, ingredients, assets] = await Promise.all([
      this.prisma.organization.findFirst({
        select: {
          id: true,
          label: true,
          slug: true,
          updatedAt: true,
        },
        where: { id: organizationId, isDeleted: false },
      }),
      this.prisma.brand.findMany({
        orderBy: { updatedAt: 'desc' },
        select: {
          backgroundColor: true,
          defaultImageModel: true,
          defaultImageToVideoModel: true,
          defaultMusicModel: true,
          defaultVideoModel: true,
          description: true,
          id: true,
          isDeleted: true,
          isDefault: true,
          label: true,
          organizationId: true,
          primaryColor: true,
          secondaryColor: true,
          slug: true,
          text: true,
          updatedAt: true,
        },
        where: {
          organizationId,
          ...(brandId ? { id: brandId } : {}),
          ...(updatedAfter ? {} : { isDeleted: false }),
          ...(updatedAfter ? { updatedAt: { gt: updatedAfter } } : {}),
        },
      }),
      this.prisma.ingredient.findMany({
        orderBy: { updatedAt: 'desc' },
        select: {
          brandId: true,
          category: true,
          cdnUrl: true,
          createdAt: true,
          fileSize: true,
          id: true,
          isDeleted: true,
          metadata: {
            select: {
              description: true,
              duration: true,
              height: true,
              label: true,
              size: true,
              width: true,
            },
          },
          mimeType: true,
          organizationId: true,
          s3Key: true,
          status: true,
          updatedAt: true,
        },
        take: 500,
        where: {
          organizationId,
          ...(brandId ? { brandId } : {}),
          ...(updatedAfter ? {} : { isDeleted: false }),
          ...(updatedAfter ? { updatedAt: { gt: updatedAfter } } : {}),
        },
      }),
      this.prisma.asset.findMany({
        orderBy: { updatedAt: 'desc' },
        select: {
          cloudObjectKey: true,
          createdAt: true,
          deletedAt: true,
          displayName: true,
          id: true,
          isDeleted: true,
          kind: true,
          localAssetId: true,
          mimeType: true,
          origin: true,
          originalFileName: true,
          parentBrandId: true,
          parentOrgId: true,
          residency: true,
          sha256: true,
          sizeBytes: true,
          updatedAt: true,
          uploadPolicy: true,
        },
        take: 500,
        where: {
          parentOrgId: organizationId,
          ...(brandId ? { parentBrandId: brandId } : {}),
          ...(updatedAfter ? {} : { isDeleted: false }),
          ...(updatedAfter ? { updatedAt: { gt: updatedAfter } } : {}),
        },
      }),
    ]);

    return {
      data: {
        assets,
        brands,
        ingredients,
        organization,
        updatedCursor: new Date().toISOString(),
      },
    };
  }

  @LogMethod()
  async pushAssets(user: User, dto: PushDesktopAssetsDto) {
    const { brandId, organizationId, userId } = this.getCloudContext(user);
    let accepted = 0;
    let rejected = 0;
    let projectedStorageBytes: number | null = null;
    const assets: DesktopAssetPushResult[] = [];

    for (const asset of dto.assets) {
      try {
        if (asset.sizeBytes > MAX_DESKTOP_ASSET_BYTES) {
          rejected++;
          assets.push({
            localAssetId: asset.id,
            reason: 'file-too-large',
            status: 'rejected',
          });
          continue;
        }

        if (asset.mimeType && !ALLOWED_DESKTOP_MIME_TYPES.has(asset.mimeType)) {
          rejected++;
          assets.push({
            localAssetId: asset.id,
            reason: 'unsupported-mime-type',
            status: 'rejected',
          });
          continue;
        }

        const parentBrandId =
          asset.brandId === 'desktop-local-brand'
            ? brandId || null
            : asset.brandId || brandId || null;
        const parentType = parentBrandId
          ? AssetParent.BRAND
          : AssetParent.ORGANIZATION;
        const existing = await this.prisma.asset.findFirst({
          where: {
            parentOrgId: organizationId,
            userId,
            OR: [
              { localAssetId: asset.id },
              { sha256: asset.sha256, sizeBytes: asset.sizeBytes },
            ],
          },
        });

        if (existing?.deletedAt || existing?.isDeleted) {
          rejected++;
          assets.push({
            cloudAssetId: existing.id,
            cloudObjectKey: existing.cloudObjectKey,
            deletedAt: existing.deletedAt,
            localAssetId: asset.id,
            reason: 'cloud-deleted',
            residency: existing.residency,
            status: 'rejected',
            updatedAt: existing.updatedAt,
            uploadPolicy: existing.uploadPolicy,
          });
          continue;
        }

        const uploadPolicy = asset.uploadPolicy;
        if (uploadPolicy === 'full') {
          projectedStorageBytes ??=
            await this.getOrganizationDesktopStorageBytes(organizationId);
          const existingSize =
            existing?.uploadPolicy === 'full'
              ? Number(existing.sizeBytes ?? 0)
              : 0;
          const nextProjectedStorageBytes: number =
            projectedStorageBytes - existingSize + asset.sizeBytes;

          if (
            nextProjectedStorageBytes > MAX_ORGANIZATION_DESKTOP_STORAGE_BYTES
          ) {
            rejected++;
            assets.push({
              localAssetId: asset.id,
              reason: 'storage-quota-exceeded',
              status: 'rejected',
            });
            continue;
          }

          projectedStorageBytes = nextProjectedStorageBytes;
        }

        const cloudObjectKey =
          uploadPolicy === 'full'
            ? this.getCloudObjectKey(organizationId, asset)
            : undefined;
        const record = existing
          ? await this.prisma.asset.update({
              data: {
                category: AssetCategory.REFERENCE,
                cloudObjectKey: existing.cloudObjectKey ?? cloudObjectKey,
                displayName: asset.displayName,
                kind: asset.kind,
                localAssetId: asset.id,
                mimeType: asset.mimeType,
                origin: asset.origin,
                originalFileName: asset.originalFileName,
                parentBrandId,
                parentOrgId: organizationId,
                parentType,
                residency:
                  uploadPolicy === 'full' && existing.residency !== 'synced'
                    ? 'upload-pending'
                    : (existing.residency ?? asset.residency),
                sha256: asset.sha256,
                sizeBytes: asset.sizeBytes,
                uploadPolicy,
              },
              where: { id: existing.id },
            })
          : await this.prisma.asset.create({
              data: {
                category: AssetCategory.REFERENCE,
                cloudObjectKey,
                displayName: asset.displayName,
                kind: asset.kind,
                localAssetId: asset.id,
                mimeType: asset.mimeType,
                origin: asset.origin,
                originalFileName: asset.originalFileName,
                parentBrandId,
                parentOrgId: organizationId,
                parentType,
                residency:
                  uploadPolicy === 'full' ? 'upload-pending' : asset.residency,
                sha256: asset.sha256,
                sizeBytes: asset.sizeBytes,
                uploadPolicy,
                userId,
              },
            });

        accepted++;
        assets.push({
          cloudAssetId: record.id,
          cloudObjectKey: record.cloudObjectKey,
          localAssetId: asset.id,
          needsUpload: uploadPolicy === 'full' && record.residency !== 'synced',
          residency: record.residency,
          status: 'accepted',
          updatedAt: record.updatedAt,
          uploadPolicy: record.uploadPolicy,
        });
      } catch {
        rejected++;
        assets.push({
          localAssetId: asset.id,
          reason: 'invalid-asset',
          status: 'rejected',
        });
      }
    }

    return {
      data: {
        accepted,
        assets,
        rejected,
        updatedCursor: new Date().toISOString(),
      },
    };
  }

  @LogMethod()
  async requestAssetUpload(user: User, dto: RequestDesktopAssetUploadDto) {
    const { organizationId, userId } = this.getCloudContext(user);
    const asset = await this.prisma.asset.findFirst({
      where: {
        isDeleted: false,
        localAssetId: dto.assetId,
        parentOrgId: organizationId,
        userId,
      },
    });

    if (!asset) {
      throw new NotFoundException('Desktop asset metadata was not found.');
    }

    const effectiveMime = dto.mimeType ?? asset.mimeType ?? '';
    if (effectiveMime) {
      this.assertAllowedDesktopMimeType(effectiveMime);
    }

    await this.assertOrganizationDesktopStorageQuota(
      organizationId,
      Number(asset.sizeBytes ?? 0),
      asset.id,
    );

    const logicalObjectKey = (
      asset.cloudObjectKey ??
      this.getCloudObjectKey(organizationId, {
        displayName: asset.displayName ?? dto.originalFileName ?? asset.id,
        originalFileName:
          asset.originalFileName ?? dto.originalFileName ?? asset.id,
        sha256: asset.sha256 ?? asset.id,
      })
    ).replace(/^ingredients\/desktop-assets\//, '');

    const { publicUrl, s3Key, uploadUrl } =
      await this.filesClientService.getPresignedUploadUrl(
        logicalObjectKey,
        'desktop-assets',
        dto.mimeType ?? asset.mimeType ?? 'application/octet-stream',
        3600,
      );

    await this.prisma.asset.update({
      data: {
        cloudObjectKey: s3Key,
        residency: 'upload-pending',
      },
      where: { id: asset.id },
    });

    return {
      data: {
        cloudAssetId: asset.id,
        cloudObjectKey: s3Key,
        expiresIn: 3600,
        publicUrl,
        s3Key,
        uploadMode: IS_SELF_HOSTED ? 'api-proxy' : 'presigned-put',
        uploadUrl,
      },
    };
  }

  @LogMethod()
  async confirmAssetUpload(user: User, id: string) {
    const { organizationId, userId } = this.getCloudContext(user);
    const asset = await this.prisma.asset.findFirst({
      where: {
        id,
        isDeleted: false,
        parentOrgId: organizationId,
        userId,
      },
    });

    if (!asset) {
      throw new NotFoundException('Desktop asset upload was not found.');
    }

    const updated = await this.prisma.asset.update({
      data: {
        residency: 'synced',
      },
      where: { id },
    });

    return {
      data: {
        cloudAssetId: updated.id,
        cloudObjectKey: updated.cloudObjectKey,
        residency: updated.residency,
        updatedAt: updated.updatedAt,
      },
    };
  }

  @LogMethod()
  async uploadAsset(user: User, id: string, dto: UploadDesktopAssetDto) {
    const { organizationId, userId } = this.getCloudContext(user);
    const asset = await this.prisma.asset.findFirst({
      where: {
        id,
        isDeleted: false,
        parentOrgId: organizationId,
        userId,
      },
    });

    if (!asset) {
      throw new NotFoundException('Desktop asset upload was not found.');
    }

    const buffer = Buffer.from(dto.data, 'base64');

    if (buffer.length > MAX_PROXY_UPLOAD_BYTES) {
      throw new PayloadTooLargeException(
        `Asset size ${(buffer.length / 1024 / 1024).toFixed(2)}MB exceeds proxy upload limit of ${(MAX_PROXY_UPLOAD_BYTES / 1024 / 1024).toFixed(0)}MB`,
      );
    }

    const uploadMime =
      dto.mimeType ?? asset.mimeType ?? 'application/octet-stream';
    if (uploadMime) {
      this.assertAllowedDesktopMimeType(uploadMime);
    }

    await this.assertOrganizationDesktopStorageQuota(
      organizationId,
      buffer.length,
      asset.id,
    );

    const logicalObjectKey = (
      asset.cloudObjectKey ??
      this.getCloudObjectKey(organizationId, {
        displayName: asset.displayName ?? dto.originalFileName ?? asset.id,
        originalFileName:
          asset.originalFileName ?? dto.originalFileName ?? asset.id,
        sha256: asset.sha256 ?? asset.id,
      })
    ).replace(/^ingredients\/desktop-assets\//, '');

    await this.filesClientService.uploadToS3(
      logicalObjectKey,
      'desktop-assets',
      {
        contentType: uploadMime,
        data: buffer,
        type: FileInputType.BUFFER,
      },
    );

    const cloudObjectKey = `ingredients/desktop-assets/${logicalObjectKey}`;
    const updated = await this.prisma.asset.update({
      data: {
        cloudObjectKey,
        residency: 'synced',
      },
      where: { id },
    });

    return {
      data: {
        cloudAssetId: updated.id,
        cloudObjectKey: updated.cloudObjectKey,
        residency: updated.residency,
        updatedAt: updated.updatedAt,
      },
    };
  }

  @LogMethod()
  async pushOps(user: User, dto: PushDesktopSyncOpsDto) {
    const { organizationId, userId } = this.getCloudContext(user);
    let accepted = 0;
    let rejected = 0;
    const ops: DesktopSyncOpPushResult[] = [];

    for (const op of dto.ops) {
      try {
        if (op.entityType === 'asset' && op.operation === 'delete') {
          await this.prisma.asset.updateMany({
            data: { deletedAt: new Date(), isDeleted: true },
            where: {
              localAssetId: op.entityId,
              parentOrgId: organizationId,
              userId,
            },
          });
        }

        accepted++;
        ops.push({ id: op.id, status: 'accepted' });
      } catch {
        rejected++;
        ops.push({ id: op.id, reason: 'op-failed', status: 'rejected' });
      }
    }

    return {
      data: {
        accepted,
        ops,
        rejected,
        updatedCursor: new Date().toISOString(),
      },
    };
  }
}
