import { AgentType } from '@genfeedai/enums';
import { Test, type TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
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

vi.mock('@api/helpers/utils/objectid/objectid.util', () => ({
  ObjectIdUtil: {
    normalizeToObjectId: vi.fn((id?: string) => {
      if (!id) return undefined;
      return new Types.ObjectId(id);
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

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('resolve()', () => {
    it('should return a snapshot with routeKey general:none:none when no context provided', () => {
      const context: AgentProfileResolutionContext = {};
      const snapshot = service.resolve(context);

      expect(snapshot.routeKey).toBe('general:none:none');
    });

    it('should include agentType in routeKey when provided', () => {
      const context: AgentProfileResolutionContext = {
        agentType: 'content' as AgentType,
      };
      const snapshot = service.resolve(context);

      expect(snapshot.routeKey).toMatch(/^content:/);
      expect(snapshot.agentType).toBe('content');
    });

    it('should include campaign ObjectId in routeKey when campaignId provided', () => {
      const campaignId = new Types.ObjectId().toString();
      const context: AgentProfileResolutionContext = { campaignId };
      const snapshot = service.resolve(context);

      expect(snapshot.campaign).toBeDefined();
      expect(snapshot.campaign?.toString()).toBe(campaignId);
      expect(snapshot.routeKey).toContain(campaignId);
    });

    it('should include strategy ObjectId in snapshot when strategyId provided', () => {
      const strategyId = new Types.ObjectId().toString();
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

    it('should return empty enabledTools when no agentType provided', () => {
      const context: AgentProfileResolutionContext = {};
      const snapshot = service.resolve(context);

      expect(snapshot.enabledTools).toEqual([]);
    });

    it('should always include expected hooks keys', () => {
      const snapshot = service.resolve({});

      expect(snapshot.hooks).toMatchObject({
        after_tool_call: true,
        before_prompt_build: true,
        before_tool_call: true,
        session_end: true,
      });
    });

    it('should always include memoryPolicy with thread scope', () => {
      const snapshot = service.resolve({});

      expect(snapshot.memoryPolicy).toMatchObject({
        autoFlushOnArchive: true,
        scope: 'thread',
      });
    });

    it('should always include outputRules with safeMarkdownOnly', () => {
      const snapshot = service.resolve({});

      expect(snapshot.outputRules).toMatchObject({
        safeMarkdownOnly: true,
        separateWorkLog: true,
      });
    });

    it('should always include at least one promptFragment', () => {
      const snapshot = service.resolve({});

      expect(snapshot.promptFragments.length).toBeGreaterThan(0);
    });

    it('should build full routeKey from agentType, campaignId, strategyId', () => {
      const campaignId = new Types.ObjectId().toString();
      const strategyId = new Types.ObjectId().toString();
      const context: AgentProfileResolutionContext = {
        agentType: 'content' as AgentType,
        campaignId,
        strategyId,
      };
      const snapshot = service.resolve(context);

      expect(snapshot.routeKey).toBe(`content:${campaignId}:${strategyId}`);
    });
  });
});
