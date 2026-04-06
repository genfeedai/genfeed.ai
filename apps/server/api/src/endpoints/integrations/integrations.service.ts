import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { CreateIntegrationDto } from '@api/endpoints/integrations/dto/create-integration.dto';
import { UpdateIntegrationDto } from '@api/endpoints/integrations/dto/update-integration.dto';
import {
  OrgIntegration,
  type OrgIntegrationDocument,
} from '@api/endpoints/integrations/schemas/org-integration.schema';
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
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(
    @InjectModel(OrgIntegration.name, DB_CONNECTIONS.CLOUD)
    private integrationModel: Model<OrgIntegrationDocument>,
    private eventEmitter: EventEmitter2,
    @Inject('CryptoService')
    private cryptoService: CryptoService,
    @Optional() private readonly redisService?: RedisService,
  ) {}

  async create(
    orgId: string,
    dto: CreateIntegrationDto,
  ): Promise<OrgIntegration> {
    // Check if integration for this platform already exists
    const existing = await this.integrationModel.findOne({
      isDeleted: false,
      organization: new Types.ObjectId(orgId),
      platform: dto.platform,
    });

    if (existing) {
      throw new BadRequestException(
        `${dto.platform} integration already exists for this organization`,
      );
    }

    // Encrypt the bot token
    const encryptedToken = await this.cryptoService.encrypt(dto.botToken);

    const integration = new this.integrationModel({
      config: dto.config || {},
      encryptedToken,
      organization: new Types.ObjectId(orgId),
      platform: dto.platform,
    });

    const saved = await integration.save();

    // Emit Redis event for hot-reload
    await this.emitIntegrationEvent(REDIS_EVENTS.INTEGRATION_CREATED, {
      integrationId: saved._id.toString(),
      orgId,
      platform: dto.platform,
    });

    return saved.toObject();
  }

  async findAll(orgId: string): Promise<OrgIntegration[]> {
    const integrations = await this.integrationModel
      .find({
        isDeleted: false,
        organization: new Types.ObjectId(orgId),
      })
      .exec();

    return integrations.map((integration) => ({
      ...integration.toObject(),
      encryptedToken: '***MASKED***', // Never expose tokens
    }));
  }

  async findOne(orgId: string, integrationId: string): Promise<OrgIntegration> {
    const integration = await this.integrationModel
      .findOne({
        // @ts-expect-error TS2769
        _id: new Types.ObjectId(integrationId),
        isDeleted: false,
        organization: new Types.ObjectId(orgId),
      })
      .exec();

    if (!integration) {
      throw new NotFoundException('Integration not found');
    }

    return {
      ...integration.toObject(),
      encryptedToken: '***MASKED***',
    };
  }

  async findByPlatform(
    platform: IntegrationPlatform,
  ): Promise<OrgIntegration[]> {
    const integrations = await this.integrationModel
      .find({
        isDeleted: false,
        platform,
        status: 'active',
      })
      .exec();

    return integrations.map((integration) => {
      const obj = integration.toObject();
      // Decrypt token for internal use
      // @ts-expect-error TS2339
      obj.botToken = this.cryptoService.decrypt(obj.encryptedToken);
      return obj;
    });
  }

  async findOneByPlatform(
    platform: IntegrationPlatform,
    integrationId: string,
  ): Promise<OrgIntegration> {
    const integration = await this.integrationModel
      .findOne({
        // @ts-expect-error TS2769
        _id: new Types.ObjectId(integrationId),
        isDeleted: false,
        platform,
      })
      .exec();

    if (!integration) {
      throw new NotFoundException(
        `Integration ${integrationId} not found for platform ${platform}`,
      );
    }

    const obj = integration.toObject();
    obj.botToken = this.cryptoService.decrypt(obj.encryptedToken);
    return obj;
  }

  async update(
    orgId: string,
    integrationId: string,
    dto: UpdateIntegrationDto,
  ): Promise<OrgIntegration> {
    const integration = await this.integrationModel.findOne({
      // @ts-expect-error TS2769
      _id: new Types.ObjectId(integrationId),
      isDeleted: false,
      organization: new Types.ObjectId(orgId),
    });

    if (!integration) {
      throw new NotFoundException('Integration not found');
    }

    // Encrypt new token if provided
    if (dto.botToken) {
      integration.encryptedToken = await this.cryptoService.encrypt(
        dto.botToken,
      );
    }

    if (dto.config) {
      integration.config = { ...integration.config, ...dto.config };
    }

    if (dto.status) {
      integration.status = dto.status;
    }

    const updated = await integration.save();

    // Emit Redis event
    await this.emitIntegrationEvent(REDIS_EVENTS.INTEGRATION_UPDATED, {
      integrationId: integration._id.toString(),
      orgId,
      platform: integration.platform,
    });

    return {
      ...updated.toObject(),
      encryptedToken: '***MASKED***',
    };
  }

  async remove(orgId: string, integrationId: string): Promise<void> {
    const integration = await this.integrationModel.findOne({
      // @ts-expect-error TS2769
      _id: new Types.ObjectId(integrationId),
      isDeleted: false,
      organization: new Types.ObjectId(orgId),
    });

    if (!integration) {
      throw new NotFoundException('Integration not found');
    }

    integration.isDeleted = true;
    await integration.save();

    // Emit Redis event
    await this.emitIntegrationEvent(REDIS_EVENTS.INTEGRATION_DELETED, {
      integrationId: integration._id.toString(),
      orgId,
      platform: integration.platform,
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
