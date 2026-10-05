import type { MembersService } from '@api/collections/members/services/members.service';
import { WorkflowMarketplaceController } from '@api/collections/workflows/controllers/workflow-marketplace.controller';
import { MostUsedWorkflowsQueryDto } from '@api/collections/workflows/dto/most-used-workflows-query.dto';
import { FeaturedWorkflowsService } from '@api/collections/workflows/services/featured-workflows.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/workflow-templates';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { tenantReadQuery } from '@api-test/helpers/tenant-read.fixture';
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

  const mockFeaturedWorkflowsService = {
    listFeatured: vi.fn(),
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
        {
          provide: FeaturedWorkflowsService,
          useValue: mockFeaturedWorkflowsService,
        },
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
    it('returns only the sanitized version graph and display fields with pagination', async () => {
      const config = {
        organizationId: 'source-org',
        brandId: 'source-brand',
        userId: 'source-user',
        credentialId: 'source-credential',
        prompt: 'Keep this template prompt',
        email: 'private-report@example.com',
        voiceId: 'private-voice',
        targetVoiceId: 'private-target-voice',
        trendId: 'private-trend',
        presetId: 'private-preset',
        nested: { organizationId: 'nested-source-org' },
      };
      mockWorkflowsService.findAll.mockResolvedValue({
        docs: [
          {
            id: 'marketplace-workflow',
            label: 'Public template',
            description: 'Template description',
            thumbnail: 'thumbnail.png',
            executionCount: 42,
            organizationId: 'source-org',
            userId: 'source-user',
            brandId: 'source-brand',
            config: { isPublic: true, isTemplate: true },
            metadata: { private: 'data' },
            schedule: '* * * * *',
            versionId: 'private-version',
            cloudSync: {},
            trigger: 'private-trigger',
            tasks: [],
            lifecycle: 'published',
            createdAt: new Date('2026-10-01'),
            updatedAt: new Date('2026-10-02'),
            nodes: [
              {
                id: 'stale-node',
                data: { config: { credentialId: 'stale-secret' } },
              },
            ],
            currentVersion: {
              id: 'version-1',
              version: 1,
              inputSchema: [
                {
                  key: 'recipient',
                  label: 'Recipient',
                  type: 'string',
                  required: true,
                  description: 'Report recipient',
                  defaultValue: { email: 'private-default@example.com' },
                  validation: { options: ['private-validation-value'] },
                },
              ],
              graph: {
                nodes: [
                  {
                    id: 'node-1',
                    type: 'genfeedAction',
                    position: { x: 1, y: 2 },
                    data: { label: 'Generate', config },
                  },
                ],
                edges: [],
              },
            },
          },
        ],
        limit: 10,
        page: 2,
        totalDocs: 31,
        totalPages: 4,
      });
      const response = await controller.getMarketplace(
        mockRequest,
        tenantReadQuery(BaseQueryDto, {
          page: 2,
          limit: 10,
        }),
      );
      expect(response.links).toMatchObject({
        pagination: { page: 2, limit: 10, total: 31, pages: 4 },
      });
      expect(response.data).toEqual([
        expect.objectContaining({
          id: 'marketplace-workflow',
          attributes: expect.objectContaining({
            executionCount: 42,
            inputVariables: [
              {
                key: 'recipient',
                label: 'Recipient',
                type: 'string',
                required: true,
                description: 'Report recipient',
              },
            ],
            nodes: [
              {
                id: 'node-1',
                type: 'genfeedAction',
                position: { x: 1, y: 2 },
                data: { label: 'Generate' },
              },
            ],
          }),
        }),
      ]);
      const serialized = JSON.stringify(response);
      for (const source of [
        'source-org',
        'source-user',
        'source-brand',
        'source-credential',
        'stale-secret',
        'private-report@example.com',
        'private-voice',
        'private-target-voice',
        'private-trend',
        'private-preset',
        'nested-source-org',
        'private-default@example.com',
        'private-validation-value',
        'defaultValue',
        'config',
        'Keep this template prompt',
      ]) {
        expect(serialized).not.toContain(source);
      }
      const attributes = response.data[0]?.attributes;
      for (const key of [
        'organizationId',
        'userId',
        'brandId',
        'credentials',
        'config',
        'schedule',
        'metadata',
        'versionId',
        'cloudSync',
        'trigger',
        'tasks',
        'lifecycle',
      ]) {
        expect(attributes).not.toHaveProperty(key);
      }
      expect(config.credentialId).toBe('source-credential');
    });

    it('queries only public templates with a current version', async () => {
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
        currentVersionId: { not: null },
      });
      expect(aggregateArg.where).not.toHaveProperty('isPublic');
      expect(aggregateArg.where).not.toHaveProperty('isTemplate');
    });
  });

  describe('getTemplates', () => {
    it('never ranks code templates: Featured comes from admin pins (#5511)', async () => {
      mockWorkflowsService.getWorkflowTemplates.mockResolvedValue(
        Object.values(WORKFLOW_TEMPLATES),
      );

      const result = await controller.getTemplates();

      expect(
        result.data.filter((template) => 'featuredRank' in template),
      ).toEqual([]);
    });
  });

  describe('getFeatured (#5511)', () => {
    it('returns the pinned workflows in pin order', async () => {
      const featured = [
        { featuredRank: 1, id: 'wf-b', label: 'B' },
        { featuredRank: 2, id: 'wf-a', label: 'A' },
      ];
      mockFeaturedWorkflowsService.listFeatured.mockResolvedValue(featured);

      await expect(controller.getFeatured()).resolves.toEqual({
        data: featured,
      });
    });

    it('returns an empty row when nothing is pinned', async () => {
      mockFeaturedWorkflowsService.listFeatured.mockResolvedValue([]);

      await expect(controller.getFeatured()).resolves.toEqual({ data: [] });
    });

    it('is open to any organization member, like the template catalog', () => {
      expect(
        Reflect.getMetadata(GUARDS_METADATA, controller.getFeatured),
      ).toBeUndefined();
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
