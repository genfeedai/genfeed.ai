import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BaseBotManager } from './base-bot-manager';
import { REDIS_EVENTS } from './constants';
import type { OrgIntegration } from './types';

/**
 * Concrete implementation for testing the abstract BaseBotManager.
 */
class TestBotManager extends BaseBotManager<{ id: string; token: string }> {
  initializeCalled = false;
  shutdownCalled = false;
  destroyedInstances: Array<{ id: string; token: string }> = [];
  fetchAndAddCalls: string[] = [];
  fetchAndUpdateCalls: string[] = [];

  async initialize(): Promise<void> {
    this.initializeCalled = true;
  }

  async shutdown(): Promise<void> {
    this.shutdownCalled = true;
  }

  async createBotInstance(
    integration: OrgIntegration,
  ): Promise<{ id: string; token: string }> {
    return { id: integration.id, token: integration.botToken };
  }

  async destroyBotInstance(botInstance: {
    id: string;
    token: string;
  }): Promise<void> {
    this.destroyedInstances.push(botInstance);
  }

  protected async fetchAndAddIntegration(integrationId: string): Promise<void> {
    this.fetchAndAddCalls.push(integrationId);
  }

  protected async fetchAndUpdateIntegration(
    integrationId: string,
  ): Promise<void> {
    this.fetchAndUpdateCalls.push(integrationId);
  }

  /** Expose protected bots map for assertions. */
  getBotsMap(): Map<string, { id: string; token: string }> {
    return this.bots;
  }

  /** Expose logger setter for testing. */
  setLogger(logger: typeof this.logger): void {
    this.logger = logger;
  }
}

