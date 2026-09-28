import type { MembersService } from '@api/collections/members/services/members.service';
import { WorkflowMarketplaceController } from '@api/collections/workflows/controllers/workflow-marketplace.controller';
import { MostUsedWorkflowsQueryDto } from '@api/collections/workflows/dto/most-used-workflows-query.dto';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import {
  SHOWCASE_WORKFLOW_TEMPLATE_IDS,
  WORKFLOW_TEMPLATES,
} from '@api/collections/workflows/templates/workflow-templates';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { MemberRole } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { Request } from 'express';

describe('WorkflowMarketplaceController', () => {
  let controller: WorkflowMarketplaceController;
  let service: WorkflowsService;

  const mockRequest = {} as Request;

  const mockWorkflowsService = {
    findAll: vi.fn(),
    findMostUsed: vi.fn(),
    getWorkflowTemplates: vi.fn(),
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkflowMarketplaceController],
      providers: [
        { provide: WorkflowsService, useValue: mockWorkflowsService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<WorkflowMarketplaceController>(
      WorkflowMarketplaceController,
    );
    service = module.get<WorkflowsService>(WorkflowsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getTemplates', () => {
    it('should return workflow templates', async () => {
      const templates = [
        { name: 'Social Media Automation', steps: [] },
        {
          name: 'Daily Trend Loop',
          routine: {
            kind: 'productized-daily-routine',
            trackingTasks: [{ key: 'review-trend-brief' }],
          },
          steps: [],
        },
      ];

      mockWorkflowsService.getWorkflowTemplates.mockResolvedValue(templates);

      const result = await controller.getTemplates();

      expect(service.getWorkflowTemplates).toHaveBeenCalled();
      expect(result.data).toEqual(templates);
      expect(result.data[1]).toMatchObject({
        name: 'Daily Trend Loop',
        routine: {
          kind: 'productized-daily-routine',
          trackingTasks: [{ key: 'review-trend-brief' }],
        },
      });
    });
  });

  describe('getMarketplace', () => {
    it('should return public template workflows', async () => {
      mockWorkflowsService.findAll.mockResolvedValue({
        docs: [],
        totalDocs: 0,
      });

      await controller.getMarketplace(mockRequest, {});

      expect(mockWorkflowsService.findAll).toHaveBeenCalled();
      const [aggregateArg] =
        mockWorkflowsService.findAll.mock.calls[
          mockWorkflowsService.findAll.mock.calls.length - 1
        ];
      expect(aggregateArg.where).toEqual({
        AND: [
          { config: { equals: true, path: ['isPublic'] } },
          { config: { equals: true, path: ['isTemplate'] } },
        ],
        isDeleted: false,
      });
      expect(aggregateArg.where).not.toHaveProperty('isPublic');
      expect(aggregateArg.where).not.toHaveProperty('isTemplate');
    });
  });

  describe('getTemplates showcase ranking', () => {
    it('passes featuredRank through for the curated showcase only', async () => {
      mockWorkflowsService.getWorkflowTemplates.mockResolvedValue(
        Object.values(WORKFLOW_TEMPLATES),
      );

      const result = await controller.getTemplates();
      const ranked = result.data
        .filter((template) => template.featuredRank !== undefined)
        .sort(
          (left, right) => (left.featuredRank ?? 0) - (right.featuredRank ?? 0),
        );

      expect(ranked.map((template) => template.id)).toEqual([
        ...SHOWCASE_WORKFLOW_TEMPLATE_IDS,
      ]);
      expect(ranked.map((template) => template.featuredRank)).toEqual(
        SHOWCASE_WORKFLOW_TEMPLATE_IDS.map((_, index) => index + 1),
      );
    });
  });

  describe('getMostUsed', () => {
    const user = { organizationId: 'org-1', userId: 'user-1' } as never;

    it('reads the caller organization with the requested limit', async () => {
      mockWorkflowsService.findMostUsed.mockResolvedValue([]);

      const result = await controller.getMostUsed(mockRequest, user, {
        limit: 3,
      });

      expect(mockWorkflowsService.findMostUsed).toHaveBeenCalledWith(
        'org-1',
        3,
      );
      expect(result.data).toEqual([]);
    });

    it('serializes usage fields alongside the workflow summary', async () => {
      mockWorkflowsService.findMostUsed.mockResolvedValue([
        {
          edges: [],
          executionCount: 42,
          id: 'workflow-1',
          isScheduleEnabled: false,
          label: 'Weekly recap',
          lastExecutedAt: new Date('2026-09-20T10:00:00.000Z'),
          nodes: [],
          organizationId: 'org-1',
        },
      ]);

      const result = await controller.getMostUsed(mockRequest, user, {
        limit: 5,
      });

      expect(result.data).toEqual([
        expect.objectContaining({
          attributes: expect.objectContaining({
            executionCount: 42,
            label: 'Weekly recap',
            lastExecutedAt: new Date('2026-09-20T10:00:00.000Z'),
          }),
          id: 'workflow-1',
          type: 'workflow',
        }),
      ]);
    });

    it('rejects a limit above 12', async () => {
      const dto = plainToInstance(MostUsedWorkflowsQueryDto, { limit: '13' });
      const errors = await validate(dto);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.constraints).toHaveProperty('max');
    });

    describe('membership guard', () => {
      const organizationId = testId('org');
      const userId = testId('user');
      const mockMembersService = { findOne: vi.fn() };

      const createMostUsedContext = (): ExecutionContext =>
        ({
          getClass: () => WorkflowMarketplaceController,
          getHandler: () => WorkflowMarketplaceController.prototype.getMostUsed,
          switchToHttp: () => ({
            getRequest: () => ({
              body: {},
              params: {},
              user: { id: userId, organizationId, userId },
            }),
          }),
        }) as unknown as ExecutionContext;

      /** The guard the route declares, wired to the members mock. */
      function createMostUsedGuard(): CanActivate {
        expect(
          Reflect.getMetadata(
            GUARDS_METADATA,
            WorkflowMarketplaceController.prototype.getMostUsed,
          ),
        ).toEqual([RolesGuard]);
        return new RolesGuard(
          new Reflector(),
          mockMembersService as unknown as MembersService,
        );
      }

      beforeEach(() => {
        mockMembersService.findOne.mockReset();
      });

      it('rejects a caller without an active membership of the organization', async () => {
        // A deactivated member's unrevoked API key still authenticates, but
        // no active membership row matches.
        mockMembersService.findOne.mockResolvedValue(null);

        let thrownError: unknown;
        try {
          await createMostUsedGuard().canActivate(createMostUsedContext());
        } catch (error: unknown) {
          thrownError = error;
        }

        expect(thrownError).toBeInstanceOf(HttpException);
        expect((thrownError as HttpException).getStatus()).toBe(
          HttpStatus.FORBIDDEN,
        );
        expect(mockMembersService.findOne).toHaveBeenCalledWith(
          expect.objectContaining({
            isActive: true,
            isDeleted: false,
            organizationId,
            userId,
          }),
          expect.anything(),
        );
      });

      it('admits an active member of the organization', async () => {
        mockMembersService.findOne.mockResolvedValue({
          id: testId('member'),
          role: { id: testId('role'), key: MemberRole.CREATOR },
        });

        await expect(
          createMostUsedGuard().canActivate(createMostUsedContext()),
        ).resolves.toBe(true);
      });
    });

    it('defaults the limit to 5 and accepts 12', async () => {
      const defaulted = plainToInstance(MostUsedWorkflowsQueryDto, {});
      const capped = plainToInstance(MostUsedWorkflowsQueryDto, {
        limit: '12',
      });

      expect(defaulted.limit).toBe(5);
      expect(await validate(defaulted)).toEqual([]);
      expect(capped.limit).toBe(12);
      expect(await validate(capped)).toEqual([]);
    });
  });
});
