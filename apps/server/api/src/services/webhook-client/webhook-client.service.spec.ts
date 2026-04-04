import type { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { WebhookClientService } from '@api/services/webhook-client/webhook-client.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { Types } from 'mongoose';

const orgId = new Types.ObjectId().toString();

describe('WebhookClientService', () => {
  let service: WebhookClientService;
  let mockQueue: { add: ReturnType<typeof vi.fn> };
  let mockOrgSettingsService: { findOne: ReturnType<typeof vi.fn> };
  let mockLoggerService: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const validSettings = {
    isWebhookEnabled: true,
    webhookEndpoint: 'https://example.com/hook',
    webhookSecret: 'secret-key',
  };

  const mockIngredient = {
    _id: new Types.ObjectId().toString(),
    category: 'image',
    label: 'test ingredient',
    prompt: 'test prompt',
    toJSON: () => ({ _id: 'ing-1', category: 'image' }),
  };

  beforeEach(() => {
    mockQueue = {
      add: vi.fn().mockResolvedValue({ id: 'job-1' }),
    };
    mockOrgSettingsService = {
      findOne: vi.fn().mockResolvedValue(null),
    };
    mockLoggerService = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    service = new WebhookClientService(
      mockQueue as never,
      mockLoggerService as unknown as LoggerService,
      mockOrgSettingsService as unknown as OrganizationSettingsService,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('sendIngredientWebhook does nothing when no settings found', async () => {
    mockOrgSettingsService.findOne.mockResolvedValue(null);
    await service.sendIngredientWebhook(orgId, mockIngredient as never);
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('sendIngredientWebhook does nothing when webhook not enabled', async () => {
    mockOrgSettingsService.findOne.mockResolvedValue({
      ...validSettings,
      isWebhookEnabled: false,
    });
    await service.sendIngredientWebhook(orgId, mockIngredient as never);
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('sendIngredientWebhook does nothing when no webhook secret', async () => {
    mockOrgSettingsService.findOne.mockResolvedValue({
      ...validSettings,
      webhookSecret: null,
    });
    await service.sendIngredientWebhook(orgId, mockIngredient as never);
    expect(mockQueue.add).not.toHaveBeenCalled();
    expect(mockLoggerService.warn).toHaveBeenCalled();
  });

  it('sendIngredientWebhook queues job when webhook enabled', async () => {
    mockOrgSettingsService.findOne.mockResolvedValue(validSettings);
    await service.sendIngredientWebhook(orgId, mockIngredient as never);
    expect(mockQueue.add).toHaveBeenCalledWith(
      'send-webhook',
      expect.objectContaining({
        endpoint: 'https://example.com/hook',
        organizationId: orgId,
        secret: 'secret-key',
      }),
      expect.objectContaining({ jobId: expect.any(String) }),
    );
  });

  it('sendWebhook does nothing when settings missing', async () => {
    mockOrgSettingsService.findOne.mockResolvedValue(null);
    await service.sendWebhook(orgId, 'test.event', { key: 'value' });
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('sendWebhook queues a generic webhook event', async () => {
    mockOrgSettingsService.findOne.mockResolvedValue(validSettings);
    await service.sendWebhook(orgId, 'ingredient.updated', { id: 'abc' });
    expect(mockQueue.add).toHaveBeenCalledWith(
      'send-webhook',
      expect.objectContaining({
        endpoint: 'https://example.com/hook',
        payload: expect.objectContaining({ event: 'ingredient.updated' }),
      }),
      expect.anything(),
    );
  });

  it('sendIngredientWebhook does not throw on queue error', async () => {
    mockOrgSettingsService.findOne.mockResolvedValue(validSettings);
    mockQueue.add.mockRejectedValue(new Error('Queue unavailable'));
    await expect(
      service.sendIngredientWebhook(orgId, mockIngredient as never),
    ).resolves.toBeUndefined();
    expect(mockLoggerService.error).toHaveBeenCalled();
  });

  it('sendWebhook does not throw on queue error', async () => {
    mockOrgSettingsService.findOne.mockResolvedValue(validSettings);
    mockQueue.add.mockRejectedValue(new Error('Queue down'));
    await expect(
      service.sendWebhook(orgId, 'event', {}),
    ).resolves.toBeUndefined();
    expect(mockLoggerService.error).toHaveBeenCalled();
  });

  it('sendIngredientWebhook logs success after queuing', async () => {
    mockOrgSettingsService.findOne.mockResolvedValue(validSettings);
    await service.sendIngredientWebhook(orgId, mockIngredient as never);
    expect(mockLoggerService.log).toHaveBeenCalled();
  });
});
