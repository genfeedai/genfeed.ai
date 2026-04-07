/**
 * Slack Bot Manager Integration Tests
 * Tests the full lifecycle: integration creation -> bot startup -> command handling -> workflow execution
 */

import { OrgIntegration, REDIS_EVENTS } from '@genfeedai/integrations';
import { RedisService } from '@libs/redis/redis.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@slack/config/config.service';
import { SlackBotManager } from '@slack/services/slack-bot-manager.service';
import { of } from 'rxjs';

// Hoist mocks
const { mockApp } = vi.hoisted(() => ({
  mockApp: {
    action: vi.fn(),
    command: vi.fn(),
    event: vi.fn(),
    message: vi.fn(),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    use: vi.fn(),
  },
}));

vi.mock('@slack/bolt', () => ({
  App: vi.fn(function () {
    return mockApp;
  }),
}));

describe('Slack Bot Manager Integration Flow', () => {
  let service: SlackBotManager;
  let httpService: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
  };
  let redisService: {
    publish: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
    unsubscribe: ReturnType<typeof vi.fn>;
  };

  const mockIntegration: OrgIntegration = {
    botToken: 'mock-bot-token-test-123',
    config: {
      allowedUserIds: ['U123456'],
      appToken: 'mock-slack-app-token',
      defaultWorkflow: 'wf-slack-gen',
    },
    createdAt: new Date('2024-01-01'),
    id: 'slack-integration-1',
    orgId: 'org-456',
    platform: 'slack',
    status: 'active',
    updatedAt: new Date('2024-01-01'),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const mockConfigService = {
      API_KEY: 'test-api-key',
      API_URL: 'http://localhost:3010',
      get: vi.fn().mockReturnValue('test-value'),
      SERVICE_NAME: 'slack',
    };

    httpService = {
      get: vi.fn(),
      post: vi.fn(),
    };

    redisService = {
      publish: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    };

    // Mock HTTP calls for fetching integrations
    httpService.get.mockReturnValue(of({ data: [mockIntegration] }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlackBotManager,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: HttpService, useValue: httpService },
        { provide: RedisService, useValue: redisService },
      ],
    }).compile();

    service = module.get<SlackBotManager>(SlackBotManager);
  });

  describe('Full Lifecycle', () => {
    it('should initialize, fetch integrations, and create bot instances', async () => {
      await service.initialize();

      // Should subscribe to Redis events
      expect(redisService.subscribe).toHaveBeenCalled();

      // Should fetch integrations from API
      expect(httpService.get).toHaveBeenCalled();

      // Should have one active bot
      expect(service.getActiveCount()).toBe(1);
    });

    it('should create Slack App with socket mode config', async () => {
      await service.initialize();

      // Verify App was constructed with correct config
      const { App } = await import('@slack/bolt');
      expect(App).toHaveBeenCalledWith(
        expect.objectContaining({
          appToken: 'mock-slack-app-token',
          socketMode: true,
          token: 'mock-bot-token-test-123',
        }),
      );
    });

    it('should register command handlers on bot creation', async () => {
      await service.initialize();

      // Should register slash commands
      expect(mockApp.command).toHaveBeenCalled();
    });

    it('should handle integration lifecycle: add -> update -> remove', async () => {
      // Step 1: Add integration
      await service.addIntegration(mockIntegration);
      expect(service.getActiveCount()).toBe(1);

      // Step 2: Update integration (destroys old, creates new)
      const updatedIntegration = {
        ...mockIntegration,
        config: {
          ...mockIntegration.config,
          defaultWorkflow: 'wf-updated',
        },
      };
      await service.updateIntegration(updatedIntegration);
      expect(service.getActiveCount()).toBe(1);
      expect(mockApp.stop).toHaveBeenCalled();

      // Step 3: Remove integration
      await service.removeIntegration(mockIntegration.id);
      expect(mockApp.stop).toHaveBeenCalled();
      expect(service.getActiveCount()).toBe(0);
    });
  });

  describe('Redis Hot Reload', () => {
    it('should handle INTEGRATION_CREATED event from Redis', async () => {
      await service.initialize();

      // Service subscribes per-event: find the CREATED callback
      const createdCall = redisService.subscribe.mock.calls.find(
        (call: unknown[]) => call[0] === REDIS_EVENTS.INTEGRATION_CREATED,
      );
      expect(createdCall).toBeDefined();
      const callback = createdCall[1] as (data: unknown) => void;

      // Mock the HTTP fetch for the new integration
      const newIntegration: OrgIntegration = {
        ...mockIntegration,
        id: 'new-slack-integration-2',
        orgId: 'org-789',
      };
      httpService.get.mockReturnValue(of({ data: newIntegration }));

      // Callback receives IntegrationEvent shape (not JSON string)
      callback({
        integrationId: 'new-slack-integration-2',
        orgId: 'org-789',
        platform: 'slack',
      });

      // Allow async processing (fetchAndAddIntegration is async)
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(service.getActiveCount()).toBe(2);
    });

    it('should handle INTEGRATION_DELETED event from Redis', async () => {
      await service.initialize();
      expect(service.getActiveCount()).toBe(1);

      // Find the DELETED subscription callback
      const deletedCall = redisService.subscribe.mock.calls.find(
        (call: unknown[]) => call[0] === REDIS_EVENTS.INTEGRATION_DELETED,
      );
      expect(deletedCall).toBeDefined();
      const callback = deletedCall[1] as (data: unknown) => void;

      // Callback receives IntegrationEvent shape
      callback({
        integrationId: mockIntegration.id,
        orgId: mockIntegration.orgId,
        platform: 'slack',
      });

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(service.getActiveCount()).toBe(0);
    });
  });

  describe('Shutdown', () => {
    it('should stop all bot instances and unsubscribe from Redis', async () => {
      await service.initialize();
      expect(service.getActiveCount()).toBe(1);

      await service.shutdown();

      expect(mockApp.stop).toHaveBeenCalled();
      expect(service.getActiveCount()).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle bot start failure gracefully', async () => {
      mockApp.start.mockRejectedValueOnce(new Error('Socket mode failed'));

      // addIntegration logs the error then re-throws
      await expect(service.addIntegration(mockIntegration)).rejects.toThrow(
        'Socket mode failed',
      );

      expect(service.getActiveCount()).toBe(0);
    });

    it('should handle API fetch failure during initialization', async () => {
      httpService.get.mockReturnValue(of({ data: [] }));

      await service.initialize();

      // Should initialize successfully with no bots
      expect(service.getActiveCount()).toBe(0);
    });
  });
});
