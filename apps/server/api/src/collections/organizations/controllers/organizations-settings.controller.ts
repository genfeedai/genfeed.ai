/**
 * Organizations Settings Controller
 * Handles organization configuration and preferences:
 * - Get organization settings
 * - Update settings (branding, features, limits, etc.)
 * - Manage feature flags
 * - Configure integrations
 * - BYOK (Bring Your Own Key) management
 */
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { UpdateOrganizationSettingDto } from '@api/collections/organization-settings/dto/update-organization-setting.dto';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { TestOrganizationWebhookDto } from '@api/collections/organizations/dto/test-organization-webhook.dto';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  returnNotFound,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { ByokService } from '@api/services/byok/byok.service';
import { PublishEventWebhookService } from '@api/services/webhook-client/webhook-client.module';
import { ByokProvider, MemberRole } from '@genfeedai/enums';
import type {
  IByokProviderStatus,
  IWebhookDeliveryStatus,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import {
  type ISubscriptionsService,
  SUBSCRIPTIONS_SERVICE,
} from '@genfeedai/interfaces/billing';
import {
  DarkroomCapabilitiesSerializer,
  OrganizationSettingSerializer,
  SubscriptionSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Put,
  Req,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiParam, ApiTags } from '@nestjs/swagger';

@AutoSwagger()
@ApiTags('organizations')
@ApiBearerAuth()
@Controller('organizations')
@UseGuards(RolesGuard)
export class OrganizationsSettingsController {
  constructor(
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly brandsService: BrandsService,
    private readonly ingredientsService: IngredientsService,
    @Inject(SUBSCRIPTIONS_SERVICE)
    private readonly subscriptionsService: ISubscriptionsService,
    private readonly byokService: ByokService,
    private readonly publishEventWebhookService: PublishEventWebhookService,
    readonly _loggerService: LoggerService,
  ) {}

  private async validateDefaultAvatarIngredient(
    organizationId: string,
    defaultAvatarIngredientId?: string | null,
  ): Promise<void> {
    if (defaultAvatarIngredientId == null) {
      return;
    }

    const avatarIngredient = await this.ingredientsService.findAvatarImageById(
      defaultAvatarIngredientId,
      organizationId,
    );

    if (!avatarIngredient) {
      throw new BadRequestException(
        'Default avatar must reference an avatar image ingredient in this organization',
      );
    }
  }

  private resolveOrganizationId(
    request: RequestWithContext,
    organizationId: string,
  ): string {
    return request.context?.organizationId || organizationId;
  }

  @Get(':organizationId/settings')
  // No @SetMetadata = available to all organization members (guard checks membership)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getSettings(
    @Req() req: RequestWithContext,
    @Param('organizationId') organizationId: string,
  ): Promise<JsonApiSingleResponse> {
    const resolvedOrganizationId = this.resolveOrganizationId(
      req,
      organizationId,
    );
    const data = await this.organizationSettingsService.findOne({
      organization: resolvedOrganizationId,
    });

    if (!data) {
      return returnNotFound('Organization Settings', resolvedOrganizationId);
    }

    return serializeSingle(req, OrganizationSettingSerializer, data);
  }

  @Patch(':organizationId/settings')
  @SetMetadata('roles', ['superadmin', MemberRole.OWNER, MemberRole.ADMIN])
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async updateSettings(
    @Req() req: RequestWithContext,
    @Param('organizationId') organizationId: string,
    @Body() settingsDto: UpdateOrganizationSettingDto,
  ): Promise<JsonApiSingleResponse> {
    const resolvedOrganizationId = this.resolveOrganizationId(
      req,
      organizationId,
    );
    const organizationSettings = await this.organizationSettingsService.findOne(
      {
        organization: resolvedOrganizationId,
      },
    );

    if (!organizationSettings) {
      return returnNotFound('Organization Settings', resolvedOrganizationId);
    }

    await this.validateDefaultAvatarIngredient(
      resolvedOrganizationId,
      settingsDto.defaultAvatarIngredientId?.toString(),
    );

    const data = await this.organizationSettingsService.patch(
      organizationSettings.id,
      settingsDto,
    );

    return serializeSingle(req, OrganizationSettingSerializer, data);
  }

  @Post(':organizationId/settings/webhooks/test')
  @SetMetadata('roles', ['superadmin', MemberRole.OWNER, MemberRole.ADMIN])
  @HttpCode(HttpStatus.OK)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async testWebhookDelivery(
    @Req() req: RequestWithContext,
    @Param('organizationId') organizationId: string,
    @Body() body: TestOrganizationWebhookDto,
  ): Promise<{ data: IWebhookDeliveryStatus }> {
    const resolvedOrganizationId = this.resolveOrganizationId(
      req,
      organizationId,
    );
    const data = await this.publishEventWebhookService.sendTestDelivery({
      event: body.event,
      organizationId: resolvedOrganizationId,
    });

    return { data };
  }

  @Get(':organizationId/brands/:brandId/darkroom-capabilities')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getDarkroomCapabilities(
    @Req() req: RequestWithContext,
    @Param('organizationId') organizationId: string,
    @Param('brandId') brandId: string,
  ): Promise<JsonApiSingleResponse> {
    const resolvedOrganizationId = this.resolveOrganizationId(
      req,
      organizationId,
    );
    const brandSettings = await this.brandsService.findOne(
      {
        _id: brandId,
        isDeleted: false,
        organization: resolvedOrganizationId,
      },
      'none',
    );

    if (!brandSettings) {
      return returnNotFound('Brand', brandId);
    }

    return serializeSingle(req, DarkroomCapabilitiesSerializer, {
      _id: `darkroom-capabilities:${resolvedOrganizationId}:${brandId}`,
      brandEnabled: Boolean(brandSettings.isDarkroomEnabled),
      brandId,
      // Public Core exposes the brand switch here without probing managed fleet runtime.
      fleet: {
        images: false,
        llm: false,
        videos: false,
        voices: false,
      },
      organizationId: resolvedOrganizationId,
    });
  }

  @Get(':organizationId/subscription')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOneSubscription(
    @Req() req: RequestWithContext,
    @Param('organizationId') organizationId: string,
  ): Promise<JsonApiSingleResponse> {
    const resolvedOrganizationId = this.resolveOrganizationId(
      req,
      organizationId,
    );
    const data = await this.subscriptionsService.findOne({
      organization: resolvedOrganizationId,
    });

    return serializeSingle(req, SubscriptionSerializer, data);
  }

  @Get(':organizationId/settings/byok')
  @SetMetadata('roles', ['superadmin', MemberRole.OWNER, MemberRole.ADMIN])
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getByokAllProviders(
    @Param('organizationId') organizationId: string,
  ): Promise<IByokProviderStatus[]> {
    return this.byokService.getStatus(organizationId);
  }

  @Get(':organizationId/settings/byok/:provider')
  @SetMetadata('roles', ['superadmin', MemberRole.OWNER, MemberRole.ADMIN])
  @ApiParam({ enum: ByokProvider, name: 'provider', type: String })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getByokProviderStatus(
    @Param('organizationId') organizationId: string,
    @Param('provider', new ParseEnumPipe(ByokProvider)) provider: ByokProvider,
  ): Promise<IByokProviderStatus> {
    const statuses = await this.byokService.getStatus(organizationId);
    const status = statuses.find((s) => s.provider === provider);

    if (!status) {
      throw new BadRequestException(`Unknown provider: ${provider}`);
    }

    return status;
  }

  @Post(':organizationId/settings/byok/:provider/validate')
  @SetMetadata('roles', ['superadmin', MemberRole.OWNER, MemberRole.ADMIN])
  @ApiParam({ enum: ByokProvider, name: 'provider', type: String })
  @HttpCode(HttpStatus.OK)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async validateByokProviderKey(
    @Param('organizationId') _organizationId: string,
    @Param('provider', new ParseEnumPipe(ByokProvider)) provider: ByokProvider,
    @Body() body: { apiKey: string; apiSecret?: string },
  ): Promise<{ isValid: boolean; error?: string }> {
    const trimmedApiKey = body.apiKey?.trim();
    if (!trimmedApiKey) {
      return { error: 'API key is required', isValid: false };
    }

    return this.byokService.validateKey(
      provider,
      trimmedApiKey,
      body.apiSecret?.trim(),
    );
  }

  @Put(':organizationId/settings/byok/:provider')
  @SetMetadata('roles', ['superadmin', MemberRole.OWNER, MemberRole.ADMIN])
  @ApiParam({ enum: ByokProvider, name: 'provider', type: String })
  @HttpCode(HttpStatus.OK)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async saveByokProviderKey(
    @Param('organizationId') organizationId: string,
    @Param('provider', new ParseEnumPipe(ByokProvider)) provider: ByokProvider,
    @Body() body: { apiKey: string; apiSecret?: string },
  ): Promise<{ isSuccess: boolean }> {
    const trimmedApiKey = body.apiKey?.trim();
    if (!trimmedApiKey) {
      throw new BadRequestException('API key is required');
    }

    await this.byokService.saveKey(
      organizationId,
      provider,
      trimmedApiKey,
      body.apiSecret?.trim(),
    );

    return { isSuccess: true };
  }

  @Delete(':organizationId/settings/byok/:provider')
  @SetMetadata('roles', ['superadmin', MemberRole.OWNER, MemberRole.ADMIN])
  @ApiParam({ enum: ByokProvider, name: 'provider', type: String })
  @HttpCode(HttpStatus.OK)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async removeByokProviderKey(
    @Param('organizationId') organizationId: string,
    @Param('provider', new ParseEnumPipe(ByokProvider)) provider: ByokProvider,
  ): Promise<{ isSuccess: boolean }> {
    await this.byokService.removeKey(organizationId, provider);
    return { isSuccess: true };
  }
}
