import { BrandKitAssetsService } from '@api/collections/brands/services/brand-kit-assets.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  IBrandKitDraft,
  IBrandOsRevision,
} from '@genfeedai/contracts/interfaces';
import { BRAND_KIT_FIELD_OWNERSHIP } from '@genfeedai/contracts/interfaces';
import {
  type BrandKitSourceBrand,
  buildBrandKitDraftFromBrand,
} from '@genfeedai/helpers';
import {
  type BrandOsRevision,
  BrandOsRevisionStatus,
  Prisma,
  toPrismaJson,
} from '@genfeedai/prisma';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class BrandOsRevisionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assets: BrandKitAssetsService,
  ) {}

  async list(
    organizationId: string,
    brandId: string,
  ): Promise<IBrandOsRevision[]> {
    await this.ensureInitial(organizationId, brandId);
    const rows = await this.prisma.brandOsRevision.findMany({
      orderBy: { version: 'desc' },
      where: { brandId, isDeleted: false, organizationId },
    });
    return rows.map((row) => this.toRevision(row));
  }

  async get(
    organizationId: string,
    brandId: string,
    id: string,
  ): Promise<IBrandOsRevision> {
    await this.requireBrand(this.prisma, organizationId, brandId);
    const row = await this.prisma.brandOsRevision.findFirst({
      where: { brandId, id, isDeleted: false, organizationId },
    });
    if (!row) throw new NotFoundException('Brand OS revision');
    return this.toRevision(row);
  }

  async findApproved(
    organizationId: string,
    brandId: string,
  ): Promise<IBrandOsRevision | null> {
    const brand = await this.prisma.brand.findFirst({
      where: { id: brandId, isDeleted: false, organizationId },
      select: { id: true },
    });
    if (!brand) return null;
    const row = await this.prisma.brandOsRevision.findFirst({
      where: {
        brandId,
        isDeleted: false,
        organizationId,
        status: BrandOsRevisionStatus.APPROVED,
      },
    });
    return row ? this.toRevision(row) : null;
  }

  async findClaimed(
    organizationId: string,
    brandId: string,
    tokenHash?: string,
  ): Promise<IBrandOsRevision | null> {
    const row = await this.prisma.brandOsRevision.findFirst({
      orderBy: { version: 'asc' },
      where: {
        brandId,
        isDeleted: false,
        organizationId,
        sourcePreviewTokenHash: tokenHash ?? { not: null },
      },
    });
    return row ? this.toRevision(row) : null;
  }

  async ensureInitial(
    organizationId: string,
    brandId: string,
    content?: IBrandKitDraft,
    sourcePreviewTokenHash?: string,
  ): Promise<IBrandOsRevision> {
    return this.prisma.$transaction(async (tx) => {
      const brand = await this.lockBrand(tx, organizationId, brandId);
      if (sourcePreviewTokenHash) {
        const claimed = await tx.brandOsRevision.findFirst({
          where: {
            brandId,
            isDeleted: false,
            organizationId,
            sourcePreviewTokenHash,
          },
        });
        if (claimed) return this.toRevision(claimed);
      }
      const existing = await tx.brandOsRevision.findFirst({
        orderBy: { version: 'desc' },
        where: { brandId, isDeleted: false, organizationId },
      });
      if (existing && !sourcePreviewTokenHash) return this.toRevision(existing);
      const draft = this.normalize(
        content ??
          buildBrandKitDraftFromBrand({
            ...brand,
            ...(await this.assets.resolveBrandKitAssets(
              brandId,
              organizationId,
            )),
            agentConfig:
              brand.agentConfig &&
              typeof brand.agentConfig === 'object' &&
              !Array.isArray(brand.agentConfig)
                ? (brand.agentConfig as BrandKitSourceBrand['agentConfig'])
                : undefined,
            referenceImages: Array.isArray(brand.referenceImages)
              ? brand.referenceImages.filter(
                  (value): value is string => typeof value === 'string',
                )
              : [],
          }),
        organizationId,
        brandId,
      );
      return this.toRevision(
        await tx.brandOsRevision.create({
          data: {
            brandId,
            content: toPrismaJson(draft),
            organizationId,
            sourcePreviewTokenHash,
            version: await this.nextVersion(tx, organizationId, brandId),
          },
        }),
      );
    });
  }

  async create(
    organizationId: string,
    brandId: string,
    content: IBrandKitDraft,
  ): Promise<IBrandOsRevision> {
    const normalized = this.normalize(content, organizationId, brandId);
    return this.prisma.$transaction(async (tx) => {
      await this.lockBrand(tx, organizationId, brandId);
      return this.createDraft(tx, organizationId, brandId, normalized);
    });
  }

  async update(
    organizationId: string,
    brandId: string,
    id: string,
    content: IBrandKitDraft,
    updatedAt: string,
  ): Promise<IBrandOsRevision> {
    const normalized = this.normalize(content, organizationId, brandId);
    return this.prisma.$transaction(async (tx) => {
      await this.lockBrand(tx, organizationId, brandId);
      const row = await tx.brandOsRevision.findFirst({
        where: { brandId, id, isDeleted: false, organizationId },
      });
      if (!row) throw new NotFoundException('Brand OS revision');
      if (row.updatedAt.toISOString() !== updatedAt)
        throw new ConflictException(
          'This revision changed. Reload it before saving.',
        );
      if (row.status === BrandOsRevisionStatus.SUPERSEDED)
        throw new ConflictException(
          'Superseded revisions cannot be edited. Create a new draft.',
        );
      const previous = row.content as unknown as IBrandKitDraft;
      for (const owner of BRAND_KIT_FIELD_OWNERSHIP) {
        const field = normalized.fields[owner.key];
        const before = previous.fields[owner.key];
        if (
          field &&
          JSON.stringify(field.proposedValue ?? field.currentValue) !==
            JSON.stringify(before?.proposedValue ?? before?.currentValue)
        ) {
          field.evidence = [
            { label: 'Owner edit', sourceType: 'manual' },
            ...field.evidence.filter(
              (evidence) => evidence?.sourceType !== 'manual',
            ),
          ];
          delete field.confidence;
        }
      }
      if (row.status === BrandOsRevisionStatus.APPROVED)
        return this.createDraft(tx, organizationId, brandId, normalized);
      return this.toRevision(
        await tx.brandOsRevision.update({
          data: {
            content: toPrismaJson(normalized),
            updatedAt: new Date(
              Math.max(Date.now(), row.updatedAt.getTime() + 1),
            ),
          },
          where: { brandId, id, isDeleted: false, organizationId },
        }),
      );
    });
  }

  async approve(
    organizationId: string,
    brandId: string,
    id: string,
    userId: string,
    updatedAt: string,
  ): Promise<IBrandOsRevision> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockBrand(tx, organizationId, brandId);
      const row = await tx.brandOsRevision.findFirst({
        where: { brandId, id, isDeleted: false, organizationId },
      });
      if (!row) throw new NotFoundException('Brand OS revision');
      if (row.status === BrandOsRevisionStatus.APPROVED)
        return this.toRevision(row);
      if (row.status === BrandOsRevisionStatus.SUPERSEDED)
        throw new ConflictException(
          'A superseded revision cannot be approved again.',
        );
      if (row.updatedAt.toISOString() !== updatedAt)
        throw new ConflictException(
          'This revision changed. Reload it before approving.',
        );
      const content = this.normalize(
        row.content as unknown as IBrandKitDraft,
        organizationId,
        brandId,
      );
      for (const [key, field] of Object.entries(content.fields)) {
        if (!field) continue;
        if (field.applyActionDefault === 'reject') {
          Reflect.deleteProperty(content.fields, key);
          continue;
        }
        if (
          field.applyActionDefault === 'accept' &&
          field.proposedValue !== undefined
        )
          field.currentValue = field.proposedValue;
        delete field.proposedValue;
      }
      content.assetCandidates = [];
      content.status = 'accepted';
      await tx.brandOsRevision.updateMany({
        data: { status: BrandOsRevisionStatus.SUPERSEDED },
        where: {
          brandId,
          isDeleted: false,
          organizationId,
          status: BrandOsRevisionStatus.APPROVED,
        },
      });
      return this.toRevision(
        await tx.brandOsRevision.update({
          data: {
            approvedAt: new Date(),
            approvedById: userId,
            content: toPrismaJson(content),
            status: BrandOsRevisionStatus.APPROVED,
          },
          where: { brandId, id, isDeleted: false, organizationId },
        }),
      );
    });
  }

  private async createDraft(
    tx: Prisma.TransactionClient,
    organizationId: string,
    brandId: string,
    content: IBrandKitDraft,
  ): Promise<IBrandOsRevision> {
    return this.toRevision(
      await tx.brandOsRevision.create({
        data: {
          brandId,
          content: toPrismaJson(content),
          organizationId,
          version: await this.nextVersion(tx, organizationId, brandId),
        },
      }),
    );
  }

  private async nextVersion(
    tx: Prisma.TransactionClient,
    organizationId: string,
    brandId: string,
  ): Promise<number> {
    const brand = await tx.brand.update({
      data: { brandOsRevisionVersion: { increment: 1 } },
      where: { id: brandId, isDeleted: false, organizationId },
      select: { brandOsRevisionVersion: true },
    });
    return brand.brandOsRevisionVersion;
  }

  private async requireBrand(
    tx: Prisma.TransactionClient,
    organizationId: string,
    brandId: string,
  ) {
    const brand = await tx.brand.findFirst({
      where: { id: brandId, isDeleted: false, organizationId },
    });
    if (!brand) throw new NotFoundException('Brand');
    return brand;
  }

  private async lockBrand(
    tx: Prisma.TransactionClient,
    organizationId: string,
    brandId: string,
  ) {
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "brands" WHERE "id" = ${brandId} AND "organizationId" = ${organizationId} AND "isDeleted" = false FOR UPDATE`,
    );
    return this.requireBrand(tx, organizationId, brandId);
  }

  private normalize(
    content: IBrandKitDraft,
    organizationId: string,
    brandId: string,
  ): IBrandKitDraft {
    if (
      !content ||
      typeof content !== 'object' ||
      !content.fields ||
      typeof content.fields !== 'object' ||
      Array.isArray(content.fields) ||
      !Array.isArray(content.evidence) ||
      !Array.isArray(content.diagnostics) ||
      !Array.isArray(content.assetCandidates) ||
      !content.readiness ||
      !Array.isArray(content.readiness.requiredFields) ||
      !Array.isArray(content.readiness.missingFields) ||
      !Array.isArray(content.readiness.diagnostics) ||
      typeof content.readiness.score !== 'number' ||
      JSON.stringify(content).length > 250_000
    ) {
      throw new BadRequestException('Invalid Brand OS content');
    }
    if (
      ![
        'ready',
        'partial',
        'missing',
        'blocked',
        'accepted',
        'discarded',
      ].includes(content.status) ||
      ![
        'current_brand',
        'website',
        'manual',
        'uploaded_guidance',
        'system',
      ].includes(content.sourceType)
    )
      throw new BadRequestException(
        'Invalid Brand OS content status or source',
      );
    this.validateEvidence(content.evidence);
    this.validateDiagnostics(content.diagnostics);
    this.validateDiagnostics(content.readiness.diagnostics);
    if (
      !['complete', 'partial', 'blocked', 'missing'].includes(
        content.readiness.status,
      ) ||
      !Number.isFinite(content.readiness.score) ||
      content.readiness.score < 0 ||
      content.readiness.score > 100
    )
      throw new BadRequestException('Invalid Brand OS readiness');
    for (const [key, field] of Object.entries(content.fields)) {
      const owner = BRAND_KIT_FIELD_OWNERSHIP.find(
        (candidate) => candidate.key === key,
      );
      if (
        !owner ||
        !field ||
        field.key !== key ||
        !Array.isArray(field.evidence) ||
        !Array.isArray(field.diagnostics) ||
        !['accept', 'reject', 'preserve'].includes(field.applyActionDefault)
      )
        throw new BadRequestException('Invalid Brand OS field');
      this.validateEvidence(field.evidence);
      this.validateDiagnostics(field.diagnostics);
      for (const value of [field.currentValue, field.proposedValue]) {
        if (value === undefined) continue;
        if (owner.valueKind === 'string' && typeof value !== 'string')
          throw new BadRequestException(`Invalid ${key} value`);
        if (
          owner.valueKind === 'string[]' &&
          (!Array.isArray(value) ||
            value.some((item) => typeof item !== 'string'))
        )
          throw new BadRequestException(`Invalid ${key} values`);
        if (
          ['socialLinks', 'asset[]'].includes(owner.valueKind) &&
          (!Array.isArray(value) ||
            value.some((item) => !item || typeof item !== 'object'))
        )
          throw new BadRequestException(`Invalid ${key} entries`);
        if (
          owner.valueKind === 'asset' &&
          (!value || typeof value !== 'object' || Array.isArray(value))
        )
          throw new BadRequestException(`Invalid ${key} asset`);
      }
    }
    const normalized = structuredClone(content);
    for (const owner of BRAND_KIT_FIELD_OWNERSHIP) {
      const field = normalized.fields[owner.key];
      if (field) {
        field.label = owner.label;
        field.group = owner.group;
        field.ownerPath = owner.ownerPath;
      }
    }
    return { ...normalized, brandId, id: brandId, organizationId };
  }

  private validateEvidence(entries: unknown[]): void {
    for (const entry of entries) {
      if (
        !entry ||
        typeof entry !== 'object' ||
        !('label' in entry) ||
        typeof entry.label !== 'string' ||
        !('sourceType' in entry) ||
        typeof entry.sourceType !== 'string' ||
        ![
          'current_brand',
          'website',
          'manual',
          'uploaded_guidance',
          'system',
        ].includes(entry.sourceType)
      )
        throw new BadRequestException('Invalid Brand OS evidence');
      for (const key of ['url', 'excerpt', 'sourceId']) {
        const value: unknown = Reflect.get(entry, key);
        if (value !== undefined && typeof value !== 'string')
          throw new BadRequestException('Invalid Brand OS evidence value');
      }
    }
  }

  private validateDiagnostics(entries: unknown[]): void {
    for (const entry of entries) {
      if (
        !entry ||
        typeof entry !== 'object' ||
        !('code' in entry) ||
        typeof entry.code !== 'string' ||
        !('message' in entry) ||
        typeof entry.message !== 'string' ||
        !('severity' in entry) ||
        typeof entry.severity !== 'string' ||
        !['info', 'warning', 'error'].includes(entry.severity)
      )
        throw new BadRequestException('Invalid Brand OS diagnostic');
    }
  }

  private toRevision(row: BrandOsRevision): IBrandOsRevision {
    return {
      approvedAt: row.approvedAt?.toISOString() ?? null,
      approvedById: row.approvedById,
      brandId: row.brandId,
      content: row.content as unknown as IBrandKitDraft,
      createdAt: row.createdAt.toISOString(),
      exportSchemaVersion: row.exportSchemaVersion,
      id: row.id,
      organizationId: row.organizationId,
      status: row.status,
      updatedAt: row.updatedAt.toISOString(),
      version: row.version,
    };
  }
}
