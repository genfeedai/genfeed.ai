import { CredentialCryptoService } from '@api/collections/credentials/services/credential-crypto.service';
import { CreateIntegrationDto } from '@api/endpoints/integrations/dto/create-integration.dto';
import { UpdateIntegrationDto } from '@api/endpoints/integrations/dto/update-integration.dto';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { findOrThrow } from '@api/shared/utils/find-or-throw/find-or-throw.util';
import { IntegrationPlatform, IntegrationStatus } from '@genfeedai/enums';
import { REDIS_EVENTS } from '@genfeedai/integrations';
import {
  IntegrationPlatform as PrismaIntegrationPlatform,
  IntegrationStatus as PrismaIntegrationStatus,
} from '@genfeedai/prisma';
import { RedisService } from '@libs/redis/redis.service';
import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private readonly cryptoService: CredentialCryptoService,
    @Optional() private readonly redisService?: RedisService,
  ) {}

  async create(
    orgId: string,
    dto: CreateIntegrationDto,
  ): Promise<Record<string, unknown>> {
    const platform = this.toPrismaPlatform(dto.platform);

    // Check if integration for this platform already exists
    const existing = await this.prisma.orgIntegration.findFirst({
      where: {
        isDeleted: false,
        organizationId: orgId,
        platform,
      },
    });

    if (existing) {
      throw new BadRequestException(
        `${dto.platform} integration already exists for this organization`,
      );
    }

    // Encrypt the bot token
    const encryptedToken = this.cryptoService.encrypt(dto.botToken);

    const integration = await this.prisma.orgIntegration.create({
      data: {
        config: (dto.config || {}) as never,
        encryptedToken,
        organizationId: orgId,
        platform,
      },
    });

    // Emit Redis event for hot-reload
    await this.emitIntegrationEvent(REDIS_EVENTS.INTEGRATION_CREATED, {
      integrationId: integration.id,
      orgId,
      platform: dto.platform,
    });

    return this.toApiIntegration(integration);
  }

  async findAll(orgId: string): Promise<Record<string, unknown>[]> {
    const integrations = await this.prisma.orgIntegration.findMany({
      where: {
        isDeleted: false,
        organizationId: orgId,
      },
    });

    return integrations.map((integration) => ({
      ...this.toApiIntegration(integration),
      config: this.maskSecretConfig(
        integration.config as Record<string, unknown>,
      ),
      encryptedToken: '***MASKED***', // Never expose tokens
    }));
  }

  async findOne(
    orgId: string,
    integrationId: string,
  ): Promise<Record<string, unknown>> {
    const integration = await findOrThrow(
      this.prisma.orgIntegration,
      { where: { id: integrationId, isDeleted: false, organizationId: orgId } },
      'Integration',
    );

    return {
      ...this.toApiIntegration(integration),
      config: this.maskSecretConfig(
        integration.config as Record<string, unknown>,
      ),
      encryptedToken: '***MASKED***',
    };
  }

  async findByPlatform(
    platform: IntegrationPlatform,
  ): Promise<Record<string, unknown>[]> {
    const prismaPlatform = this.toPrismaPlatform(platform);
    const integrations = await this.prisma.orgIntegration.findMany({
      where: {
        isDeleted: false,
        platform: prismaPlatform,
        status: PrismaIntegrationStatus.ACTIVE,
      },
    });

    return integrations.map((integration) => ({
      ...this.toApiIntegration(integration),
      // Decrypt token for internal use
      botToken: this.cryptoService.decrypt(integration.encryptedToken),
    }));
  }

  async findOneByPlatform(
    platform: IntegrationPlatform,
    integrationId: string,
  ): Promise<Record<string, unknown>> {
    const prismaPlatform = this.toPrismaPlatform(platform);
    const integration = await findOrThrow(
      this.prisma.orgIntegration,
      {
        where: {
          id: integrationId,
          isDeleted: false,
          platform: prismaPlatform,
        },
      },
      'Integration',
      integrationId,
    );

    return {
      ...this.toApiIntegration(integration),
      botToken: this.cryptoService.decrypt(integration.encryptedToken),
    };
  }

  async update(
    orgId: string,
    integrationId: string,
    dto: UpdateIntegrationDto,
  ): Promise<Record<string, unknown>> {
    const existing = await findOrThrow(
      this.prisma.orgIntegration,
      { where: { id: integrationId, isDeleted: false, organizationId: orgId } },
      'Integration',
    );

    const updateData: Record<string, unknown> = {};

    // Encrypt new token if provided
    if (dto.botToken) {
      updateData['encryptedToken'] = this.cryptoService.encrypt(dto.botToken);
    }

    if (dto.config) {
      updateData['config'] = {
        ...(existing.config as Record<string, unknown>),
        ...dto.config,
      };
    }

    if (dto.status) {
      updateData['status'] = this.toPrismaStatus(dto.status);
    }

    const updated = await this.prisma.orgIntegration.update({
      data: updateData as never,
      where: { id: integrationId },
    });

    // Emit Redis event
    await this.emitIntegrationEvent(REDIS_EVENTS.INTEGRATION_UPDATED, {
      integrationId: updated.id,
      orgId,
      platform: this.toApiPlatform(updated.platform),
    });

    return {
      ...this.toApiIntegration(updated),
      config: this.maskSecretConfig(updated.config as Record<string, unknown>),
      encryptedToken: '***MASKED***',
    };
  }

  async remove(orgId: string, integrationId: string): Promise<void> {
    const existing = await findOrThrow(
      this.prisma.orgIntegration,
      { where: { id: integrationId, isDeleted: false, organizationId: orgId } },
      'Integration',
    );

    await this.prisma.orgIntegration.update({
      data: { isDeleted: true },
      where: { id: integrationId },
    });

    // Emit Redis event
    await this.emitIntegrationEvent(REDIS_EVENTS.INTEGRATION_DELETED, {
      integrationId: existing.id,
      orgId,
      platform: this.toApiPlatform(existing.platform),
    });
  }

  private toPrismaPlatform(
    platform: IntegrationPlatform,
  ): (typeof PrismaIntegrationPlatform)[keyof typeof PrismaIntegrationPlatform] {
    const key =
      platform.toUpperCase() as keyof typeof PrismaIntegrationPlatform;
    return PrismaIntegrationPlatform[key];
  }

  private toPrismaStatus(
    status: IntegrationStatus,
  ): (typeof PrismaIntegrationStatus)[keyof typeof PrismaIntegrationStatus] {
    const key = status.toUpperCase() as keyof typeof PrismaIntegrationStatus;
    return PrismaIntegrationStatus[key];
  }

  private toApiIntegration(
    integration: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      ...integration,
      platform: this.toApiPlatform(integration['platform']),
      status: this.toApiStatus(integration['status']),
    };
  }

  private toApiPlatform(platform: unknown): IntegrationPlatform {
    return String(platform).toLowerCase() as IntegrationPlatform;
  }

  private toApiStatus(status: unknown): IntegrationStatus {
    return String(status).toLowerCase() as IntegrationStatus;
  }

  /**
   * Redact sensitive config fields before returning integration data to clients.
   * Keeps non-secret fields intact for UI display purposes.
   */
  private maskSecretConfig(
    config: Record<string, unknown> | null | undefined,
  ): Record<string, unknown> {
    if (!config || typeof config !== 'object') {
      return {};
    }

    const secretKeys = new Set([
      'appToken',
      'apiKey',
      'apiSecret',
      'secret',
      'secretKey',
      'accessToken',
      'refreshToken',
      'clientSecret',
      'webhookSecret',
      'signingSecret',
      'privateKey',
      'password',
      'token',
    ]);

    const masked: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(config)) {
      if (secretKeys.has(key)) {
        masked[key] = '***MASKED***';
      } else {
        masked[key] = value;
      }
    }

    return masked;
  }

  private async emitIntegrationEvent(
    event: string,
    payload: {
      orgId: string;
      platform: IntegrationPlatform;
      integrationId: string;
    },
  ): Promise<void> {
    this.eventEmitter.emit(event, payload);

    if (!this.redisService) {
      return;
    }

    try {
      await this.redisService.publish(event, payload);
    } catch (error) {
      this.logger.warn(
        `Failed to publish integration event to Redis: ${event}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
