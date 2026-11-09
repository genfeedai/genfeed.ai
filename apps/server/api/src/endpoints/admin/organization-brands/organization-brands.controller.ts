import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { SignupPrefillService } from '@api/services/signup-prefill/signup-prefill.service';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { FontFamily } from '@genfeedai/contracts';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';

const identifier = z.string().trim().min(1).max(200);
const color = z.string().trim().min(4).max(30);

const createBrandSchema = z
  .object({
    backgroundColor: color.optional(),
    description: z.string().trim().max(2000).optional(),
    fontFamily: z.nativeEnum(FontFamily).optional(),
    label: z.string().trim().min(1).max(120),
    primaryColor: color.optional(),
    secondaryColor: color.optional(),
  })
  .strict();

const updateBrandSchema = z
  .object({
    backgroundColor: color.optional(),
    description: z.string().trim().max(2000).optional(),
    fontFamily: z.nativeEnum(FontFamily).optional(),
    label: z.string().trim().min(1).max(120).optional(),
    primaryColor: color.optional(),
    secondaryColor: color.optional(),
    watermarkOpacity: z.number().min(0.05).max(1).optional(),
    watermarkPosition: z
      .enum(['top-left', 'top-right', 'bottom-left', 'bottom-right'])
      .optional(),
    watermarkText: z.string().trim().max(120).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Nothing to update',
  });

const scanBrandSchema = z
  .object({ url: z.string().trim().min(3).max(2048) })
  .strict();

/**
 * Member-scoped brand routes resolve the organization from the caller's own
 * memberships, so a platform admin cannot reach a customer organization
 * through them. These routes take the organization explicitly.
 */
@Controller('admin/organizations/:organizationId/brands')
@UseGuards(IpWhitelistGuard, SuperAdminGuard)
export class AdminOrganizationBrandsController {
  constructor(
    private readonly brandsService: BrandsService,
    private readonly signupPrefillService: SignupPrefillService,
  ) {}

  @Post()
  @RateLimit({ limit: 10, scope: 'user', windowMs: 60_000 })
  async create(
    @Req() request: Request,
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
  ) {
    if (!identifier.safeParse(organizationId).success) {
      throw new BadRequestException('Invalid identifier');
    }
    const parsed = createBrandSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('A brand label is required');
    }
    const operatorUserId = request.context?.userId;
    if (!operatorUserId) {
      throw new UnauthorizedException();
    }

    const {
      backgroundColor,
      description,
      fontFamily,
      label,
      primaryColor,
      secondaryColor,
    } = parsed.data;

    return runWithTenantContext({ organizationId }, async () => {
      const brand = await this.brandsService.create({
        backgroundColor: backgroundColor ?? '#000000',
        description,
        fontFamily: fontFamily ?? FontFamily.INTER_BOLD,
        label,
        organizationId,
        primaryColor: primaryColor ?? '#000000',
        secondaryColor: secondaryColor ?? '#FFFFFF',
        userId: operatorUserId,
      });
      return {
        data: {
          id: brand.id,
          label: brand.label,
          organizationId,
          slug: brand.slug,
        },
      };
    });
  }

  @Get(':brandId')
  async read(
    @Param('organizationId') organizationId: string,
    @Param('brandId') brandId: string,
  ) {
    if (
      !identifier.safeParse(organizationId).success ||
      !identifier.safeParse(brandId).success
    ) {
      throw new BadRequestException('Invalid identifier');
    }
    const brand = await this.findBrand(organizationId, brandId);
    return { data: this.toSummary(brand, organizationId) };
  }

  @Patch(':brandId')
  @RateLimit({ limit: 20, scope: 'user', windowMs: 60_000 })
  async update(
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
    const parsed = updateBrandSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Invalid brand update');
    }
    await this.findBrand(organizationId, brandId);
    const updated = await runWithTenantContext({ organizationId }, () =>
      this.brandsService.patch(brandId, parsed.data),
    );
    return { data: this.toSummary(updated, organizationId) };
  }

  private async findBrand(organizationId: string, brandId: string) {
    const brand = await runWithTenantContext({ organizationId }, () =>
      this.brandsService.findOne({
        id: brandId,
        isDeleted: false,
        organizationId,
      }),
    );
    if (!brand) {
      throw new NotFoundException('Brand', brandId);
    }
    return brand;
  }

  /** The kit fields an operator checks; never the raw record. */
  private toSummary(brand: BrandDocument, organizationId: string) {
    return {
      backgroundColor: brand.backgroundColor,
      description: brand.description,
      endCardAssetId: brand.endCardAssetId ?? null,
      fontFamily: brand.fontFamily,
      id: brand.id,
      isEndCardEnabled: brand.isEndCardEnabled,
      label: brand.label,
      organizationId,
      primaryColor: brand.primaryColor,
      secondaryColor: brand.secondaryColor,
      slug: brand.slug,
      watermarkLogoId: brand.watermarkLogoId ?? null,
      watermarkOpacity: brand.watermarkOpacity,
      watermarkPosition: brand.watermarkPosition,
      watermarkText: brand.watermarkText ?? null,
    };
  }

  @Post(':brandId/scan')
  @RateLimit({ limit: 10, scope: 'user', windowMs: 60_000 })
  async scan(
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
    const parsed = scanBrandSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('A url to scan is required');
    }
    const operatorUserId = request.context?.userId;
    if (!operatorUserId) {
      throw new UnauthorizedException();
    }

    const brand = await runWithTenantContext({ organizationId }, () =>
      this.brandsService.findOne({
        id: brandId,
        isDeleted: false,
        organizationId,
      }),
    );
    if (!brand) {
      throw new NotFoundException('Brand', brandId);
    }

    const state = await this.signupPrefillService.scanBrandUrl(
      { brandId, organizationId, userId: operatorUserId },
      parsed.data.url,
    );
    return {
      data: {
        brandId,
        organizationId,
        scrapeReason: state.scrapeReason ?? null,
        scrapeStatus: state.scrapeStatus ?? 'failed',
        summary: state.summary ?? null,
      },
    };
  }
}
