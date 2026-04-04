import { TelegramBotController } from '@api/services/telegram-bot/telegram-bot.controller';
import { TelegramBotService } from '@api/services/telegram-bot/telegram-bot.service';
import { Test, type TestingModule } from '@nestjs/testing';

describe('TelegramBotController', () => {
  let controller: TelegramBotController;
  let telegramBotServiceMock: {
    handleWebhookUpdate: ReturnType<typeof vi.fn>;
    getStatus: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    telegramBotServiceMock = {
      getStatus: vi.fn(),
      handleWebhookUpdate: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TelegramBotController],
      providers: [
        { provide: TelegramBotService, useValue: telegramBotServiceMock },
      ],
    }).compile();

    controller = module.get<TelegramBotController>(TelegramBotController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('webhook', () => {
    it('should call handleWebhookUpdate with the update payload', async () => {
      telegramBotServiceMock.handleWebhookUpdate.mockResolvedValue(undefined);

      const update = { message: { text: 'hello' }, update_id: 123 };
      const result = await controller.webhook(update);

      expect(telegramBotServiceMock.handleWebhookUpdate).toHaveBeenCalledWith(
        update,
      );
      expect(result).toEqual({ ok: true });
    });

    it('should return ok: true even for empty updates', async () => {
      telegramBotServiceMock.handleWebhookUpdate.mockResolvedValue(undefined);

      const result = await controller.webhook({});
      expect(result).toEqual({ ok: true });
    });

    it('should propagate errors thrown by handleWebhookUpdate', async () => {
      telegramBotServiceMock.handleWebhookUpdate.mockRejectedValue(
        new Error('Bot processing error'),
      );

      await expect(controller.webhook({ update_id: 999 })).rejects.toThrow(
        'Bot processing error',
      );
    });

    it('should handle null/undefined updates without crashing', async () => {
      telegramBotServiceMock.handleWebhookUpdate.mockResolvedValue(undefined);

      const result = await controller.webhook(null);
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

      await controller.webhook(complexUpdate);
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
