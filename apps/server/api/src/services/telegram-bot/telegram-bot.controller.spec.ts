import { TelegramBotController } from '@api/services/telegram-bot/telegram-bot.controller';
import { TelegramBotService } from '@api/services/telegram-bot/telegram-bot.service';
import { ConfigService } from '@libs/config/config.service';
import { UnauthorizedException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

describe('TelegramBotController', () => {
  let controller: TelegramBotController;
  let telegramBotServiceMock: {
    handleWebhookUpdate: ReturnType<typeof vi.fn>;
    getStatus: ReturnType<typeof vi.fn>;
  };

  const WEBHOOK_SECRET = 'telegram-webhook-secret';
  const configGetMock = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    configGetMock.mockImplementation((key: string) =>
      key === 'TELEGRAM_WEBHOOK_SECRET' ? WEBHOOK_SECRET : undefined,
    );

    telegramBotServiceMock = {
      getStatus: vi.fn(),
      handleWebhookUpdate: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TelegramBotController],
      providers: [
        { provide: ConfigService, useValue: { get: configGetMock } },
        { provide: TelegramBotService, useValue: telegramBotServiceMock },
      ],
    }).compile();

    controller = module.get<TelegramBotController>(TelegramBotController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('webhook', () => {
    it('rejects a missing or wrong secret before touching the bot', async () => {
      await expect(controller.webhook({ update_id: 1 })).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(
        controller.webhook({ update_id: 1 }, 'wrong'),
      ).rejects.toThrow(UnauthorizedException);
      expect(telegramBotServiceMock.handleWebhookUpdate).not.toHaveBeenCalled();
    });

    it('rejects every request when no secret is configured', async () => {
      configGetMock.mockReturnValue(undefined);

      await expect(
        controller.webhook({ update_id: 1 }, 'anything'),
      ).rejects.toThrow(UnauthorizedException);
      expect(telegramBotServiceMock.handleWebhookUpdate).not.toHaveBeenCalled();
    });

    it('should call handleWebhookUpdate with the update payload', async () => {
      telegramBotServiceMock.handleWebhookUpdate.mockResolvedValue(undefined);

      const update = { message: { text: 'hello' }, update_id: 123 };
      const result = await controller.webhook(update, WEBHOOK_SECRET);

      expect(telegramBotServiceMock.handleWebhookUpdate).toHaveBeenCalledWith(
        update,
      );
      expect(result).toEqual({ ok: true });
    });

    it('should return ok: true even for empty updates', async () => {
      telegramBotServiceMock.handleWebhookUpdate.mockResolvedValue(undefined);

      const result = await controller.webhook({}, WEBHOOK_SECRET);
      expect(result).toEqual({ ok: true });
    });

    it('should propagate errors thrown by handleWebhookUpdate', async () => {
      telegramBotServiceMock.handleWebhookUpdate.mockRejectedValue(
        new Error('Bot processing error'),
      );

      await expect(
        controller.webhook({ update_id: 999 }, WEBHOOK_SECRET),
      ).rejects.toThrow('Bot processing error');
    });

    it('should handle null/undefined updates without crashing', async () => {
      telegramBotServiceMock.handleWebhookUpdate.mockResolvedValue(undefined);

      const result = await controller.webhook(null, WEBHOOK_SECRET);
      expect(result).toEqual({ ok: true });
      expect(telegramBotServiceMock.handleWebhookUpdate).toHaveBeenCalledWith(
        null,
      );
    });

    it('should pass through complex update structures intact', async () => {
      telegramBotServiceMock.handleWebhookUpdate.mockResolvedValue(undefined);

      const complexUpdate = {
        callback_query: {
          data: 'action:confirm',
          from: { first_name: 'Test', id: 789, is_bot: false },
          id: 'cq_123',
        },
        update_id: 456,
      };

      await controller.webhook(complexUpdate, WEBHOOK_SECRET);
      expect(telegramBotServiceMock.handleWebhookUpdate).toHaveBeenCalledWith(
        complexUpdate,
      );
    });
  });

  describe('getStatus', () => {
    it('should return the status from TelegramBotService', () => {
      const mockStatus = {
        botUsername: 'GenfeedBot',
        mode: 'webhook',
        running: true,
      };
      telegramBotServiceMock.getStatus.mockReturnValue(mockStatus);

      const result = controller.getStatus();
      expect(result).toEqual(mockStatus);
      expect(telegramBotServiceMock.getStatus).toHaveBeenCalledTimes(1);
    });

    it('should return polling mode status', () => {
      telegramBotServiceMock.getStatus.mockReturnValue({
        mode: 'polling',
        running: true,
      });

      const result = controller.getStatus();
      expect((result as { mode: string }).mode).toBe('polling');
    });

    it('should propagate errors thrown by getStatus', () => {
      telegramBotServiceMock.getStatus.mockImplementation(() => {
        throw new Error('Service unavailable');
      });

      expect(() => controller.getStatus()).toThrow('Service unavailable');
    });

    it('should call service getStatus without any arguments', () => {
      telegramBotServiceMock.getStatus.mockReturnValue({});

      controller.getStatus();
      expect(telegramBotServiceMock.getStatus).toHaveBeenCalledWith();
    });
  });
});
