import { BrandsService } from '@api/collections/brands/services/brands.service';
import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { PublishingProviderSetupService } from '@api/collections/publishing-setup/services/publishing-provider-setup.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import {
  CredentialPlatform,
  fromPrismaCredentialPlatform,
} from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createOrganizationAppRoute,
  OAUTH_STATE_TTL_MS,
} from '@genfeedai/contracts/constants';
import type {
  AgentToolResult,
  ExternalBrandOption,
  ExternalConnectionRequest,
} from '@genfeedai/contracts/interfaces';
import { serializeExternalConnectionRequest } from '@genfeedai/helpers/integrations/external-connection-request.helper';
import { ConfigService } from '@libs/config/config.service';
import { Injectable, Optional } from '@nestjs/common';

const SUPPORTED_CONNECTION_PLATFORMS = new Set<string>([
  CredentialPlatform.FACEBOOK,
  CredentialPlatform.FANVUE,
  CredentialPlatform.INSTAGRAM,
  CredentialPlatform.LINKEDIN,
  CredentialPlatform.TIKTOK,
  CredentialPlatform.TWITTER,
  CredentialPlatform.YOUTUBE,
]);

@Injectable()
export class AgentConnectionRequestService {
  constructor(
    private readonly credentialsService: CredentialsService,
    private readonly brandsService: BrandsService,
    private readonly organizationsService: OrganizationsService,
    private readonly configService: ConfigService,
    @Optional()
    private readonly providerSetup?: PublishingProviderSetupService,
  ) {}

  async start(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const platform = this.readPlatform(params.platform);
    if (!platform) {
      return {
        creditsUsed: 0,
        error:
          'platform is required and must be one of twitter, instagram, youtube, tiktok, linkedin, facebook, fanvue.',
        success: false,
      };
    }

    const configurationError = this.providerConfigurationError(platform);
    if (configurationError) {
      return {
        creditsUsed: 0,
        data: {
          recoveryAction: 'configure_provider',
          state: 'failed',
        },
        error: configurationError,
        success: false,
      };
    }

    const replayId = this.readId(params.connectionId);
    if (replayId) {
      return this.status({ connectionId: replayId }, ctx);
    }

    const brand = await this.resolveBrand(params, ctx);
    if ('error' in brand) {
      return brand.error;
    }

    const credential = await this.credentialsService.createPendingForBrand(
      {
        id: brand.id,
        organizationId: ctx.organizationId,
      },
      ctx.userId,
      platform,
    );

    const request = await this.toRequest(credential, ctx.organizationId);
    return {
      creditsUsed: 0,
      data: request as unknown as Record<string, unknown>,
      success: true,
    };
  }

  async status(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const connectionId = this.readId(params.connectionId);
    if (connectionId) {
      const credential = await this.credentialsService.findOne({
        id: connectionId,
        organizationId: ctx.organizationId,
        userId: ctx.userId,
      });
      if (!credential) {
        return {
          creditsUsed: 0,
          error: 'Connection request not found.',
          success: false,
        };
      }
      const request = await this.toRequest(credential, ctx.organizationId);
      return {
        creditsUsed: 0,
        data: request as unknown as Record<string, unknown>,
        success: true,
      };
    }

    const platform = this.readPlatform(params.platform);
    if (!platform) {
      return {
        creditsUsed: 0,
        error: 'connectionId or platform is required.',
        success: false,
      };
    }

    const credential = await this.credentialsService.findOne({
      isConnected: true,
      organizationId: ctx.organizationId,
      platform,
      ...(ctx.brandId ? { brandId: ctx.brandId } : {}),
    });

    if (!credential) {
      return {
        creditsUsed: 0,
        data: {
          connected: false,
          credentialId: null,
          platform,
          state: 'pending',
        },
        success: true,
      };
    }

    const request = await this.toRequest(credential, ctx.organizationId);
    return {
      creditsUsed: 0,
      data: {
        ...request,
        connected: true,
        credentialId: request.connectionId,
      },
      success: true,
    };
  }

