import type { UpdateBrandKitVisualIdentityDto } from '@api/collections/brands/dto/update-brand-kit-visual-identity.dto';
import { BrandKitAssetsService } from '@api/collections/brands/services/brand-kit-assets.service';
import { BrandWatermarkLogoService } from '@api/collections/brands/services/brand-watermark-logo.service';
import { assertBrandKitRequiredTextContextFits } from '@api/collections/brands/utils/brand-kit-required-context.util';
import {
  validateBrandOsDiagnostics,
  validateBrandOsEvidence,
} from '@api/collections/brands/utils/brand-os-revision-validation.util';
import {
  brandVisualIdentityColumns,
  parseVisualIdentity,
  withVisualIdentity,
} from '@api/collections/brands/utils/brand-visual-identity.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { rulesOwnerVideoJoins } from '@api/services/branded-generation-receipts/brand-identity-snapshot-projection.util';
import { hashBrandGenerationRulesReviewV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  brandFontRolesSchema,
  brandPaletteSchema,
} from '@genfeedai/contracts/api-types/contracts/brand-kit-style.contract';
import { parseBrandPublishPolicy } from '@genfeedai/contracts/api-types/contracts/brand-publish-policy.contract';
import {
  brandFinishingColumns,
  buildBrandVideoFinishing,
  parseBrandVideoFinishing,
} from '@genfeedai/contracts/api-types/contracts/brand-video-finishing.contract';
import {
  isOwnerVideoRulesValid,
  reconcileOwnerVideoRules,
} from '@genfeedai/contracts/api-types/contracts/brand-video-identity.contract';
import { brandVideoRulesV1Schema } from '@genfeedai/contracts/api-types/contracts/brand-video-rules.contract';
import type {
  IBrandKitDraft,
  IBrandOsRevision,
} from '@genfeedai/contracts/interfaces';
import { BRAND_KIT_FIELD_OWNERSHIP } from '@genfeedai/contracts/interfaces';
import {
  type BrandKitSourceBrand,
  buildBrandKitDraftFromBrand,
  buildGenfeedDefaultKitDraft,
  hasOwnBrandVoice,
  isGenfeedDefaultKitDraft,
  stripGenfeedDefaultKit,
} from '@genfeedai/helpers';
import {
  type Brand,
  type BrandOsRevision,
  BrandOsRevisionStatus,
  Prisma,
  toPrismaJson,
} from '@genfeedai/prisma';
import { Traced } from '@libs/tracing/traced';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

const SHA256_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

