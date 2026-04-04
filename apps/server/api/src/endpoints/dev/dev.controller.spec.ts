import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import type { ConfigService } from '@api/config/config.service';
import { DevController } from '@api/endpoints/dev/dev.controller';
import type { NotificationsService } from '@api/services/notifications/notifications.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Types } from 'mongoose';

describe('DevController', () => {
  let controller: DevController;
  let configService: { ingredientsEndpoint: string; isProduction: boolean };
  let loggerService: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let notificationsService: { sendNotification: ReturnType<typeof vi.fn> };
  let ingredientsService: { findOne: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    configService = {
      ingredientsEndpoint: 'https://cdn.example.com',
      isProduction: false,
    };
    loggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
    notificationsService = {
      sendNotification: vi.fn().mockResolvedValue(undefined),
    };
    ingredientsService = { findOne: vi.fn() };

    controller = new DevController(
      configService as unknown as ConfigService,
      loggerService as unknown as LoggerService,
      notificationsService as unknown as NotificationsService,
      ingredientsService as unknown as IngredientsService,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('throws FORBIDDEN when in production mode', async () => {
    configService.isProduction = true;
    controller = new DevController(
      configService as unknown as ConfigService,
      loggerService as unknown as LoggerService,
      notificationsService as unknown as NotificationsService,
      ingredientsService as unknown as IngredientsService,
    );

    await expect(
      controller.debugDiscordCard({ ingredientId: 'abc' }),
    ).rejects.toThrow(HttpException);
  });

  it('throws BAD_REQUEST when ingredientId is missing', async () => {
    await expect(
      controller.debugDiscordCard({ ingredientId: '' }),
    ).rejects.toThrow(HttpException);
  });

  it('throws NOT_FOUND when ingredient does not exist', async () => {
    ingredientsService.findOne.mockResolvedValue(null);
    const ingredientId = new Types.ObjectId().toString();
    await expect(controller.debugDiscordCard({ ingredientId })).rejects.toThrow(
      HttpException,
    );
  });

  it('sends Discord notification for valid ingredient', async () => {
    const ingredientId = new Types.ObjectId().toString();
    ingredientsService.findOne.mockResolvedValue({
      _id: new Types.ObjectId(ingredientId),
      category: 'image',
      metadata: { width: 1024 },
      prompt: 'a sunset',
    });

    const result = await controller.debugDiscordCard({ ingredientId });

    expect(result.success).toBe(true);
    expect(result.data.category).toBe('image');
    expect(notificationsService.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ingredient_notification',
        type: 'discord',
      }),
    );
  });

  it('builds correct CDN URL', async () => {
    const ingredientId = new Types.ObjectId().toString();
    ingredientsService.findOne.mockResolvedValue({
      _id: new Types.ObjectId(ingredientId),
      category: 'video',
      metadata: {},
      prompt: 'a test',
    });

    const result = await controller.debugDiscordCard({ ingredientId });
    expect(result.data.cdnUrl).toBe(
      `https://cdn.example.com/videos/${ingredientId}`,
    );
  });

  it('logs start and completion', async () => {
    const ingredientId = new Types.ObjectId().toString();
    ingredientsService.findOne.mockResolvedValue({
      _id: new Types.ObjectId(ingredientId),
      category: 'image',
      metadata: {},
      prompt: 'test',
    });

    await controller.debugDiscordCard({ ingredientId });
    expect(loggerService.log).toHaveBeenCalledTimes(2);
  });

  it('logs error and wraps when sendNotification fails', async () => {
    const ingredientId = new Types.ObjectId().toString();
    ingredientsService.findOne.mockResolvedValue({
      _id: new Types.ObjectId(ingredientId),
      category: 'image',
      metadata: {},
      prompt: 'test',
    });
    notificationsService.sendNotification.mockRejectedValue(
      new Error('Redis down'),
    );

    await expect(controller.debugDiscordCard({ ingredientId })).rejects.toThrow(
      HttpException,
    );
    expect(loggerService.error).toHaveBeenCalled();
  });

  it('warns on construction when in production', () => {
    configService.isProduction = true;
    new DevController(
      configService as unknown as ConfigService,
      loggerService as unknown as LoggerService,
      notificationsService as unknown as NotificationsService,
      ingredientsService as unknown as IngredientsService,
    );
    expect(loggerService.warn).toHaveBeenCalled();
  });
});
