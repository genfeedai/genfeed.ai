import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import type { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { TelegramBotService } from '@api/services/telegram-bot/telegram-bot.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('TelegramBotService', () => {
  let service: TelegramBotService;
  let configService: ConfigService;
  let logger: LoggerService;
  let systemWorkflowRunner: SystemWorkflowRunnerService;
  let prisma: PrismaService;
  let apiKeysService: ApiKeysService;

  beforeEach(() => {
    configService = {
      get: vi.fn((key: string) => {
        if (key === 'TELEGRAM_BOT_TOKEN') {
          return 'test-token';
        }
        if (key === 'TELEGRAM_BOT_ENABLED') {
          return 'false';
        }
        if (key === 'TELEGRAM_ALLOWED_USER_IDS') {
          return '123,456';
        }
        return '';
      }),
    } as unknown as ConfigService;

    logger = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as LoggerService;

    systemWorkflowRunner = {
      registerWorkflow: vi.fn(),
      runWorkflow: vi.fn(),
    } as unknown as SystemWorkflowRunnerService;
    prisma = {} as PrismaService;

    apiKeysService = {
      findByKey: vi.fn(),
    } as unknown as ApiKeysService;

    service = new TelegramBotService(
      configService,
      logger,
      systemWorkflowRunner,
      prisma,
      apiKeysService,
    );
  });

  describe('authorization', () => {
    function probe(target: TelegramBotService) {
      return target as unknown as {
        allowedUserIds: Set<number>;
        isAuthorized(userId: number): boolean;
      };
    }

    it('denies every user when no allowlist is configured', () => {
      expect(probe(service).allowedUserIds.size).toBe(0);
      expect(probe(service).isAuthorized(123)).toBe(false);
    });

    it('reports the allowlist size rather than claiming every user is allowed', () => {
      expect(service.getStatus().allowedUsers).toBe(0);

      probe(service).allowedUserIds.add(123);

      expect(service.getStatus().allowedUsers).toBe(1);
    });
  });
});