function createIntegration(
  overrides: Partial<OrgIntegration> = {},
): OrgIntegration {
  return {
    botToken: 'tok-abc',
    config: {},
    createdAt: new Date('2026-01-01'),
    id: 'int-1',
    orgId: 'org-1',
    platform: 'telegram',
    status: 'active',
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('BaseBotManager', () => {
  let manager: TestBotManager;
  let mockLogger: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    manager = new TestBotManager();
    mockLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };
    manager.setLogger(mockLogger);
  });

  describe('addIntegration', () => {
    it('should create a bot instance and store it in the bots map', async () => {
      const integration = createIntegration();

      await manager.addIntegration(integration);

      expect(manager.getBotsMap().size).toBe(1);
      expect(manager.getBotsMap().get('int-1')).toEqual({
        id: 'int-1',
        token: 'tok-abc',
      });
    });

    it('should log the addition', async () => {
      const integration = createIntegration();

      await manager.addIntegration(integration);

      expect(mockLogger.log).toHaveBeenCalledWith(
        'Adding integration int-1 for org org-1',
      );
      expect(mockLogger.log).toHaveBeenCalledWith(
        'Successfully added integration int-1',
      );
    });

    it('should delegate to updateIntegration when integration already exists', async () => {
      const integration = createIntegration();
      await manager.addIntegration(integration);

      const updatedIntegration = createIntegration({ botToken: 'tok-new' });
      await manager.addIntegration(updatedIntegration);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Integration int-1 already exists, updating instead',
      );
      expect(manager.getBotsMap().get('int-1')).toEqual({
        id: 'int-1',
        token: 'tok-new',
      });
    });

    it('should throw and log error when createBotInstance fails', async () => {
      const integration = createIntegration();
      const error = new Error('creation failed');
      vi.spyOn(manager, 'createBotInstance').mockRejectedValueOnce(error);

      await expect(manager.addIntegration(integration)).rejects.toThrow(
        'creation failed',
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to add integration int-1:',
        error,
      );
    });
  });

  describe('updateIntegration', () => {
    it('should remove existing bot and add new one', async () => {
      const integration = createIntegration();
      await manager.addIntegration(integration);

      const updated = createIntegration({ botToken: 'tok-updated' });
      await manager.updateIntegration(updated);

      expect(manager.destroyedInstances).toHaveLength(1);
      expect(manager.getBotsMap().get('int-1')).toEqual({
        id: 'int-1',
        token: 'tok-updated',
      });
    });

    it('should throw and log error on failure', async () => {
      const integration = createIntegration();
      const error = new Error('update failed');
      vi.spyOn(manager, 'removeIntegration').mockRejectedValueOnce(error);

      await expect(manager.updateIntegration(integration)).rejects.toThrow(
        'update failed',
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to update integration int-1:',
        error,
      );
    });
  });

  describe('removeIntegration', () => {
    it('should destroy and delete an existing bot', async () => {
      const integration = createIntegration();
      await manager.addIntegration(integration);

      await manager.removeIntegration('int-1');

      expect(manager.getBotsMap().size).toBe(0);
      expect(manager.destroyedInstances).toHaveLength(1);
      expect(manager.destroyedInstances[0]).toEqual({
        id: 'int-1',
        token: 'tok-abc',
      });
    });

    it('should warn when integration is not found', async () => {
      await manager.removeIntegration('non-existent');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Integration non-existent not found',
      );
    });

    it('should throw and log error when destroyBotInstance fails', async () => {
      const integration = createIntegration();
      await manager.addIntegration(integration);

      const error = new Error('destroy failed');
      vi.spyOn(manager, 'destroyBotInstance').mockRejectedValueOnce(error);

      await expect(manager.removeIntegration('int-1')).rejects.toThrow(
        'destroy failed',
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to remove integration int-1:',
        error,
      );
    });
  });

  describe('getActiveCount', () => {
    it('should return 0 when no bots are registered', () => {
      expect(manager.getActiveCount()).toBe(0);
    });

    it('should return the number of active bots', async () => {
      await manager.addIntegration(createIntegration({ id: 'int-1' }));
      await manager.addIntegration(createIntegration({ id: 'int-2' }));

      expect(manager.getActiveCount()).toBe(2);
    });

    it('should decrease after removal', async () => {
      await manager.addIntegration(createIntegration({ id: 'int-1' }));
      await manager.addIntegration(createIntegration({ id: 'int-2' }));
      await manager.removeIntegration('int-1');

      expect(manager.getActiveCount()).toBe(1);
    });
  });

  describe('handleRedisEvent', () => {
    it('should call fetchAndAddIntegration for INTEGRATION_CREATED', async () => {
      await manager.handleRedisEvent(REDIS_EVENTS.INTEGRATION_CREATED, {
        integrationId: 'int-1',
        orgId: 'org-1',
        platform: 'telegram',
      });

      expect(manager.fetchAndAddCalls).toEqual(['int-1']);
    });

    it('should call fetchAndUpdateIntegration for INTEGRATION_UPDATED', async () => {
      await manager.handleRedisEvent(REDIS_EVENTS.INTEGRATION_UPDATED, {
        integrationId: 'int-2',
        orgId: 'org-1',
        platform: 'slack',
      });

      expect(manager.fetchAndUpdateCalls).toEqual(['int-2']);
    });

    it('should call removeIntegration for INTEGRATION_DELETED', async () => {
      const integration = createIntegration({ id: 'int-3' });
      await manager.addIntegration(integration);

      await manager.handleRedisEvent(REDIS_EVENTS.INTEGRATION_DELETED, {
        integrationId: 'int-3',
        orgId: 'org-1',
        platform: 'discord',
      });

      expect(manager.getBotsMap().size).toBe(0);
    });

    it('should warn on unknown event type', async () => {
      await manager.handleRedisEvent('unknown:event', {
        integrationId: 'int-1',
        orgId: 'org-1',
        platform: 'telegram',
      });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Unknown Redis event: unknown:event',
      );
    });

    it('should catch and log errors without throwing', async () => {
      const error = new Error('fetch failed');
      manager.fetchAndAddCalls = [];
      vi.spyOn(
        manager as TestBotManager,
        'fetchAndAddIntegration' as never,
      ).mockRejectedValueOnce(error);

      await expect(
        manager.handleRedisEvent(REDIS_EVENTS.INTEGRATION_CREATED, {
          integrationId: 'int-1',
          orgId: 'org-1',
          platform: 'telegram',
        }),
      ).resolves.toBeUndefined();

      expect(mockLogger.error).toHaveBeenCalledWith(
        `Failed to handle Redis event ${REDIS_EVENTS.INTEGRATION_CREATED}:`,
        error,
      );
    });
  });
});
