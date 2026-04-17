import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { CreditProvisionDto } from '@api/endpoints/integrations/shopify/dto/credit-provision.dto';
import { ShopifyInstallDto } from '@api/endpoints/integrations/shopify/dto/shopify-install.dto';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { AdminApiKeyGuard } from '@api/helpers/guards/admin-api-key/admin-api-key.guard';
import { CombinedAuthGuard } from '@api/helpers/guards/combined-auth/combined-auth.guard';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { ApiKeyScope } from '@genfeedai/enums';
import { Public } from '@libs/decorators/public.decorator';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

/**
 * Shopify Integration Controller
 *
 * Provides endpoints for Shopify app integration:
 * - Auto-provision API key and organization on install
 * - Credit provisioning from Shopify billing
 */
@AutoSwagger()
@ApiTags('Integrations - Shopify')
@Controller('integrations/shopify')
export class ShopifyController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly apiKeysService: ApiKeysService,
    private readonly brandsService: BrandsService,
    readonly _creditsUtilsService: CreditsUtilsService,
    private readonly organizationsService: OrganizationsService,
    private readonly usersService: UsersService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Provision a new Genfeed account for a Shopify shop installation
   * This endpoint requires admin API key authentication
   */
  @Post('install')
  @ApiOperation({
    description:
      'Creates a new organization, user, brand, and API key for a Shopify shop on first install',
    summary: 'Provision Genfeed account for Shopify shop',
  })
  @Public() // Bypass Clerk guard
  @UseGuards(AdminApiKeyGuard)
  @HttpCode(HttpStatus.CREATED)
  async provisionShopifyAccount(@Body() dto: ShopifyInstallDto): Promise<{
    apiKey: string;
    orgId: string;
    userId: string;
    brandId: string;
  }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    this.logger.log(url, { shopDomain: dto.shopDomain });

    // Create organization for the shop
    // @ts-expect-error TS2345
    const organization = await this.organizationsService.create({
      metadata: {
        shopDomain: dto.shopDomain,
        shopifyUserId: dto.shopifyUserId,
        source: 'shopify',
      },
      name: dto.shopDomain.replace('.myshopify.com', ''),
    } as unknown as Record<string, unknown>);

    // Create a system user for the shop
    // @ts-expect-error TS2345
    const user = await this.usersService.create({
      email: `shop@${dto.shopDomain}`,
      metadata: {
        shopDomain: dto.shopDomain,
        source: 'shopify',
      },
      name: dto.shopDomain.replace('.myshopify.com', ''),
      organization: organization._id,
    } as unknown as Record<string, unknown>);

    // Create default brand for the shop
    // @ts-expect-error TS2345
    const brand = await this.brandsService.create({
      metadata: {
        shopDomain: dto.shopDomain,
        source: 'shopify',
      },
      name: dto.shopDomain.replace('.myshopify.com', ''),
      organization: organization._id,
      user: user._id,
    } as unknown as Record<string, unknown>);

    // Create API key with Shopify-specific scopes
    // @ts-expect-error TS2345
    const { plainKey, apiKey } = await this.apiKeysService.createWithKey({
      brand: brand._id as string,
      description: 'Auto-provisioned API key for Shopify integration',
      metadata: {
        shopDomain: dto.shopDomain,
        source: 'shopify',
      },
      name: `Shopify - ${dto.shopDomain}`,
      organization: organization._id as string,
      rateLimit: 100, // Higher rate limit for Shopify apps
      scopes: [
        ApiKeyScope.IMAGES_READ,
        ApiKeyScope.IMAGES_CREATE,
        ApiKeyScope.VIDEOS_READ,
        ApiKeyScope.VIDEOS_CREATE,
        ApiKeyScope.CREDITS_READ,
        ApiKeyScope.POSTS_CREATE,
      ],
      user: user._id as string,
    } as unknown as Record<string, unknown>);

    this.logger.log(`${url} - Account provisioned successfully`, {
      apiKeyId: apiKey._id,
      brandId: brand._id,
      organizationId: organization._id,
      shopDomain: dto.shopDomain,
      userId: user._id,
    });

    return {
      apiKey: plainKey,
      brandId: String(brand._id),
      orgId: String(organization._id),
      userId: String(user._id),
    };
  }
}

/**
 * Credit Provisioning Controller
 * Handles credit provisioning from external billing systems
 */
@AutoSwagger()
@ApiTags('Integrations - Credits')
@Public() // Bypass global ClerkGuard
@UseGuards(CombinedAuthGuard) // Use combined auth (JWT or API key)
@Controller('integrations/credits')
export class CreditProvisionController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Provision credits to an organization
   * Requires admin API key or credits:provision scope
   */
  @Post('provision')
  @ApiOperation({
    description: 'Add credits to an organization from external billing systems',
    summary: 'Provision credits to organization',
  })
  @RequiredScopes(ApiKeyScope.CREDITS_PROVISION, ApiKeyScope.ADMIN)
  @HttpCode(HttpStatus.OK)
  async provisionCredits(
    @Req() request: Request,
    @Body() dto: CreditProvisionDto,
  ): Promise<{
    creditsAdded: number;
    newBalance: number;
  }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    // @ts-expect-error TS2345
    const { organization } = getPublicMetadata(request);

    this.logger.log(url, {
      amount: dto.amount,
      organization,
      planId: dto.planId,
      source: dto.source,
    });

    // Calculate expiration (end of billing period, default 30 days)
    const expiresAt = dto.expiresAt
      ? new Date(dto.expiresAt)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Add credits with expiration
    await this.creditsUtilsService.addOrganizationCreditsWithExpiration(
      organization,
      dto.amount,
      dto.source,
      `${dto.planId} plan subscription - ${dto.amount} credits`,
      expiresAt,
    );

    // Get new balance
    const newBalance =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        organization,
      );

    this.logger.log(`${url} - Credits provisioned successfully`, {
      creditsAdded: dto.amount,
      newBalance,
      organization,
    });

    return {
      creditsAdded: dto.amount,
      newBalance,
    };
  }
}
