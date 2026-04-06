import { BaseBotManager } from '@integrations/base-bot-manager';
import { type IntegrationEvent, REDIS_EVENTS } from '@integrations/constants';
import type { OrgIntegration } from '@integrations/types';
import type { Mocked } from 'vitest';

// Create a concrete implementation for testing
class TestBotManager extends BaseBotManager {
  public mockCreateBotInstance = vi.fn();
  public mockDestroyBotInstance = vi.fn();
  public mockFetchAndAddIntegration = vi.fn();
  public mockFetchAndUpdateIntegration = vi.fn();

  initialize(): Promise<void> {
    return Promise.resolve();
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  createBotInstance(integration: OrgIntegration): Promise<any> {
    return this.mockCreateBotInstance(integration);
  }

  destroyBotInstance(botInstance: any): Promise<void> {
    return this.mockDestroyBotInstance(botInstance);
  }

  protected fetchAndAddIntegration(integrationId: string): Promise<void> {
    return this.mockFetchAndAddIntegration(integrationId);
  }

  protected fetchAndUpdateIntegration(integrationId: string): Promise<void> {
    return this.mockFetchAndUpdateIntegration(integrationId);
  }
}

describe('BaseBotManager', () => {
  let manager: TestBotManager;
  let mockLogger: Mocked<{
    debug: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    log: (...args: unknown[]) => void;
    verbose?: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
  }>;

  const mockIntegration: OrgIntegration = {
    botToken: 'encrypted-token',
    config: {
      allowedUserIds: ['123', '456'],
      defaultWorkflow: 'wf-1',
    },
    createdAt: new Date('2024-01-01'),
    id: 'test-integration-1',
    orgId: 'org-123',
    platform: 'telegram',
    status: 'active',
    updatedAt: new Date('2024-01-01'),
  };

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      verbose: vi.fn(),
      warn: vi.fn(),
    } as any;

    manager = new TestBotManager();
    // Replace the logger with our mock
    (manager as any).logger = mockLogger;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('addIntegration', () => {
    it('should successfully add a new integration', async () => {
      const mockBotInstance = { id: 'bot-1', running: true };
      manager.mockCreateBotInstance.mockResolvedValue(mockBotInstance);

      await manager.addIntegration(mockIntegration);

      expect(manager.mockCreateBotInstance).toHaveBeenCalledWith(
        mockIntegration,
      );
      expect(manager.getActiveCount()).toBe(1);
      expect(mockLogger.log).toHaveBeenCalledWith(
        'Adding integration test-integration-1 for org org-123',
      );
      expect(mockLogger.log).toHaveBeenCalledWith(
        'Successfully added integration test-integration-1',
      );
    });

    it('should update existing integration when adding duplicate', async () => {
      const mockBotInstance = { id: 'bot-1', running: true };
      manager.mockCreateBotInstance.mockResolvedValue(mockBotInstance);

      // Add integration first time
      await manager.addIntegration(mockIntegration);

      // Try to add the same integration again
      await manager.addIntegration(mockIntegration);

      expect(manager.mockCreateBotInstance).toHaveBeenCalledTimes(2);
      expect(manager.mockDestroyBotInstance).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Integration test-integration-1 already exists, updating instead',
      );
    });

    it('should handle errors during bot creation', async () => {
      const error = new Error('Failed to create bot');
      manager.mockCreateBotInstance.mockRejectedValue(error);

      await expect(manager.addIntegration(mockIntegration)).rejects.toThrow(
        'Failed to create bot',
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to add integration test-integration-1:',
        error,
      );
      expect(manager.getActiveCount()).toBe(0);
    });
  });

  describe('updateIntegration', () => {
    it('should successfully update an existing integration', async () => {
      const mockBotInstance = { id: 'bot-1', running: true };
      manager.mockCreateBotInstance.mockResolvedValue(mockBotInstance);
      manager.mockDestroyBotInstance.mockResolvedValue(undefined);

      // First add the integration
      await manager.addIntegration(mockIntegration);

      // Then update it
      const updatedIntegration = {
        ...mockIntegration,
        status: 'paused' as const,
      };
      await manager.updateIntegration(updatedIntegration);

      expect(manager.mockDestroyBotInstance).toHaveBeenCalledWith(
        mockBotInstance,
      );
      expect(manager.mockCreateBotInstance).toHaveBeenCalledTimes(2);
      expect(mockLogger.log).toHaveBeenCalledWith(
        'Updating integration test-integration-1 for org org-123',
      );
      expect(mockLogger.log).toHaveBeenCalledWith(
        'Successfully updated integration test-integration-1',
      );
    });

    it('should handle errors during update', async () => {
      const error = new Error('Failed to update');
      manager.mockCreateBotInstance.mockRejectedValue(error);

      await expect(manager.updateIntegration(mockIntegration)).rejects.toThrow(
        'Failed to update',
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to update integration test-integration-1:',
        error,
      );
    });
  });

