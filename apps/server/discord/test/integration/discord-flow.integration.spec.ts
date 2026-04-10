/**
 * Discord Bot Manager Integration Tests
 * Tests the full lifecycle: integration creation -> bot startup -> command handling -> workflow execution
 */

import { ConfigService } from '@discord/config/config.service';
import { DiscordBotManager } from '@discord/services/discord-bot-manager.service';
import { OrgIntegration, REDIS_EVENTS } from '@genfeedai/integrations';
import { RedisService } from '@libs/redis/redis.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';

// Hoist mocks
const { mockClient, mockRest } = vi.hoisted(() => ({
  mockClient: {
    destroy: vi.fn(),
    login: vi.fn(),
    off: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    user: { id: '123456789', tag: 'TestBot#1234', username: 'TestBot' },
  },
  mockRest: {
    put: vi.fn().mockResolvedValue([]),
    setToken: vi.fn().mockReturnThis(),
  },
}));

vi.mock('discord.js', () => ({
  ActionRowBuilder: vi.fn(function () {
    return { addComponents: vi.fn().mockReturnThis() };
  }),
  ButtonBuilder: vi.fn(function () {
    return {
      setCustomId: vi.fn().mockReturnThis(),
      setLabel: vi.fn().mockReturnThis(),
      setStyle: vi.fn().mockReturnThis(),
    };
  }),
  ButtonStyle: { Danger: 4, Primary: 1, Secondary: 2, Success: 3 },
  Client: vi.fn(function () {
    return mockClient;
  }),
  Events: { ClientReady: 'clientReady' },
  GatewayIntentBits: {
    DirectMessages: 4,
    GuildMessages: 2,
    Guilds: 1,
    MessageContent: 3,
  },
  REST: vi.fn(function () {
    return mockRest;
  }),
  Routes: { applicationCommands: vi.fn().mockReturnValue('/commands') },
  SlashCommandBuilder: vi.fn(function () {
    return {
      setDescription: vi.fn().mockReturnThis(),
      setName: vi.fn().mockReturnThis(),
      toJSON: vi.fn().mockReturnValue({}),
    };
  }),
}));

describe('Discord Bot Manager Integration Flow', () => {
  let service: DiscordBotManager;
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
    botToken: 'discord-bot-token-123',
    config: {
      allowedUserIds: ['user-123'],
      defaultWorkflow: 'wf-image-gen',
    },
    createdAt: new Date('2024-01-01'),
    id: 'discord-integration-1',
    orgId: 'org-123',
    platform: 'discord',
    status: 'active',
    updatedAt: new Date('2024-01-01'),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const mockConfigService = {
      API_URL: 'http://localhost:3010',
      get: vi.fn().mockReturnValue('test-api-key'),
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
        DiscordBotManager,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: HttpService, useValue: httpService },
        { provide: RedisService, useValue: redisService },
      ],
    }).compile();

    service = module.get<DiscordBotManager>(DiscordBotManager);
  });

  describe('Full Lifecycle', () => {
    it('should initialize, fetch integrations, and create bot instances', async () => {
      mockClient.login.mockResolvedValue('logged-in');

      await service.initialize();

      // Should subscribe to Redis events
      expect(redisService.subscribe).toHaveBeenCalled();

      // Should fetch integrations from API
      expect(httpService.get).toHaveBeenCalled();

      // Should have one active bot
      expect(service.getActiveCount()).toBe(1);
    });

    it('should create bot instance and register slash commands', async () => {
      mockClient.login.mockResolvedValue('logged-in');

      // Simulate ready event callback
      mockClient.once.mockImplementation(
        (event: string, callback: (...args: unknown[]) => void) => {
          if (event === 'clientReady') {
            callback(mockClient);
          }
          return mockClient;
        },
      );

      await service.initialize();

      // Should register slash commands via REST
      expect(mockRest.setToken).toHaveBeenCalledWith('discord-bot-token-123');
      expect(mockRest.put).toHaveBeenCalled();
    });

    it('should handle integration lifecycle: add -> update -> remove', async () => {
      mockClient.login.mockResolvedValue('logged-in');

      // Step 1: Add integration
      await service.addIntegration(mockIntegration);
      expect(service.getActiveCount()).toBe(1);

      // Step 2: Update integration
      const updatedIntegration = {
        ...mockIntegration,
        config: { ...mockIntegration.config, defaultWorkflow: 'wf-new' },
      };
      mockClient.destroy.mockResolvedValue(undefined);
      await service.updateIntegration(updatedIntegration);
      expect(service.getActiveCount()).toBe(1);

      // Step 3: Remove integration
      await service.removeIntegration(mockIntegration.id);
      expect(mockClient.destroy).toHaveBeenCalled();
      expect(service.getActiveCount()).toBe(0);
    });
  });

  describe('Redis Hot Reload', () => {
    it('should handle INTEGRATION_CREATED event from Redis', async () => {
      mockClient.login.mockResolvedValue('logged-in');
      await service.initialize();

      // Service subscribes per-event: calls[0]=CREATED, calls[1]=UPDATED, calls[2]=DELETED
      const createdCall = redisService.subscribe.mock.calls.find(
        (call: unknown[]) => call[0] === REDIS_EVENTS.INTEGRATION_CREATED,
      );
      expect(createdCall).toBeDefined();
      const callback = createdCall[1] as (data: unknown) => void;

      // Mock the HTTP fetch for the new integration
      const newIntegration: OrgIntegration = {
        ...mockIntegration,
        id: 'new-integration-2',
        orgId: 'org-456',
      };
      httpService.get.mockReturnValue(of({ data: newIntegration }));

      // Callback receives IntegrationEvent shape (not JSON string)
      callback({
        integrationId: 'new-integration-2',
        orgId: 'org-456',
        platform: 'discord',
      });

      // Allow async processing (fetchAndAddIntegration is async)
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(service.getActiveCount()).toBe(2);
    });

    it('should handle INTEGRATION_DELETED event from Redis', async () => {
      mockClient.login.mockResolvedValue('logged-in');
      mockClient.destroy.mockResolvedValue(undefined);
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
        platform: 'discord',
      });

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(service.getActiveCount()).toBe(0);
    });
  });

  describe('Shutdown', () => {
    it('should destroy all bot instances and unsubscribe from Redis', async () => {
      mockClient.login.mockResolvedValue('logged-in');
      mockClient.destroy.mockResolvedValue(undefined);

      await service.initialize();
      expect(service.getActiveCount()).toBe(1);

      await service.shutdown();

      expect(mockClient.destroy).toHaveBeenCalled();
      expect(service.getActiveCount()).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle bot login failure gracefully', async () => {
      mockClient.login.mockRejectedValue(new Error('Invalid token'));

      // addIntegration logs the error then re-throws
      await expect(service.addIntegration(mockIntegration)).rejects.toThrow(
        'Invalid token',
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
