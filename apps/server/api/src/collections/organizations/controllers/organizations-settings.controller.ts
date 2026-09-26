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
import { ModelsService } from '@api/collections/models/services/models.service';
import { isModelOnAllowlist } from '@api/collections/models/utils/enabled-model.util';
import { UpdateOrganizationSettingDto } from '@api/collections/organization-settings/dto/update-organization-setting.dto';
import type { OrganizationSettingDocument } from '@api/collections/organization-settings/schemas/organization-setting.schema';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { TestOrganizationWebhookDto } from '@api/collections/organizations/dto/test-organization-webhook.dto';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import {
  returnNotFound,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { ByokService } from '@api/services/byok/byok.service';
import { WebhookDispatchService } from '@api/services/webhook-client/webhook-client.module';
import { ByokProvider, MemberRole, ModelCategory } from '@genfeedai/contracts';
import {
  AGENT_GENERATION_OVERRIDE_CATEGORIES,
  AGENT_REVIEW_OVERRIDE_CATEGORIES,
  AGENT_THINKING_OVERRIDE_CATEGORIES,
} from '@genfeedai/contracts/constants';
import type {
  IByokProviderStatus,
  IWebhookDeliveryStatus,
  JsonApiSingleResponse,
} from '@genfeedai/contracts/interfaces';
import {
  type ISubscriptionsService,
  SUBSCRIPTIONS_SERVICE,
} from '@genfeedai/contracts/interfaces/billing';
import {
  FleetCapabilitiesSerializer,
  OrganizationSettingSerializer,
  SubscriptionSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
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

/**
 * Plan-controlled settings. Stripe webhooks and billing services write them
 * directly; over HTTP only platform superadmins (Admin app, self-hosted local
 * identity) may change them, so an org owner cannot self-upgrade.
 */
const BILLING_CONTROLLED_SETTINGS = [
  'subscriptionTier',
  'seatsLimit',
  'brandsLimit',
] as const;

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
    private readonly modelsService: ModelsService,
    @Inject(SUBSCRIPTIONS_SERVICE)
    private readonly subscriptionsService: ISubscriptionsService,
    private readonly byokService: ByokService,
    private readonly webhookDispatchService: WebhookDispatchService,
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

  /**
   * Rejects a model override key the settings page's own picker could never
   * have shown — the frontend resolves each override against its selector's
   * enabled, category-scoped catalog before persisting (see
   * resolveEnabledModelsForCategory / resolveOverrideForSave), but the API
   * must not trust that a client did so. An override left unchanged from the
   * stored value is exempt: the frontend's own preserve rule can legitimately
   * resend a value that no longer resolves (a model removed from the
   * allowlist after it was saved) rather than silently drop it, and that is
   * not a new invalid input for this save to reject.
   */
  private async validateAgentPolicyModelOverrides(
    organizationSetting: OrganizationSettingDocument,
    settingsDto: UpdateOrganizationSettingDto,
  ): Promise<void> {
    const overrides = settingsDto.agentPolicy;
    if (!overrides) {
      return;
    }

    const enabledModelIds = Array.isArray(settingsDto.enabledModelIds)
      ? settingsDto.enabledModelIds
      : (organizationSetting.enabledModelIds ?? []);

    const checks: Array<{
      categories: readonly ModelCategory[];
      field:
        | 'generationModelOverride'
        | 'reviewModelOverride'
        | 'thinkingModelOverride';
    }> = [
      {
        categories: AGENT_GENERATION_OVERRIDE_CATEGORIES,
        field: 'generationModelOverride',
      },
      {
        categories: AGENT_REVIEW_OVERRIDE_CATEGORIES,
        field: 'reviewModelOverride',
      },
      {
        categories: AGENT_THINKING_OVERRIDE_CATEGORIES,
        field: 'thinkingModelOverride',
      },
    ];

    const pendingChecks = checks.filter(({ field }) => {
      const value = overrides[field]?.trim();
      if (!value) {
        return false;
      }
      const storedValue = organizationSetting.agentPolicy?.[field];
      // Preserve rule: an unrelated save can resend the exact stored value
      // even if it would no longer validate — that is not a new input.
      return value !== storedValue;
    });

    if (pendingChecks.length === 0) {
      return;
    }

    const availableModels = await this.modelsService.findAvailableModels({
      organizationId: organizationSetting.organizationId,
    });

    for (const { categories, field } of pendingChecks) {
      const value = (overrides[field] as string).trim();
      const categorySet = new Set<string>(categories);
      const enabledInCategory = availableModels.filter(
        (model) =>
          categorySet.has(model.category) &&
          isModelOnAllowlist(model, enabledModelIds),
      );
      const isValid = enabledInCategory.some(
        (model) => model.id === value || model.key === value,
      );

      if (!isValid) {
        throw new BadRequestException(
          `${field} "${value}" is not an enabled model for its category`,
        );
      }
    }
  }

  /**
   * Superadmins act on the organization named in the URL. Everyone else may
   * only address their active organization; a mismatch is rejected rather
   * than silently rewritten. Without an active organization, RolesGuard has
   * already verified membership in the URL organization.
   */
  private resolveOrganizationId(
    request: RequestWithContext,
    organizationId: string,
  ): string {
    if (getIsSuperAdmin(request.user, request)) {
      return organizationId;
    }

    const activeOrganizationId =
      request.context?.organizationId || request.user?.organizationId;

    if (activeOrganizationId && activeOrganizationId !== organizationId) {
      throw new ForbiddenException(
        'Organization does not match the active organization',
      );
    }

    return organizationId;
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
    const ensuredData =
      await this.organizationSettingsService.ensureForOrganization(
        resolvedOrganizationId,
      );

    return serializeSingle(req, OrganizationSettingSerializer, ensuredData);
  }

  @Patch(':organizationId/settings')
  @SetMetadata('roles', ['superadmin', MemberRole.OWNER, MemberRole.ADMIN])
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async updateSettings(
    @Req() req: RequestWithContext,
    @Param('organizationId') organizationId: string,
    @Body() settingsDto: UpdateOrganizationSettingDto,
  ): Promise<JsonApiSingleResponse> {
    if (
      Object.hasOwn(settingsDto, 'onboardingJourneyMissions') ||
      Object.hasOwn(settingsDto, 'onboardingJourneyCompletedAt')
    ) {
      throw new BadRequestException(
        'Onboarding journey state is managed by the server',
      );
    }
    if (
      !getIsSuperAdmin(req.user, req) &&
      BILLING_CONTROLLED_SETTINGS.some((field) =>
        Object.hasOwn(settingsDto, field),
      )
    ) {
      throw new BadRequestException(
        'Plan limits and subscription tier are managed by billing',
      );
    }
    const resolvedOrganizationId = this.resolveOrganizationId(
      req,
      organizationId,
    );

    if (
      Array.isArray(settingsDto.enabledModelIds) &&
      settingsDto.enabledModelIds.length === 0
    ) {
      throw new BadRequestException(
        'At least one model must remain enabled for the organization',
      );
    }

    await this.validateDefaultAvatarIngredient(
      resolvedOrganizationId,
      settingsDto.defaultAvatarIngredientId?.toString(),
    );

    const organizationSettings =
      await this.organizationSettingsService.ensureForOrganization(
        resolvedOrganizationId,
      );

    await this.validateAgentPolicyModelOverrides(
      organizationSettings,
      settingsDto,
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
    const data = await this.webhookDispatchService.sendTestDelivery({
      event: body.event,
      organizationId: resolvedOrganizationId,
    });

    return { data };
  }

  @Get(':organizationId/brands/:brandId/fleet-capabilities')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getFleetCapabilities(
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
        id: brandId,
        organizationId: resolvedOrganizationId,
      },
      'none',
    );

    if (!brandSettings) {
      return returnNotFound('Brand', brandId);
    }

    return serializeSingle(req, FleetCapabilitiesSerializer, {
      brandEnabled: Boolean(brandSettings.isFleetEnabled),
      brandId,
      // Public Core exposes the brand switch here without probing managed fleet runtime.
      fleet: {
        images: false,
        llm: false,
        videos: false,
        voices: false,
      },
      id: `fleet-capabilities:${resolvedOrganizationId}:${brandId}`,
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
      organizationId: resolvedOrganizationId,
    });

    return serializeSingle(req, SubscriptionSerializer, data);
  }

  @Get(':organizationId/settings/byok')
  @SetMetadata('roles', ['superadmin', MemberRole.OWNER, MemberRole.ADMIN])
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getByokAllProviders(
    @Req() req: RequestWithContext,
    @Param('organizationId') organizationId: string,
  ): Promise<IByokProviderStatus[]> {
    return this.byokService.getStatus(
      this.resolveOrganizationId(req, organizationId),
    );
  }

  @Get(':organizationId/settings/byok/:provider')
  @SetMetadata('roles', ['superadmin', MemberRole.OWNER, MemberRole.ADMIN])
  @ApiParam({ enum: ByokProvider, name: 'provider', type: String })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getByokProviderStatus(
    @Req() req: RequestWithContext,
    @Param('organizationId') organizationId: string,
    @Param('provider', new ParseEnumPipe(ByokProvider)) provider: ByokProvider,
  ): Promise<IByokProviderStatus> {
    const statuses = await this.byokService.getStatus(
      this.resolveOrganizationId(req, organizationId),
    );
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
    @Req() req: RequestWithContext,
    @Param('organizationId') organizationId: string,
    @Param('provider', new ParseEnumPipe(ByokProvider)) provider: ByokProvider,
    @Body() body: { apiKey: string; apiSecret?: string },
  ): Promise<{ isSuccess: boolean }> {
    const trimmedApiKey = body.apiKey?.trim();
    if (!trimmedApiKey) {
      throw new BadRequestException('API key is required');
    }

    await this.byokService.saveKey(
      this.resolveOrganizationId(req, organizationId),
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
    @Req() req: RequestWithContext,
    @Param('organizationId') organizationId: string,
    @Param('provider', new ParseEnumPipe(ByokProvider)) provider: ByokProvider,
  ): Promise<{ isSuccess: boolean }> {
    await this.byokService.removeKey(
      this.resolveOrganizationId(req, organizationId),
      provider,
    );
    return { isSuccess: true };
  }
}