  private async resolveBrand(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<{ id: string } | { error: AgentToolResult }> {
    const explicitId = this.readId(params.brandId) ?? this.readId(ctx.brandId);
    if (explicitId) {
      const brand = await this.brandsService.findOne({
        id: explicitId,
        isDeleted: false,
        organizationId: ctx.organizationId,
      });
      if (!brand?.id) {
        return {
          error: {
            creditsUsed: 0,
            error: 'Brand was not found in this organization.',
            success: false,
          },
        };
      }
      return { id: String(brand.id) };
    }

    const brands = await this.listOrganizationBrands(ctx.organizationId);
    if (brands.length === 0) {
      return {
        error: {
          creditsUsed: 0,
          error: 'Create a brand before connecting an account.',
          success: false,
        },
      };
    }
    if (brands.length === 1 && brands[0]) {
      return { id: brands[0].id };
    }

    return {
      error: {
        creditsUsed: 0,
        data: {
          brands,
          recoveryAction: 'select_brand',
        },
        error:
          'Select a brand before connecting an account. Pass brandId from list_brands.',
        success: false,
      },
    };
  }

  private async listOrganizationBrands(
    organizationId: string,
  ): Promise<ExternalBrandOption[]> {
    const page = await this.brandsService.findAll(
      { where: { isDeleted: false, organizationId } },
      { limit: 50, page: 1 },
      false,
    );
    return page.docs.flatMap((brand) => {
      const id = typeof brand.id === 'string' ? brand.id : undefined;
      if (!id) {
        return [];
      }
      const label =
        typeof brand.label === 'string' && brand.label.trim().length > 0
          ? brand.label
          : id;
      return [{ id, label }];
    });
  }

  private async toRequest(
    credential: CredentialDocument,
    organizationId: string,
  ): Promise<ExternalConnectionRequest> {
    const platform =
      fromPrismaCredentialPlatform(String(credential.platform)) ??
      String(credential.platform).toLowerCase();
    const authorizationUrl = await this.buildAuthorizationUrl({
      brandId: String(credential.brandId ?? ''),
      connectionId: String(credential.id),
      organizationId,
      platform,
    });
    return serializeExternalConnectionRequest({
      accountId: credential.externalId ?? null,
      authorizationUrl,
      brandId: String(credential.brandId ?? ''),
      connectionId: String(credential.id),
      createdAt: credential.createdAt,
      externalHandle: credential.externalHandle ?? null,
      isConnected: Boolean(credential.isConnected),
      oauthState: credential.oauthState,
      platform,
    });
  }

  private async buildAuthorizationUrl(input: {
    brandId: string;
    connectionId: string;
    organizationId: string;
    platform: string;
  }): Promise<string> {
    const organization = await this.organizationsService.findOne({
      id: input.organizationId,
      isDeleted: false,
    });
    const slug =
      typeof organization?.slug === 'string' && organization.slug.length > 0
        ? organization.slug
        : input.organizationId;
    const appUrl = String(
      this.configService.get('GENFEEDAI_APP_URL') ?? 'https://app.genfeed.ai',
    ).replace(/\/+$/, '');
    const path = createOrganizationAppRoute(
      slug,
      `${APP_ROUTES.CONNECT}/social`,
    );
    const query = new URLSearchParams({
      brandId: input.brandId,
      connectionId: input.connectionId,
      platform: input.platform,
    });
    return `${appUrl}${path}?${query.toString()}`;
  }

  private providerConfigurationError(
    platform: CredentialPlatform,
  ): string | undefined {
    if (!this.providerSetup) {
      return undefined;
    }
    const signals = this.providerSetup.resolveProviderSignals(
      platform,
      new Date().toISOString(),
    );
    const providerError = signals.diagnostics.find(
      (diagnostic) =>
        diagnostic.scope === 'provider' && diagnostic.severity === 'error',
    );
    if (!providerError) {
      return undefined;
    }
    return `${platform} is not configured. ${providerError.correctiveAction}`;
  }

  private readPlatform(value: unknown): CredentialPlatform | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }
    const platform = value.trim().toLowerCase();
    if (!SUPPORTED_CONNECTION_PLATFORMS.has(platform)) {
      return undefined;
    }
    return platform as CredentialPlatform;
  }

  private readId(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : undefined;
  }
}

export const CONNECTION_REQUEST_TTL_MS = OAUTH_STATE_TTL_MS;