  describe('removeIntegration', () => {
    it('should successfully remove an existing integration', async () => {
      const mockBotInstance = { id: 'bot-1', running: true };
      manager.mockCreateBotInstance.mockResolvedValue(mockBotInstance);
      manager.mockDestroyBotInstance.mockResolvedValue(undefined);

      // First add the integration
      await manager.addIntegration(mockIntegration);
      expect(manager.getActiveCount()).toBe(1);

      // Then remove it
      await manager.removeIntegration(mockIntegration.id);

      expect(manager.mockDestroyBotInstance).toHaveBeenCalledWith(
        mockBotInstance,
      );
      expect(manager.getActiveCount()).toBe(0);
      expect(mockLogger.log).toHaveBeenCalledWith(
        'Removing integration test-integration-1',
      );
      expect(mockLogger.log).toHaveBeenCalledWith(
        'Successfully removed integration test-integration-1',
      );
    });

    it('should handle removal of non-existent integration', async () => {
      await manager.removeIntegration('non-existent-id');

      expect(manager.mockDestroyBotInstance).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Integration non-existent-id not found',
      );
    });

    it('should handle errors during destruction', async () => {
      const mockBotInstance = { id: 'bot-1', running: true };
      const error = new Error('Failed to destroy');

      manager.mockCreateBotInstance.mockResolvedValue(mockBotInstance);
      manager.mockDestroyBotInstance.mockRejectedValue(error);

      // Add integration
      await manager.addIntegration(mockIntegration);

      // Try to remove it
      await expect(
        manager.removeIntegration(mockIntegration.id),
      ).rejects.toThrow('Failed to destroy');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to remove integration test-integration-1:',
        error,
      );
    });
  });

  describe('getActiveCount', () => {
    it('should return 0 for empty manager', () => {
      expect(manager.getActiveCount()).toBe(0);
    });

    it('should return correct count after adding integrations', async () => {
      const mockBotInstance = { id: 'bot-1', running: true };
      manager.mockCreateBotInstance.mockResolvedValue(mockBotInstance);

      await manager.addIntegration(mockIntegration);
      expect(manager.getActiveCount()).toBe(1);

      const secondIntegration = {
        ...mockIntegration,
        id: 'test-integration-2',
      };
      await manager.addIntegration(secondIntegration);
      expect(manager.getActiveCount()).toBe(2);
    });
  });

  describe('handleRedisEvent', () => {
    beforeEach(() => {
      manager.mockFetchAndAddIntegration.mockResolvedValue(undefined);
      manager.mockFetchAndUpdateIntegration.mockResolvedValue(undefined);
    });

    it('should handle INTEGRATION_CREATED event', async () => {
      const event: IntegrationEvent = {
        integrationId: 'integration-456',
        orgId: 'org-123',
        platform: 'telegram',
      };

      await manager.handleRedisEvent(REDIS_EVENTS.INTEGRATION_CREATED, event);

      expect(manager.mockFetchAndAddIntegration).toHaveBeenCalledWith(
        'integration-456',
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Handling Redis event: integration:created',
        event,
      );
    });

    it('should handle INTEGRATION_UPDATED event', async () => {
      const event: IntegrationEvent = {
        integrationId: 'integration-789',
        orgId: 'org-123',
        platform: 'slack',
      };

      await manager.handleRedisEvent(REDIS_EVENTS.INTEGRATION_UPDATED, event);

      expect(manager.mockFetchAndUpdateIntegration).toHaveBeenCalledWith(
        'integration-789',
      );
    });

    it('should handle INTEGRATION_DELETED event', async () => {
      const mockBotInstance = { id: 'bot-1', running: true };
      manager.mockCreateBotInstance.mockResolvedValue(mockBotInstance);
      manager.mockDestroyBotInstance.mockResolvedValue(undefined);

      // Add integration first
      await manager.addIntegration(mockIntegration);

      const event: IntegrationEvent = {
        integrationId: mockIntegration.id,
        orgId: 'org-123',
        platform: 'discord',
      };

      await manager.handleRedisEvent(REDIS_EVENTS.INTEGRATION_DELETED, event);

      expect(manager.mockDestroyBotInstance).toHaveBeenCalled();
      expect(manager.getActiveCount()).toBe(0);
    });

    it('should handle unknown events gracefully', async () => {
      const event: IntegrationEvent = {
        integrationId: 'integration-999',
        orgId: 'org-123',
        platform: 'telegram',
      };

      await manager.handleRedisEvent('unknown:event', event);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Unknown Redis event: unknown:event',
      );
    });

    it('should handle errors in Redis event processing', async () => {
      const error = new Error('Redis error');
      manager.mockFetchAndAddIntegration.mockRejectedValue(error);

      const event: IntegrationEvent = {
        integrationId: 'integration-error',
        orgId: 'org-123',
        platform: 'telegram',
      };

      await manager.handleRedisEvent(REDIS_EVENTS.INTEGRATION_CREATED, event);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to handle Redis event integration:created:',
        error,
      );
    });
  });
});
