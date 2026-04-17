import { CreateIntegrationDto } from '@api/endpoints/integrations/dto/create-integration.dto';
import { UpdateIntegrationDto } from '@api/endpoints/integrations/dto/update-integration.dto';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { IntegrationPlatform } from '@genfeedai/enums';
import { REDIS_EVENTS } from '@genfeedai/integrations';
import { CryptoService } from '@libs/crypto/crypto.service';
import { RedisService } from '@libs/redis/redis.service';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    @Inject('CryptoService')
    private cryptoService: CryptoService,
    @Optional() private readonly redisService?: RedisService,
  ) {}

  async create(
    orgId: string,
    dto: CreateIntegrationDto,
  ): Promise<Record<string, unknown>> {
    // Check if integration for this platform already exists
    const existing = await this.prisma.orgIntegration.findFirst({
      where: {
        isDeleted: false,
        organizationId: orgId,
        platform: dto.platform as never,
      },
    });

    if (existing) {
      throw new BadRequestException(
        `${dto.platform} integration already exists for this organization`,
      );
    }

    // Encrypt the bot token
    const encryptedToken = await this.cryptoService.encrypt(dto.botToken);

    const integration = await this.prisma.orgIntegration.create({
      data: {
        config: (dto.config || {}) as never,
        encryptedToken,
        organizationId: orgId,
        platform: dto.platform as never,
      },
    });

    // Emit Redis event for hot-reload
    await this.emitIntegrationEvent(REDIS_EVENTS.INTEGRATION_CREATED, {
      integrationId: integration.id,
      orgId,
      platform: dto.platform,
    });

    return integration;
  }

  async findAll(orgId: string): Promise<Record<string, unknown>[]> {
    const integrations = await this.prisma.orgIntegration.findMany({
      where: {
        isDeleted: false,
        organizationId: orgId,
      },
    });

    return integrations.map((integration) => ({
      ...integration,
      encryptedToken: '***MASKED***', // Never expose tokens
    }));
  }

  async findOne(
    orgId: string,
    integrationId: string,
  ): Promise<Record<string, unknown>> {
    const integration = await this.prisma.orgIntegration.findFirst({
      where: {
        id: integrationId,
        isDeleted: false,
        organizationId: orgId,
      },
    });

    if (!integration) {
      throw new NotFoundException('Integration not found');
    }

    return {
      ...integration,
      encryptedToken: '***MASKED***',
    };
  }

  async findByPlatform(
    platform: IntegrationPlatform,
  ): Promise<Record<string, unknown>[]> {
    const integrations = await this.prisma.orgIntegration.findMany({
      where: {
        isDeleted: false,
        platform: platform as never,
        status: 'ACTIVE',
      },
    });

    return integrations.map((integration) => ({
      ...integration,
      // Decrypt token for internal use
      botToken: this.cryptoService.decrypt(integration.encryptedToken),
    }));
  }

  async findOneByPlatform(
    platform: IntegrationPlatform,
    integrationId: string,
  ): Promise<Record<string, unknown>> {
    const integration = await this.prisma.orgIntegration.findFirst({
      where: {
        id: integrationId,
        isDeleted: false,
        platform: platform as never,
      },
    });

    if (!integration) {
      throw new NotFoundException(
        `Integration ${integrationId} not found for platform ${platform}`,
      );
    }

    return {
      ...integration,
      botToken: this.cryptoService.decrypt(integration.encryptedToken),
    };
  }

  async update(
    orgId: string,
    integrationId: string,
    dto: UpdateIntegrationDto,
  ): Promise<Record<string, unknown>> {
    const existing = await this.prisma.orgIntegration.findFirst({
      where: {
        id: integrationId,
        isDeleted: false,
        organizationId: orgId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Integration not found');
    }

    const updateData: Record<string, unknown> = {};

    // Encrypt new token if provided
    if (dto.botToken) {
      updateData['encryptedToken'] = await this.cryptoService.encrypt(
        dto.botToken,
      );
    }

    if (dto.config) {
      updateData['config'] = {
        ...(existing.config as Record<string, unknown>),
        ...dto.config,
      };
    }

    if (dto.status) {
      updateData['status'] = dto.status;
    }

    const updated = await this.prisma.orgIntegration.update({
      data: updateData as never,
      where: { id: integrationId },
    });

    // Emit Redis event
    await this.emitIntegrationEvent(REDIS_EVENTS.INTEGRATION_UPDATED, {
      integrationId: updated.id,
      orgId,
      platform: updated.platform as unknown as IntegrationPlatform,
    });

    return {
      ...updated,
      encryptedToken: '***MASKED***',
    };
  }

  async remove(orgId: string, integrationId: string): Promise<void> {
    const existing = await this.prisma.orgIntegration.findFirst({
      where: {
        id: integrationId,
        isDeleted: false,
        organizationId: orgId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Integration not found');
    }

    await this.prisma.orgIntegration.update({
      data: { isDeleted: true },
      where: { id: integrationId },
    });

    // Emit Redis event
    await this.emitIntegrationEvent(REDIS_EVENTS.INTEGRATION_DELETED, {
      integrationId: existing.id,
      orgId,
      platform: existing.platform as unknown as IntegrationPlatform,
    });
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
