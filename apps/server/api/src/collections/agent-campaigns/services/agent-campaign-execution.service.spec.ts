import type { AgentCampaignDocument } from '@api/collections/agent-campaigns/schemas/agent-campaign.schema';
import { AgentCampaignsService } from '@api/collections/agent-campaigns/services/agent-campaigns.service';
import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import { AgentRunQueueService } from '@api/queues/agent-run/agent-run-queue.service';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentCampaignExecutionService } from './agent-campaign-execution.service';

const orgId = new Types.ObjectId().toString();
const userId = new Types.ObjectId().toString();
const campaignId = new Types.ObjectId().toString();
const strategyId = new Types.ObjectId().toString();

const makeCampaign = (
  overrides: Partial<AgentCampaignDocument> = {},
): AgentCampaignDocument =>
  ({
    _id: new Types.ObjectId(campaignId),
    agents: [new Types.ObjectId(strategyId)],
    brief: 'Test campaign brief',
    contentQuota: 100,
    creditsAllocated: 1000,
    creditsUsed: 0,
    isDeleted: false,
    label: 'Test Campaign',
    organization: new Types.ObjectId(orgId),
    status: 'draft',
    ...overrides,
  }) as unknown as AgentCampaignDocument;

describe('AgentCampaignExecutionService', () => {
  let service: AgentCampaignExecutionService;

  const mockLogger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockAgentCampaignsService = {
    findOne: vi.fn(),
    findOneById: vi.fn(),
    patch: vi.fn(),
    patchAll: vi.fn(),
  };

  const mockAgentStrategiesService = {
    findOneById: vi.fn(),
    pauseStrategy: vi.fn(),
    toggleActive: vi.fn(),
  };

  const mockAgentRunsService = {
    create: vi.fn(),
    find: vi.fn(),
  };

  const mockAgentRunQueueService = {
    queueRun: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentCampaignExecutionService,
        { provide: LoggerService, useValue: mockLogger },
        { provide: AgentCampaignsService, useValue: mockAgentCampaignsService },
        {
          provide: AgentStrategiesService,
          useValue: mockAgentStrategiesService,
        },
        { provide: AgentRunsService, useValue: mockAgentRunsService },
        { provide: AgentRunQueueService, useValue: mockAgentRunQueueService },
      ],
    }).compile();

    service = module.get<AgentCampaignExecutionService>(
      AgentCampaignExecutionService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('execute()', () => {
    it('should throw NotFoundException when campaign not found', async () => {
      mockAgentCampaignsService.findOneById.mockResolvedValue(null);

      await expect(service.execute(campaignId, orgId, userId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when campaign is already active', async () => {
      mockAgentCampaignsService.findOneById.mockResolvedValue(
        makeCampaign({ status: 'active' }),
      );

      await expect(service.execute(campaignId, orgId, userId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when campaign is completed', async () => {
      mockAgentCampaignsService.findOneById.mockResolvedValue(
        makeCampaign({ status: 'completed' }),
      );

      await expect(service.execute(campaignId, orgId, userId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should set campaign status to active and queue strategy runs', async () => {
      const campaign = makeCampaign({ status: 'draft' });
      const updatedCampaign = makeCampaign({ status: 'active' });
      const strategy = {
        _id: new Types.ObjectId(strategyId),
        agentType: 'research',
        isActive: false,
        label: 'Test Strategy',
      };
      const run = { _id: new Types.ObjectId() };

      mockAgentCampaignsService.findOneById.mockResolvedValue(campaign);
      mockAgentCampaignsService.patch.mockResolvedValue(updatedCampaign);
      mockAgentStrategiesService.findOneById.mockResolvedValue(strategy);
      mockAgentStrategiesService.toggleActive.mockResolvedValue(undefined);
      mockAgentRunsService.create.mockResolvedValue(run);
      mockAgentRunQueueService.queueRun.mockResolvedValue(undefined);

      const result = await service.execute(campaignId, orgId, userId);

      expect(mockAgentCampaignsService.patch).toHaveBeenCalledWith(campaignId, {
        nextOrchestratedAt: expect.any(Date),
        status: 'active',
      });
      expect(mockAgentRunQueueService.queueRun).toHaveBeenCalledWith(
        expect.objectContaining({
          campaignId,
          organizationId: orgId,
          userId,
        }),
      );
      expect(result).toBe(updatedCampaign);
    });

    it('should activate strategy when it is not active', async () => {
      const campaign = makeCampaign({ status: 'draft' });
      const updatedCampaign = makeCampaign({ status: 'active' });
      const strategy = {
        _id: new Types.ObjectId(),
        agentType: 'research',
        isActive: false,
        label: 'S',
      };
      const run = { _id: new Types.ObjectId() };

      mockAgentCampaignsService.findOneById.mockResolvedValue(campaign);
      mockAgentCampaignsService.patch.mockResolvedValue(updatedCampaign);
      mockAgentStrategiesService.findOneById.mockResolvedValue(strategy);
      mockAgentStrategiesService.toggleActive.mockResolvedValue(undefined);
      mockAgentRunsService.create.mockResolvedValue(run);
      mockAgentRunQueueService.queueRun.mockResolvedValue(undefined);

      await service.execute(campaignId, orgId, userId);

      expect(mockAgentStrategiesService.toggleActive).toHaveBeenCalled();
    });

    it('should skip strategy activation when already active', async () => {
      const campaign = makeCampaign({ status: 'draft' });
      const updatedCampaign = makeCampaign({ status: 'active' });
      const strategy = {
        _id: new Types.ObjectId(),
        agentType: 'research',
        isActive: true,
        label: 'S',
      };
      const run = { _id: new Types.ObjectId() };

      mockAgentCampaignsService.findOneById.mockResolvedValue(campaign);
      mockAgentCampaignsService.patch.mockResolvedValue(updatedCampaign);
      mockAgentStrategiesService.findOneById.mockResolvedValue(strategy);
      mockAgentRunsService.create.mockResolvedValue(run);
      mockAgentRunQueueService.queueRun.mockResolvedValue(undefined);

      await service.execute(campaignId, orgId, userId);

      expect(mockAgentStrategiesService.toggleActive).not.toHaveBeenCalled();
    });

    it('should not create or queue a direct run for orchestrator strategies', async () => {
      const campaign = makeCampaign({ status: 'draft' });
      const updatedCampaign = makeCampaign({ status: 'active' });
      const strategy = {
        _id: new Types.ObjectId(),
        agentType: 'orchestrator',
        isActive: true,
        label: 'Campaign Lead',
      };

      mockAgentCampaignsService.findOneById.mockResolvedValue(campaign);
      mockAgentCampaignsService.patch.mockResolvedValue(updatedCampaign);
      mockAgentStrategiesService.findOneById.mockResolvedValue(strategy);

      await service.execute(campaignId, orgId, userId);

      expect(mockAgentRunsService.create).not.toHaveBeenCalled();
      expect(mockAgentRunQueueService.queueRun).not.toHaveBeenCalled();
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('scheduled campaign orchestration'),
        expect.objectContaining({ campaignId }),
      );
    });
  });

  describe('pause()', () => {
    it('should throw NotFoundException when campaign not found', async () => {
      mockAgentCampaignsService.findOneById.mockResolvedValue(null);

      await expect(service.pause(campaignId, orgId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when campaign is not active', async () => {
      mockAgentCampaignsService.findOneById.mockResolvedValue(
        makeCampaign({ status: 'draft' }),
      );

      await expect(service.pause(campaignId, orgId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should set campaign status to paused and pause strategies', async () => {
      const campaign = makeCampaign({ status: 'active' });
      const updated = makeCampaign({ status: 'paused' });

      mockAgentCampaignsService.findOneById.mockResolvedValue(campaign);
      mockAgentCampaignsService.patch.mockResolvedValue(updated);
      mockAgentStrategiesService.pauseStrategy.mockResolvedValue(undefined);

      const result = await service.pause(campaignId, orgId);

      expect(mockAgentCampaignsService.patch).toHaveBeenCalledWith(campaignId, {
        nextOrchestratedAt: null,
        status: 'paused',
      });
      expect(mockAgentStrategiesService.pauseStrategy).toHaveBeenCalled();
      expect(result).toBe(updated);
    });
  });

  describe('updateCreditsUsed()', () => {
    it('should call patchAll with $inc for creditsUsed', async () => {
      mockAgentCampaignsService.patchAll.mockResolvedValue(undefined);

      await service.updateCreditsUsed(campaignId, 50);

      expect(mockAgentCampaignsService.patchAll).toHaveBeenCalledWith(
        expect.objectContaining({ isDeleted: false }),
        { $inc: { creditsUsed: 50 } },
      );
    });
  });

  describe('checkQuota()', () => {
    it('should return false when campaign not found', async () => {
      mockAgentCampaignsService.findOne.mockResolvedValue(null);

      const result = await service.checkQuota(campaignId);

      expect(result).toBe(false);
    });

    it('should return false when campaign is not active', async () => {
      mockAgentCampaignsService.findOne.mockResolvedValue(
        makeCampaign({ status: 'paused' }),
      );

      const result = await service.checkQuota(campaignId);

      expect(result).toBe(false);
    });

    it('should auto-complete and return true when credits exhausted', async () => {
      mockAgentCampaignsService.findOne.mockResolvedValue(
        makeCampaign({
          creditsAllocated: 100,
          creditsUsed: 100,
          status: 'active',
        }),
      );
      mockAgentCampaignsService.patch.mockResolvedValue(undefined);

      const result = await service.checkQuota(campaignId);

      expect(result).toBe(true);
      expect(mockAgentCampaignsService.patch).toHaveBeenCalledWith(campaignId, {
        nextOrchestratedAt: null,
        status: 'completed',
      });
    });

    it('should return false when credits not exhausted', async () => {
      mockAgentCampaignsService.findOne.mockResolvedValue(
        makeCampaign({
          creditsAllocated: 1000,
          creditsUsed: 100,
          status: 'active',
        }),
      );

      const result = await service.checkQuota(campaignId);

      expect(result).toBe(false);
    });
  });

  describe('getStatus()', () => {
    it('should throw NotFoundException when campaign not found', async () => {
      mockAgentCampaignsService.findOneById.mockResolvedValue(null);

      await expect(service.getStatus(campaignId, orgId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return status with agentsRunning count', async () => {
      const campaign = makeCampaign({ status: 'active' });
      const activeStrategy = { isActive: true };

      mockAgentCampaignsService.findOneById.mockResolvedValue(campaign);
      mockAgentStrategiesService.findOneById.mockResolvedValue(activeStrategy);
      mockAgentRunsService.find.mockResolvedValue([]);

      const result = await service.getStatus(campaignId, orgId);

      expect(result).toMatchObject({
        agentsRunning: 1,
        campaignId,
        contentProduced: 0,
        status: 'active',
      });
    });
  });
});
