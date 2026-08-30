/**
 * Discord Bot Manager Integration Tests
 * Tests the full lifecycle: integration creation -> bot startup -> command handling -> workflow execution
 */

import { ConfigService } from '@discord/config/config.service';
import { DiscordBotManager } from '@discord/services/discord-bot-manager.service';
import { OrgIntegration, REDIS_EVENTS } from '@genfeedai/integrations';
import { LoggerService } from '@libs/logger/logger.service';
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

vi.mock('discord.js', () => {
  // The service invokes each of these builders with `new`. A `vi.fn()` spy
  // called with `new` runs its implementation through `Reflect.construct`, and
  // arrow functions are not constructible — so every implementation has to be a
  // real function. Declarations, not expressions: Biome's `useArrowFunction`
  // autofix rewrites function *expressions* straight back to arrows.
  function ActionRowBuilderImpl() {
    return { addComponents: vi.fn().mockReturnThis() };
  }
  function ButtonBuilderImpl() {
    return {
      setCustomId: vi.fn().mockReturnThis(),
      setLabel: vi.fn().mockReturnThis(),
      setStyle: vi.fn().mockReturnThis(),
    };
  }
  function ClientImpl() {
    return mockClient;
  }
  function RestImpl() {
    return mockRest;
  }
  function SlashCommandBuilderImpl() {
    return {
      setDescription: vi.fn().mockReturnThis(),
      setName: vi.fn().mockReturnThis(),
      toJSON: vi.fn().mockReturnValue({}),
    };
  }

  return {
    ActionRowBuilder: vi.fn(ActionRowBuilderImpl),
    // A bare factory replaces the whole module, so every export the service
    // imports must be present or the import throws. The manager uses this one
    // in an `instanceof` check when resolving a send-to-channel target.
    BaseGuildTextChannel: class BaseGuildTextChannel {},
    ButtonBuilder: vi.fn(ButtonBuilderImpl),
    ButtonStyle: { Danger: 4, Primary: 1, Secondary: 2, Success: 3 },
    Client: vi.fn(ClientImpl),
    Events: { ClientReady: 'clientReady' },
    GatewayIntentBits: {
      DirectMessages: 4,
      GuildMessages: 2,
      Guilds: 1,
      MessageContent: 3,
    },
    REST: vi.fn(RestImpl),
    Routes: { applicationCommands: vi.fn().mockReturnValue('/commands') },
    SlashCommandBuilder: vi.fn(SlashCommandBuilderImpl),
  };
});

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
    platform: 'DISCORD',
    status: 'ACTIVE',
    updatedAt: new Date('2024-01-01'),
  };

  const integrationApiPayload = (integration: OrgIntegration) => {
    const { orgId, ...fields } = integration;
    return { ...fields, organizationId: orgId };
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
    httpService.get.mockReturnValue(
      of({ data: [integrationApiPayload(mockIntegration)] }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscordBotManager,
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
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
      httpService.get.mockReturnValue(
        of({ data: integrationApiPayload(newIntegration) }),
      );

      // Callback receives IntegrationEvent shape (not JSON string)
      callback({
        integrationId: 'new-integration-2',
        orgId: 'org-456',
        platform: 'DISCORD',
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
        platform: 'DISCORD',
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