@Traced()
@Injectable()
export class BrandOsRevisionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assets: BrandKitAssetsService,
    private readonly watermarkLogos: BrandWatermarkLogoService,
  ) {}

  async list(
    organizationId: string,
    brandId: string,
  ): Promise<IBrandOsRevision[]> {
    await this.requireBrand(this.prisma, organizationId, brandId);
    let rows = await this.prisma.brandOsRevision.findMany({
      orderBy: { version: 'desc' },
      where: { brandId, isDeleted: false, organizationId },
    });
    if (rows.length === 0) {
      await this.ensureInitial(organizationId, brandId);
      rows = await this.prisma.brandOsRevision.findMany({
        orderBy: { version: 'desc' },
        where: { brandId, isDeleted: false, organizationId },
      });
    }
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
      orderBy: { version: 'desc' },
      where: {
        brandId,
        isDeleted: false,
        organizationId,
        sourcePreviewTokenHash: tokenHash ?? { not: null },
        status: tokenHash ? undefined : BrandOsRevisionStatus.DRAFT,
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
          (await this.buildSeedContent(
            brand,
            organizationId,
            brandId,
            !existing,
          )),
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

  /**
   * Returns the revision a branded generation should resolve for a brand,
   * creating the starting DRAFT when none is live. A brand nobody has described
   * starts from the Genfeed default style kit; a brand with its own voice starts
   * from its own fields. The default is retired as soon as the brand gains its
   * own voice. Never touches approved, scanned or owner-edited revisions.
   */
  async ensureBaselineDraft(
    organizationId: string,
    brandId: string,
  ): Promise<IBrandOsRevision> {
    return this.prisma.$transaction(async (tx) => {
      const brand = await this.lockBrand(tx, organizationId, brandId);
      const rows = await tx.brandOsRevision.findMany({
        orderBy: { version: 'desc' },
        where: { brandId, isDeleted: false, organizationId },
      });
      const live = rows.filter(
        (row) => row.status !== BrandOsRevisionStatus.SUPERSEDED,
      );
      const existing =
        live.find((row) => row.status === BrandOsRevisionStatus.APPROVED) ??
        live[0];
      const hasOwnVoice = hasOwnBrandVoice(brand.agentConfig);
      if (
        existing &&
        !(
          existing.status === BrandOsRevisionStatus.DRAFT &&
          isGenfeedDefaultKitDraft(
            existing.content as unknown as IBrandKitDraft,
          ) &&
          hasOwnVoice
        )
      )
        return this.toRevision(existing);
      if (existing)
        await this.retireDefaultKitRows(tx, organizationId, brandId);
      const content = await this.buildSeedContent(
        brand,
        organizationId,
        brandId,
        rows.length === 0,
      );
      return this.createDraft(
        tx,
        organizationId,
        brandId,
        this.normalize(content, organizationId, brandId),
      );
    });
  }

  async create(
    organizationId: string,
    brandId: string,
    content: IBrandKitDraft,
    transaction?: Prisma.TransactionClient,
  ): Promise<IBrandOsRevision> {
    const normalized = this.normalize(content, organizationId, brandId);
    const write = async (
      tx: Prisma.TransactionClient,
    ): Promise<IBrandOsRevision> => {
      await this.lockBrand(tx, organizationId, brandId);
      if (!isGenfeedDefaultKitDraft(normalized))
        await this.retireDefaultKitRows(tx, organizationId, brandId);
      return this.createDraft(
        tx,
        organizationId,
        brandId,
        await this.withApprovedVideoSections(
          tx,
          organizationId,
          brandId,
          await this.withApprovedPolicy(
            tx,
            organizationId,
            brandId,
            normalized,
          ),
        ),
      );
    };
    return transaction ? write(transaction) : this.prisma.$transaction(write);
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
        select: { content: true, status: true, updatedAt: true },
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
      let hasOwnedFieldEdit = false;
      for (const owner of BRAND_KIT_FIELD_OWNERSHIP) {
        const field = normalized.fields[owner.key];
        const before = previous.fields[owner.key];
        if (
          field &&
          JSON.stringify(field.proposedValue ?? field.currentValue) !==
            JSON.stringify(before?.proposedValue ?? before?.currentValue)
        ) {
          hasOwnedFieldEdit = true;
          field.evidence = [
            { label: 'Owner edit', sourceType: 'manual' },
            ...field.evidence.filter(
              (evidence) => evidence?.sourceType !== 'manual',
            ),
          ];
          delete field.confidence;
        }
      }
      const persisted = this.resolveDefaultKitContent(
        previous,
        normalized,
        hasOwnedFieldEdit,
      );
      return this.saveDraft(tx, organizationId, brandId, persisted, {
        ...row,
        id,
      });
    });
  }

  /** Apply explicitly selected visual fields and keep the editor's draft in sync. */
  async applyVisualIdentity(
    organizationId: string,
    brandId: string,
    patch: UpdateBrandKitVisualIdentityDto,
  ): Promise<IBrandOsRevision> {
    const values = parseVisualIdentity(patch);
    return this.prisma.$transaction(async (tx) => {
      const brand = await this.lockBrand(tx, organizationId, brandId);
      const revision = await tx.brandOsRevision.findFirst({
        orderBy: { version: 'desc' },
        where: {
          brandId,
          isDeleted: false,
          organizationId,
          status: { not: BrandOsRevisionStatus.SUPERSEDED },
        },
      });
      const previous = revision
        ? (revision.content as unknown as IBrandKitDraft)
        : await this.buildCurrentBrandContent(brand, organizationId, brandId);
      const persisted = this.normalize(
        this.resolveDefaultKitContent(
          previous,
          withVisualIdentity(previous, values),
          true,
        ),
        organizationId,
        brandId,
      );
      // sql-risk-audit: ignore bulk-write-tenant-review -- scoped by the locked brand id and organization.
      await tx.brand.updateMany({
        data: brandVisualIdentityColumns(values),
        where: { id: brandId, isDeleted: false, organizationId },
      });
      return this.saveDraft(tx, organizationId, brandId, persisted, revision);
    });
  }

  private async saveDraft(
    tx: Prisma.TransactionClient,
    organizationId: string,
    brandId: string,
    content: IBrandKitDraft,
    revision: Pick<BrandOsRevision, 'id' | 'status' | 'updatedAt'> | null,
  ): Promise<IBrandOsRevision> {
    if (!revision || revision.status === BrandOsRevisionStatus.APPROVED)
      return this.createDraft(tx, organizationId, brandId, content);
    return this.toRevision(
      await tx.brandOsRevision.update({
        data: {
          content: toPrismaJson(content),
          generationRulesReviewHash: null,
          updatedAt: new Date(
            Math.max(Date.now(), revision.updatedAt.getTime() + 1),
          ),
        },
        where: { brandId, id: revision.id, isDeleted: false, organizationId },
      }),
    );
  }

  async approve(
    organizationId: string,
    brandId: string,
    id: string,
    userId: string,
    updatedAt: string,
    reviewedGenerationRulesHash?: string,
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
      if (isGenfeedDefaultKitDraft(row.content as unknown as IBrandKitDraft))
        throw new ConflictException({
          code: 'brand_kit_default_requires_edit',
          message: 'Edit the Genfeed default style kit before approving it.',
        });
      const content = this.normalize(
        row.content as unknown as IBrandKitDraft,
        organizationId,
        brandId,
      );
      if (
        reviewedGenerationRulesHash !== undefined &&
        (typeof reviewedGenerationRulesHash !== 'string' ||
          reviewedGenerationRulesHash.length !== 71 ||
          !SHA256_DIGEST_PATTERN.test(reviewedGenerationRulesHash))
      )
        throw new BadRequestException('Invalid generation rules review hash');
      let generationRulesReviewHash: string | null = null;
      if (content.generationRules !== undefined) {
        try {
          generationRulesReviewHash = hashBrandGenerationRulesReviewV1(
            content.generationRules,
          );
        } catch {
          throw new BadRequestException('Invalid Brand OS generation rules');
        }
        if (reviewedGenerationRulesHash === undefined)
          throw new BadRequestException(
            'A valid generation rules review hash is required',
          );
        if (reviewedGenerationRulesHash !== generationRulesReviewHash)
          throw new ConflictException(
            'These generation rules changed. Reload and review them before approving.',
          );
      }
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
      assertBrandKitRequiredTextContextFits(row, content);
      content.assetCandidates = [];
      content.status = 'accepted';
      await this.syncApprovedStyle(tx, organizationId, brandId, content);
      await this.syncApprovedFinishing(tx, organizationId, brandId, content);
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
            generationRulesReviewHash,
            content: toPrismaJson(content),
            status: BrandOsRevisionStatus.APPROVED,
          },
          where: { brandId, id, isDeleted: false, organizationId },
        }),
      );
    });
  }

  /**
   * Palette, font roles and the visual direction live on the brand row too, so prompts and the agent
   * read the approved kit without resolving a revision. Only fields the
   * revision carries are written; a revision without them leaves the brand as
   * it is.
   */
  private async syncApprovedStyle(
    tx: Prisma.TransactionClient,
    organizationId: string,
    brandId: string,
    content: IBrandKitDraft,
  ): Promise<void> {
    const palette = brandPaletteSchema.safeParse(
      content.fields.colorPalette?.currentValue,
    );
    const fontRoles = brandFontRolesSchema.safeParse(
      content.fields.fontRoles?.currentValue,
    );
    const visualDirection = content.fields.visualDirection?.currentValue;
    const data: Prisma.BrandUpdateManyMutationInput = {
      ...(palette.success ? { colorPalette: toPrismaJson(palette.data) } : {}),
      ...(fontRoles.success ? { fontRoles: toPrismaJson(fontRoles.data) } : {}),
      ...(typeof visualDirection === 'string' ? { visualDirection } : {}),
    };
    if (Object.keys(data).length === 0) return;
    // sql-risk-audit: ignore bulk-write-tenant-review -- organizationId, isDeleted:false and the unique brand id bound the write to the one brand under the approval lock.
    await tx.brand.updateMany({
      data,
      where: { id: brandId, isDeleted: false, organizationId },
    });
  }

  /**
   * End card, colour grade and watermark live on the brand row too, because the
   * stitch and export code read it. Approving a revision is the only way those
   * columns change (#10187). The assets and the LUT file are checked first, so a
   * revision never approves settings the stitch would refuse. A revision
   * written before finishing existed leaves the brand as it is.
   */
  private async syncApprovedFinishing(
    tx: Prisma.TransactionClient,
    organizationId: string,
    brandId: string,
    content: IBrandKitDraft,
  ): Promise<void> {
    if (content.finishing === undefined) return;
    const finishing = parseBrandVideoFinishing(content.finishing);
    if (!finishing) throw new BadRequestException('Invalid Brand OS finishing');
    const columns = brandFinishingColumns(finishing);
    await this.watermarkLogos.validateKitSettings(
      brandId,
      organizationId,
      columns,
    );
    // sql-risk-audit: ignore bulk-write-tenant-review -- organizationId, isDeleted:false and the unique brand id bound the write to the one brand under the approval lock.
    await tx.brand.updateMany({
      data: columns,
      where: { id: brandId, isDeleted: false, organizationId },
    });
  }

  /**
   * A new draft that brings no finishing or video identity keeps the approved
   * one, so approving a fresh scan never drops them. A brand with no approved
   * finishing starts from its own row, so the Video tab always edits what the
   * stitch uses.
   */
  private async withApprovedVideoSections(
    tx: Prisma.TransactionClient,
    organizationId: string,
    brandId: string,
    content: IBrandKitDraft,
  ): Promise<IBrandKitDraft> {
    if (content.finishing !== undefined && content.video !== undefined)
      return content;
    const approved = await tx.brandOsRevision.findFirst({
      where: {
        brandId,
        isDeleted: false,
        organizationId,
        status: BrandOsRevisionStatus.APPROVED,
      },
      select: { content: true },
    });
    const approvedContent = approved?.content as unknown as
      | IBrandKitDraft
      | undefined;
    const next = { ...content };
    const video = brandVideoRulesV1Schema.safeParse(approvedContent?.video);
    const inherited = video.success
      ? reconcileOwnerVideoRules(rulesOwnerVideoJoins(next), video.data)
      : undefined;
    if (next.video === undefined && inherited) next.video = inherited;
    if (next.finishing !== undefined) return next;
    const carried = parseBrandVideoFinishing(approvedContent?.finishing);
    if (carried) return { ...next, finishing: carried };
    const brand = await tx.brand.findFirst({
      where: { id: brandId, isDeleted: false, organizationId },
    });
    return brand
      ? { ...next, finishing: buildBrandVideoFinishing(brand) }
      : next;
  }

  /**
   * The one place a revision is seeded from the brand itself. A brand with no
   * history and no voice of its own starts from the marked Genfeed default kit,
   * whichever path seeds it, so approve can refuse it until the owner edits it.
   */
  private async buildSeedContent(
    brand: Brand,
    organizationId: string,
    brandId: string,
    isFirstRevision: boolean,
  ): Promise<IBrandKitDraft> {
    if (isFirstRevision && !hasOwnBrandVoice(brand.agentConfig))
      return buildGenfeedDefaultKitDraft({
        description: brand.description,
        id: brandId,
        label: brand.label,
        organization: organizationId,
      });
    return this.buildCurrentBrandContent(brand, organizationId, brandId);
  }

  private async buildCurrentBrandContent(
    brand: Brand,
    organizationId: string,
    brandId: string,
  ): Promise<IBrandKitDraft> {
    const draft = buildBrandKitDraftFromBrand({
      ...brand,
      ...(await this.assets.resolveBrandKitAssets(brandId, organizationId)),
      agentConfig: this.legacyAgentConfig(brand.agentConfig),
      referenceImages: Array.isArray(brand.referenceImages)
        ? brand.referenceImages.filter(
            (value): value is string => typeof value === 'string',
          )
        : [],
    });
    return { ...draft, finishing: buildBrandVideoFinishing(brand) };
  }

  /**
   * Hides unapproved Genfeed default-kit drafts. Those rows have no approver,
   * and `brand_os_revisions_approval_metadata` rejects SUPERSEDED unless
   * approvedById and approvedAt are both set. Soft-delete leaves a legal DRAFT
   * and drops the row from live reads. Approved revisions are superseded only
   * by approve(), which already has that metadata.
   */
  private async retireDefaultKitRows(
    tx: Prisma.TransactionClient,
    organizationId: string,
    brandId: string,
  ): Promise<void> {
    const drafts = await tx.brandOsRevision.findMany({
      select: { content: true, id: true },
      where: {
        brandId,
        isDeleted: false,
        organizationId,
        status: BrandOsRevisionStatus.DRAFT,
      },
    });
    const ids = drafts
      .filter((row) =>
        isGenfeedDefaultKitDraft(row.content as unknown as IBrandKitDraft),
      )
      .map((row) => row.id);
    if (ids.length === 0) return;
    await tx.brandOsRevision.updateMany({
      data: { isDeleted: true },
      where: {
        brandId,
        id: { in: ids },
        isDeleted: false,
        organizationId,
        status: BrandOsRevisionStatus.DRAFT,
      },
    });
  }

  /**
   * A new draft that brings no Policy keeps the approved one (#7339), so
   * approving a fresh scan never drops the brand's publishing guardrails.
   */
  private async withApprovedPolicy(
    tx: Prisma.TransactionClient,
    organizationId: string,
    brandId: string,
    content: IBrandKitDraft,
  ): Promise<IBrandKitDraft> {
    if (content.policy !== undefined) return content;
    const approved = await tx.brandOsRevision.findFirst({
      where: {
        brandId,
        isDeleted: false,
        organizationId,
        status: BrandOsRevisionStatus.APPROVED,
      },
      select: { content: true },
    });
    const policy = parseBrandPublishPolicy(
      (approved?.content as unknown as IBrandKitDraft | undefined)?.policy,
    );
    return policy ? { ...content, policy } : content;
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

  private legacyAgentConfig(
    value: unknown,
  ): BrandKitSourceBrand['agentConfig'] {
    const object = (input: unknown): Record<string, unknown> =>
      input && typeof input === 'object' && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : {};
    const text = (input: unknown): string | undefined =>
      typeof input === 'string' ? input : undefined;
    const strings = (input: unknown): string[] | undefined =>
      Array.isArray(input)
        ? input.filter((item): item is string => typeof item === 'string')
        : undefined;
    const config = object(value);
    const voice = object(config.voice);
    const strategy = object(config.strategy);
    return {
      voice: {
        tone: text(voice.tone),
        style: text(voice.style),
        audience: strings(voice.audience),
        values: strings(voice.values),
        messagingPillars: strings(voice.messagingPillars),
        doNotSoundLike: strings(voice.doNotSoundLike),
        sampleOutput: text(voice.sampleOutput),
      },
      strategy: {
        contentTypes: strings(strategy.contentTypes),
        platforms: strings(strategy.platforms),
        goals: strings(strategy.goals),
        frequency: text(strategy.frequency),
      },
    };
  }

  /**
   * A save that does not change an owned field or the generation rules is not
   * an edit. Keep the Genfeed default marker even when the client dropped it,
   * so a later approve still refuses the seeded kit.
   */
  private resolveDefaultKitContent(
    previous: IBrandKitDraft,
    normalized: IBrandKitDraft,
    hasOwnedFieldEdit: boolean,
  ): IBrandKitDraft {
    if (!isGenfeedDefaultKitDraft(previous)) return normalized;
    if (hasOwnedFieldEdit) return stripGenfeedDefaultKit(normalized);
    const sentRules = normalized.generationRules;
    const rulesChanged =
      sentRules !== undefined &&
      JSON.stringify(sentRules) !== JSON.stringify(previous.generationRules);
    if (rulesChanged) {
      const stripped = stripGenfeedDefaultKit(normalized);
      return { ...stripped, generationRules: sentRules };
    }
    const retained: IBrandKitDraft = {
      ...normalized,
      evidence: structuredClone(previous.evidence),
      sourceType: previous.sourceType,
    };
    if (previous.generationRules === undefined) {
      Reflect.deleteProperty(retained, 'generationRules');
      return retained;
    }
    retained.generationRules = structuredClone(previous.generationRules);
    return retained;
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
    validateBrandOsEvidence(content.evidence);
    validateBrandOsDiagnostics(content.diagnostics);
    validateBrandOsDiagnostics(content.readiness.diagnostics);
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
      validateBrandOsEvidence(field.evidence);
      validateBrandOsDiagnostics(field.diagnostics);
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
        if (
          owner.valueKind === 'palette' &&
          !brandPaletteSchema.safeParse(value).success
        )
          throw new BadRequestException(`Invalid ${key} palette`);
        if (
          owner.valueKind === 'fontRoles' &&
          !brandFontRolesSchema.safeParse(value).success
        )
          throw new BadRequestException(`Invalid ${key} font roles`);
      }
    }
    const normalized = structuredClone(content);
    if (content.policy !== undefined) {
      const policy = parseBrandPublishPolicy(content.policy);
      if (!policy) throw new BadRequestException('Invalid Brand OS Policy');
      normalized.policy = policy;
    }
    if (content.finishing !== undefined) {
      const finishing = parseBrandVideoFinishing(content.finishing);
      if (!finishing)
        throw new BadRequestException('Invalid Brand OS finishing');
      normalized.finishing = finishing;
    }
    if (content.video !== undefined) {
      const video = brandVideoRulesV1Schema.safeParse(content.video);
      if (
        !video.success ||
        !isOwnerVideoRulesValid(rulesOwnerVideoJoins(content), video.data)
      )
        throw new BadRequestException('Invalid Brand OS video identity');
      normalized.video = video.data;
    }
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

  private toRevision(row: BrandOsRevision): IBrandOsRevision {
    const content = row.content as unknown as IBrandKitDraft;
    let generationRulesReviewCandidateHash: string | undefined;
    if (
      row.status === BrandOsRevisionStatus.DRAFT &&
      content?.generationRules !== undefined
    ) {
      try {
        generationRulesReviewCandidateHash = hashBrandGenerationRulesReviewV1(
          content.generationRules,
        );
      } catch {
        // Invalid saved rules remain readable for recovery, without review authority.
      }
    }
    return {
      approvedAt: row.approvedAt?.toISOString() ?? null,
      approvedById: row.approvedById,
      brandId: row.brandId,
      content,
      createdAt: row.createdAt.toISOString(),
      exportSchemaVersion: row.exportSchemaVersion,
      ...(generationRulesReviewCandidateHash
        ? { generationRulesReviewCandidateHash }
        : {}),
      ...(row.generationRulesReviewHash !== null
        ? { generationRulesReviewHash: row.generationRulesReviewHash }
        : {}),
      id: row.id,
      organizationId: row.organizationId,
      status: row.status,
      updatedAt: row.updatedAt.toISOString(),
      version: row.version,
    };
  }
}
