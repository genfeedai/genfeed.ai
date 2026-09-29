import { AgentType } from '@genfeedai/contracts';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type AgentProfileResolutionContext,
  AgentProfileResolverService,
} from './agent-profile-resolver.service';

vi.mock(
  '@api/services/agent-orchestrator/constants/agent-type-config.constant',
  () => ({
    getAgentTypeConfig: vi.fn((agentType: string) => {
      if (agentType === 'content') {
        return { defaultTools: ['generate_content', 'post_content'] };
      }
      return { defaultTools: ['search'] };
    }),
  }),
);

vi.mock('@api/helpers/utils/entity-id/entity-id.util', () => ({
  EntityIdUtil: {
    normalizeId: vi.fn((id?: string) => {
      if (!id) return undefined;
      return id;
    }),
  },
}));

describe('AgentProfileResolverService', () => {
  let service: AgentProfileResolverService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AgentProfileResolverService],
    }).compile();

    service = module.get<AgentProfileResolverService>(
      AgentProfileResolverService,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('resolve()', () => {
    it('should include agentType in routeKey when provided', () => {
      const context: AgentProfileResolutionContext = {
        agentType: 'content' as AgentType,
      };
      const snapshot = service.resolve(context);

      expect(snapshot.routeKey).toMatch(/^content:/);
      expect(snapshot.agentType).toBe('content');
    });

    it('should include campaign ObjectId in routeKey when campaignId provided', () => {
      const campaignId = 'test-object-id';
      const context: AgentProfileResolutionContext = { campaignId };
      const snapshot = service.resolve(context);

      expect(snapshot.campaign).toBeDefined();
      expect(snapshot.campaign?.toString()).toBe(campaignId);
      expect(snapshot.routeKey).toContain(campaignId);
    });

    it('should include strategy ObjectId in snapshot when strategyId provided', () => {
      const strategyId = 'test-object-id';
      const context: AgentProfileResolutionContext = { strategyId };
      const snapshot = service.resolve(context);

      expect(snapshot.strategy).toBeDefined();
      expect(snapshot.strategy?.toString()).toBe(strategyId);
    });

    it('should populate enabledTools from agentType config', () => {
      const context: AgentProfileResolutionContext = {
        agentType: 'content' as AgentType,
      };
      const snapshot = service.resolve(context);

      expect(snapshot.enabledTools).toContain('generate_content');
      expect(snapshot.enabledTools).toContain('post_content');
    });
  });
});
