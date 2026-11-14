import { BrandOsRevisionsService } from '@api/collections/brands/services/brand-os-revisions.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { findBlockingBrandOsRevision } from '@api/endpoints/admin/organization-brands/organization-brand-os.util';
import { hashBrandGenerationRulesReviewV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import type { BrandKitFieldKey } from '@genfeedai/contracts/interfaces';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  HttpCode,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';

const identifier = z.string().trim().min(1).max(200);
const text = z.string().trim().min(1).max(2000);
const list = z.array(z.string().trim().min(1).max(200)).max(20);

/**
 * The kit fields a platform admin sets before approving a brand's Brand OS.
 * They are the same voice and guideline fields the member-scoped kit apply
 * accepts, so nothing here can write outside the brand's own kit.
 */
const approveBrandOsSchema = z
  .object({
    description: text.optional(),
    promptGuidelines: text.optional(),
    voiceAudience: list.optional(),
    voiceDoNotSoundLike: list.optional(),
    voiceMessagingPillars: list.optional(),
    voiceSampleOutput: text.optional(),
    voiceStyle: text.optional(),
    voiceTone: text.optional(),
    voiceValues: list.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Nothing to apply',
  });

/**
 * Member-scoped Brand OS routes need an owner or admin login in the brand's
 * own organization, which a platform admin does not have. This route takes the
 * organization explicitly, applies the kit fields, starts the brand's own draft
 * and approves it, so one operator call leaves the brand with an approved
 * revision.
 */
@Controller('admin/organizations/:organizationId/brands/:brandId/brand-os')
@UseGuards(IpWhitelistGuard, SuperAdminGuard)
export class AdminOrganizationBrandOsController {
  constructor(
    private readonly brandsService: BrandsService,
    private readonly revisions: BrandOsRevisionsService,
  ) {}

  @Post('approve')
  @HttpCode(200)
  @RateLimit({ limit: 10, scope: 'user', windowMs: 60_000 })
  async approve(
    @Req() request: Request,
    @Param('organizationId') organizationId: string,
    @Param('brandId') brandId: string,
    @Body() body: unknown,
  ) {
    if (
      !identifier.safeParse(organizationId).success ||
      !identifier.safeParse(brandId).success
    ) {
      throw new BadRequestException('Invalid identifier');
    }
    const parsed = approveBrandOsSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Invalid Brand OS kit fields');
    }
    const operatorUserId = request.context?.userId;
    if (!operatorUserId) {
      throw new UnauthorizedException();
    }

    const fields = Object.fromEntries(
      Object.entries(parsed.data).map(([key, value]) => [
        key,
        { action: 'accept' as const, value },
      ]),
    ) as Partial<
      Record<BrandKitFieldKey, { action: 'accept'; value: unknown }>
    >;

    return runWithTenantContext({ organizationId }, async () => {
      const blocking = findBlockingBrandOsRevision(
        await this.revisions.list(organizationId, brandId),
      );
      if (blocking) {
        throw new ConflictException(
          `This brand already has a ${blocking.status.toLowerCase()} Brand OS revision. Edit it in the app.`,
        );
      }
      const applied = await this.brandsService.applyBrandKitDraft(
        brandId,
        organizationId,
        { fields },
        operatorUserId,
      );
      const draft = await this.revisions.ensureBaselineDraft(
        organizationId,
        brandId,
      );
      const approved = await this.revisions.approve(
        organizationId,
        brandId,
        draft.id,
        operatorUserId,
        draft.updatedAt,
        draft.content.generationRules === undefined
          ? undefined
          : hashBrandGenerationRulesReviewV1(draft.content.generationRules),
      );
      return {
        data: {
          appliedFields: applied.appliedFields,
          approvedAt: approved.approvedAt,
          brandId,
          organizationId,
          preservedFields: applied.preservedFields,
          revisionId: approved.id,
          status: approved.status,
          version: approved.version,
        },
      };
    });
  }
}
