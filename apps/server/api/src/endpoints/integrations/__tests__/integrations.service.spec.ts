import { CredentialCryptoService } from '@api/collections/credentials/services/credential-crypto.service';
import { CreateIntegrationDto } from '@api/endpoints/integrations/dto/create-integration.dto';
import { UpdateIntegrationDto } from '@api/endpoints/integrations/dto/update-integration.dto';
import { IntegrationsService } from '@api/endpoints/integrations/integrations.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { IntegrationPlatform, IntegrationStatus } from '@genfeedai/enums';
import { REDIS_EVENTS } from '@genfeedai/integrations';
import { RedisService } from '@libs/redis/redis.service';
import type { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * The wire format of `platform` / `status` is a contract with the channel bot
 * services: `BotInternalApiClient` normalizes these responses into
 * `OrgIntegration`, and each bot manager drops any `integration:*` Redis event
 * whose `platform` is not its own `IntegrationPlatform` member. Lowercasing
 * either field silently breaks bot hot-reload rather than failing loudly.
 */
describe('IntegrationsService', () => {
  const ORG_ID = 'org-123';

  // Prisma enum columns always hold SCREAMING_SNAKE labels.
  const prismaRow = {
    config: { defaultWorkflow: 'wf-1' },
    createdAt: new Date('2026-01-01'),
    encryptedToken: 'encrypted-token',
    id: 'integration-456',
    isDeleted: false,
    organizationId: ORG_ID,
    platform: 'DISCORD',
    status: 'ACTIVE',
    updatedAt: new Date('2026-01-01'),
  };

  const prisma = {
    orgIntegration: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  };
  const eventEmitter = { emit: vi.fn() };
  const cryptoService = {
    decrypt: vi.fn((value: string) => `decrypted:${value}`),
    encrypt: vi.fn((value: string) => `encrypted:${value}`),
  };
  const redisService = { publish: vi.fn() };

  function buildService(): IntegrationsService {
    return new IntegrationsService(
      prisma as unknown as PrismaService,
      eventEmitter as unknown as EventEmitter2,
      cryptoService as unknown as CredentialCryptoService,
      redisService as unknown as RedisService,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('wire format', () => {
    it('returns the stored Prisma labels verbatim from findAll', async () => {
      prisma.orgIntegration.findMany.mockResolvedValue([prismaRow]);

      const [integration] = await buildService().findAll(ORG_ID);

      expect(integration).toMatchObject({
        platform: IntegrationPlatform.DISCORD,
        status: IntegrationStatus.ACTIVE,
      });
    });

    it('returns the stored Prisma labels verbatim from findOne', async () => {
      prisma.orgIntegration.findFirst.mockResolvedValue(prismaRow);

      const integration = await buildService().findOne(ORG_ID, prismaRow.id);

      expect(integration).toMatchObject({
        platform: IntegrationPlatform.DISCORD,
        status: IntegrationStatus.ACTIVE,
      });
    });

    it('returns the stored Prisma labels verbatim from findByPlatform', async () => {
      prisma.orgIntegration.findMany.mockResolvedValue([
        { ...prismaRow, platform: 'TELEGRAM', status: 'PAUSED' },
      ]);

      const [integration] = await buildService().findByPlatform(
        IntegrationPlatform.TELEGRAM,
      );

      expect(integration).toMatchObject({
        botToken: 'decrypted:encrypted-token',
        platform: IntegrationPlatform.TELEGRAM,
        status: IntegrationStatus.PAUSED,
      });
    });

    it('never lowercases a status the bots type as a SCREAMING member', async () => {
      prisma.orgIntegration.findMany.mockResolvedValue([
        { ...prismaRow, status: 'ERROR' },
      ]);

      const [integration] = await buildService().findAll(ORG_ID);

      expect(integration['status']).toBe(IntegrationStatus.ERROR);
      expect(integration['status']).not.toBe('error');
    });
  });

  describe('integration events', () => {
    it('emits create with the platform the bot managers filter on', async () => {
      prisma.orgIntegration.findFirst.mockResolvedValue(null);
      prisma.orgIntegration.create.mockResolvedValue(prismaRow);

      const dto: CreateIntegrationDto = {
        botToken: 'raw-token',
        platform: IntegrationPlatform.DISCORD,
      };

      await buildService().create(ORG_ID, dto);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        REDIS_EVENTS.INTEGRATION_CREATED,
        expect.objectContaining({ platform: IntegrationPlatform.DISCORD }),
      );
    });

    it('emits update with the platform the bot managers filter on', async () => {
      prisma.orgIntegration.findFirst.mockResolvedValue(prismaRow);
      prisma.orgIntegration.update.mockResolvedValue({
        ...prismaRow,
        status: 'PAUSED',
      });

      const dto: UpdateIntegrationDto = { status: IntegrationStatus.PAUSED };

      await buildService().update(ORG_ID, prismaRow.id, dto);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        REDIS_EVENTS.INTEGRATION_UPDATED,
        expect.objectContaining({ platform: IntegrationPlatform.DISCORD }),
      );
      expect(redisService.publish).toHaveBeenCalledWith(
        REDIS_EVENTS.INTEGRATION_UPDATED,
        expect.objectContaining({ platform: IntegrationPlatform.DISCORD }),
      );
    });

    it('emits delete with the platform the bot managers filter on', async () => {
      prisma.orgIntegration.findFirst.mockResolvedValue(prismaRow);
      prisma.orgIntegration.update.mockResolvedValue(prismaRow);

      await buildService().remove(ORG_ID, prismaRow.id);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        REDIS_EVENTS.INTEGRATION_DELETED,
        expect.objectContaining({ platform: IntegrationPlatform.DISCORD }),
      );
    });
  });
});
