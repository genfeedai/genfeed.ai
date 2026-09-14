import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { MemberRole } from '@genfeedai/contracts';
import type {
  IBrandOsDesignArtifact,
  IBrandOsExportState,
} from '@genfeedai/contracts/interfaces';
import { buildBrandOsDesignExport } from '@genfeedai/helpers/brand-os-design-export.helper';
import {
  type BrandOsRevision,
  BrandOsRevisionStatus,
  Prisma,
} from '@genfeedai/prisma';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  ConflictException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';

@Injectable()
export class BrandOsExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  private async access(
    brandId: string,
    user: AuthenticatedUser,
    admin = false,
  ): Promise<boolean> {
    if (!user?.userId || !user.organizationId)
      throw new NotFoundException({ message: 'Not found' });
    const where = {
      brandId,
      isDeleted: false,
      organizationId: user.organizationId,
    };
    const [brand, member] = await Promise.all([
      this.prisma.brand.findFirst({
        select: { id: true },
        where: {
          id: brandId,
          isDeleted: false,
          organizationId: where.organizationId,
          organization: { isDeleted: false },
        },
      }),
      this.prisma.member.findFirst({
        select: { roleKey: true, role: { select: { key: true } } },
        where: {
          isActive: true,
          isDeleted: false,
          organizationId: where.organizationId,
          userId: user.userId,
        },
      }),
    ]);
    if (!brand || !member)
      throw new NotFoundException({ message: 'Not found' });
    const role = member.roleKey ?? member.role?.key;
    const canPublish = role === MemberRole.OWNER || role === MemberRole.ADMIN;
    if (admin && !canPublish)
      throw new NotFoundException({ message: 'Not found' });
    return canPublish;
  }

  private artifact(
    revision: BrandOsRevision,
    visibility: 'private' | 'public',
  ): IBrandOsDesignArtifact {
    if (
      revision.exportSchemaVersion !== '1' ||
      !revision.approvedAt ||
      revision.status === BrandOsRevisionStatus.DRAFT
    )
      throw new NotFoundException({ message: 'Not found' });
    try {
      return buildBrandOsDesignExport({
        approvedAt: revision.approvedAt.toISOString(),
        brandId: revision.brandId,
        content: revision.content,
        revisionId: revision.id,
        visibility,
      });
    } catch {
      throw new UnprocessableEntityException(
        'Approved Brand OS cannot be exported',
      );
    }
  }

  async state(
    brandId: string,
    user: AuthenticatedUser,
  ): Promise<IBrandOsExportState> {
    const canPublish = await this.access(brandId, user);
    const where = {
      brandId,
      isDeleted: false,
      organizationId: user.organizationId,
    };
    const [revision, publication] = await Promise.all([
      this.prisma.brandOsRevision.findFirst({
        orderBy: { version: 'desc' },
        where: { ...where, status: BrandOsRevisionStatus.APPROVED },
      }),
      this.prisma.brandOsPublication.findFirst({ where }),
    ]);
    const artifact = revision ? this.artifact(revision, 'private') : null;
    const published = publication && !publication.revokedAt;
    const publicUrl = published
      ? `${this.apiBase()}/public/brand-os/${publication.id}/design.md`
      : null;
    return {
      brandId,
      canPublish,
      digest: artifact?.digest ?? null,
      generatedAt: artifact?.generatedAt ?? null,
      id: brandId,
      publicUrl,
      publishedAt: publication?.publishedAt.toISOString() ?? null,
      publishedRevisionId: publication?.revisionId ?? null,
      revisionId: revision?.id ?? null,
      revisionUrl: published
        ? `${this.apiBase()}/public/brand-os/${publication.id}/${publication.revisionId}/design.md`
        : null,
      schemaVersion: '1',
      state: !revision
        ? 'unavailable'
        : published
          ? 'published'
          : publication?.revokedAt
            ? 'revoked'
            : 'private',
    };
  }

  async download(
    brandId: string,
    user: AuthenticatedUser,
  ): Promise<IBrandOsDesignArtifact> {
    await this.access(brandId, user);
    const revision = await this.prisma.brandOsRevision.findFirst({
      orderBy: { version: 'desc' },
      where: {
        brandId,
        isDeleted: false,
        organizationId: user.organizationId,
        status: BrandOsRevisionStatus.APPROVED,
      },
    });
    if (!revision) throw new NotFoundException({ message: 'Not found' });
    const artifact = this.artifact(revision, 'private');
    await this.audit('brand_os.export.download', user, brandId, revision.id);
    return artifact;
  }

  async publish(
    brandId: string,
    revisionId: string,
    user: AuthenticatedUser,
  ): Promise<IBrandOsExportState> {
    await this.access(brandId, user, true);
    const where = {
      brandId,
      isDeleted: false,
      organizationId: user.organizationId,
    };
    await this.transaction(async (tx) => {
      await this.lockBrand(tx, brandId, user.organizationId);
      const revision = await tx.brandOsRevision.findFirst({
        where: {
          ...where,
          id: revisionId,
          status: {
            in: [
              BrandOsRevisionStatus.APPROVED,
              BrandOsRevisionStatus.SUPERSEDED,
            ],
          },
        },
      });
      if (!revision) throw new NotFoundException({ message: 'Not found' });
      this.artifact(revision, 'public');
      const existing = await tx.brandOsPublication.findFirst({ where });
      if (existing?.revisionId === revisionId && !existing.revokedAt) return;
      const publishedRevisionIds =
        existing && !existing.revokedAt
          ? [...new Set([...existing.publishedRevisionIds, revisionId])]
          : [revisionId];
      await tx.brandOsPublication.upsert({
        create: {
          brandId,
          organizationId: user.organizationId,
          publishedById: user.userId,
          publishedRevisionIds,
          revisionId,
        },
        update: {
          isDeleted: false,
          publishedAt: new Date(),
          publishedById: user.userId,
          publishedRevisionIds,
          revisionId,
          revokedAt: null,
          revokedById: null,
        },
        where: {
          organizationId: user.organizationId,
          isDeleted: false,
          organizationId_brandId: {
            brandId,
            organizationId: user.organizationId,
          },
        },
      });
      await this.audit(
        'brand_os.export.publish',
        user,
        brandId,
        revisionId,
        tx,
      );
    });

    return this.state(brandId, user);
  }

  async revoke(
    brandId: string,
    user: AuthenticatedUser,
  ): Promise<IBrandOsExportState> {
    await this.access(brandId, user, true);
    await this.transaction(async (tx) => {
      await this.lockBrand(tx, brandId, user.organizationId);
      const result = await tx.brandOsPublication.updateMany({
        data: { revokedAt: new Date(), revokedById: user.userId },
        where: {
          brandId,
          isDeleted: false,
          organizationId: user.organizationId,
          revokedAt: null,
        },
      });
      if (result.count)
        await this.audit(
          'brand_os.export.revoke',
          user,
          brandId,
          undefined,
          tx,
        );
    });

    return this.state(brandId, user);
  }

  async publicArtifact(
    publicationId: string,
    revisionId?: string,
  ): Promise<IBrandOsDesignArtifact> {
    // tenant-scope-ignore: opaque public capability lookup resolves tenant before any content query.
    const publication = await this.prisma.brandOsPublication.findFirst({
      include: { brand: { select: { organizationId: true } } },
      where: {
        id: publicationId,
        isDeleted: false,
        revokedAt: null,
        brand: { isDeleted: false },
        organization: { isDeleted: false },
      },
    });
    if (
      !publication ||
      publication.brand.organizationId !== publication.organizationId ||
      (revisionId && !publication.publishedRevisionIds.includes(revisionId))
    )
      throw new NotFoundException({ message: 'Not found' });
    const revision = await this.prisma.brandOsRevision.findFirst({
      where: {
        brandId: publication.brandId,
        id: revisionId ?? publication.revisionId,
        isDeleted: false,
        organizationId: publication.organizationId,
        status: {
          in: [
            BrandOsRevisionStatus.APPROVED,
            BrandOsRevisionStatus.SUPERSEDED,
          ],
        },
      },
    });
    if (!revision) throw new NotFoundException({ message: 'Not found' });
    let artifact: IBrandOsDesignArtifact;
    try {
      artifact = this.artifact(revision, 'public');
    } catch {
      throw new NotFoundException({ message: 'Not found' });
    }
    await this.prisma.activity.create({
      data: {
        action: 'brand_os.export.public_read',
        brandId: publication.brandId,
        entityId: revision.id,
        entityModel: 'BrandOsRevision',
        organizationId: publication.organizationId,
      },
    });
    return artifact;
  }

  private async transaction(
    work: (tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.prisma.$transaction(work, {
          isolationLevel: 'Serializable',
        });
        return;
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          !['P2034', 'P2002'].includes(error.code)
        )
          throw error;
        if (attempt === 2)
          throw new ConflictException(
            'Publication changed concurrently; retry the request',
          );
      }
    }
  }

  private apiBase(): string {
    const base = (
      this.config.get('GENFEEDAI_API_URL') ?? 'https://api.genfeed.ai'
    ).replace(/\/$/, '');
    return base.endsWith('/v1') ? base : `${base}/v1`;
  }
  private async lockBrand(
    tx: Prisma.TransactionClient,
    brandId: string,
    organizationId: string,
  ): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT "id" FROM "brands" WHERE "id" = ${brandId} AND "organizationId" = ${organizationId} AND "isDeleted" = false FOR UPDATE`,
    );
    if (!rows.length) throw new NotFoundException({ message: 'Not found' });
  }
  private async audit(
    event: string,
    user: AuthenticatedUser,
    brandId: string,
    revisionId?: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    await tx.activity.create({
      data: {
        action: event,
        brandId,
        entityId: revisionId ?? brandId,
        entityModel: 'BrandOsRevision',
        organizationId: user.organizationId,
        userId: user.userId,
      },
    });
    this.logger.log(event, {
      actorId: user.userId,
      brandId,
      organizationId: user.organizationId,
      ...(revisionId ? { revisionId } : {}),
    });
  }
}
