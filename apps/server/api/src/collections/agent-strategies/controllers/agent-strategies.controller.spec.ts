import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { FeatureFlagGuard } from '@api/feature-flag/feature-flag.guard';
import {
  DEFAULT_PLATFORM_FEATURE_SETTINGS,
  DEFAULT_PLATFORM_FLAGS,
} from '@genfeedai/contracts/constants';
import { Reflector } from '@nestjs/core';
import { AgentStrategiesController } from './agent-strategies.controller';

describe('AgentStrategiesController', () => {
  it('scopes a brand-filtered roster to both organization and brand', () => {
    const controller = new AgentStrategiesController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const query = controller.buildFindAllQuery(
      { organizationId: 'org-1' } as AuthenticatedUser,
      {
        brandId: 'brand-1',
        isDeleted: false,
        limit: 10,
        page: 1,
        sort: 'createdAt: -1',
      },
    );

    expect(query.where).toMatchObject({
      brandId: 'brand-1',
      isDeleted: false,
      organizationId: 'org-1',
    });
  });

  it('coerces query-string isActive into a Prisma boolean', () => {
    const controller = new AgentStrategiesController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const query = controller.buildFindAllQuery(
      { organizationId: 'org-1' } as AuthenticatedUser,
      {
        brandId: 'brand-1',
        isActive: 'true',
        isDeleted: false,
        limit: 10,
        page: 1,
        sort: 'createdAt: -1',
      } as never,
    );

    expect(query.where).toMatchObject({
      brandId: 'brand-1',
      isActive: true,
      organizationId: 'org-1',
    });
    expect(query.where?.isActive).toBe(true);
  });

  it('pages the report history and emits pagination links', async () => {
    const listByStrategy = vi.fn().mockResolvedValue({
      docs: [{ id: 'report-21' }],
      hasNextPage: false,
      hasPrevPage: true,
      limit: 20,
      nextPage: null,
      page: 2,
      pagingCounter: 21,
      prevPage: 1,
      totalDocs: 21,
      totalPages: 2,
    });
    const controller = new AgentStrategiesController(
      {} as never,
      {} as never,
      { listByStrategy } as never,
      {} as never,
      {} as never,
    );

    const result = await controller.listReports(
      'strategy-1',
      { organizationId: 'org-1' } as AuthenticatedUser,
      { limit: 20, page: 2 },
    );

    expect(listByStrategy).toHaveBeenCalledWith('strategy-1', 'org-1', {
      limit: 20,
      page: 2,
    });
    expect(result.data).toEqual([{ id: 'report-21' }]);
    expect(result.links.pagination).toMatchObject({
      limit: 20,
      page: 2,
      pages: 2,
      total: 21,
    });
  });

  it('serializes one page of opportunities with pagination links', async () => {
    const listStrategyOpportunities = vi.fn().mockResolvedValue({
      docs: [
        {
          createdAt: new Date('2026-01-01T00:00:00Z'),
          id: 'opportunity-16',
          organizationId: 'org-1',
          priorityScore: 42,
          sourceType: 'trend',
          status: 'queued',
          strategyId: 'strategy-1',
          topic: 'AI hooks',
          updatedAt: new Date('2026-01-01T00:00:00Z'),
        },
      ],
      hasNextPage: true,
      hasPrevPage: true,
      limit: 15,
      nextPage: 3,
      page: 2,
      pagingCounter: 16,
      prevPage: 1,
      totalDocs: 40,
      totalPages: 3,
    });
    const controller = new AgentStrategiesController(
      {} as never,
      { listStrategyOpportunities } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const query = { limit: 15, page: 2 };

    const result = await controller.listOpportunities(
      {
        originalUrl: '/agent-strategies/strategy-1/opportunities?page=2',
      } as never,
      'strategy-1',
      { organizationId: 'org-1' } as AuthenticatedUser,
      query,
    );

    expect(listStrategyOpportunities).toHaveBeenCalledWith(
      'strategy-1',
      'org-1',
      query,
    );
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      attributes: { priorityScore: 42, topic: 'AI hooks' },
      id: 'opportunity-16',
      type: 'agent-strategy-opportunity',
    });
    const links = result.links as { pagination?: Record<string, unknown> };
    expect(links.pagination).toMatchObject({
      limit: 15,
      page: 2,
      pages: 3,
      total: 40,
    });
  });

  it('fails closed when the authenticated organization is missing', () => {
    const controller = new AgentStrategiesController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    expect(() =>
      controller.buildFindAllQuery({} as AuthenticatedUser, {
        brandId: 'brand-1',
        isDeleted: false,
        limit: 10,
        page: 1,
        sort: 'createdAt: -1',
      }),
    ).toThrow('Organization not found');
  });

  it('lets a superadmin list another organization for the admin Agents page', () => {
    const controller = new AgentStrategiesController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const query = controller.buildFindAllQuery(
      { isSuperAdmin: true, organizationId: 'org-1' } as AuthenticatedUser,
      {
        brandId: 'brand-2',
        isDeleted: false,
        limit: 10,
        organizationId: 'org-2',
        page: 1,
        sort: 'createdAt: -1',
      },
    );

    expect(query.where).toMatchObject({
      brandId: 'brand-2',
      organizationId: 'org-2',
    });
  });

  it('refuses a member naming another organization', () => {
    const controller = new AgentStrategiesController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    expect(() =>
      controller.buildFindAllQuery(
        { organizationId: 'org-1' } as AuthenticatedUser,
        {
          isDeleted: false,
          limit: 10,
          organizationId: 'org-2',
          page: 1,
          sort: 'createdAt: -1',
        },
      ),
    ).toThrow();
  });
});

describe('AgentStrategiesController module ownership', () => {
  it('keeps Automation agents available when chat is disabled', async () => {
    const guard = new FeatureFlagGuard(new Reflector(), {
      getFeatureSettings: async () => ({
        ...DEFAULT_PLATFORM_FEATURE_SETTINGS,
        flags: { ...DEFAULT_PLATFORM_FLAGS, agent: false, automation: true },
      }),
    } as never);
    const context = {
      getClass: () => AgentStrategiesController,
      getHandler: () => AgentStrategiesController.prototype.buildFindAllQuery,
      switchToHttp: () => ({ getRequest: () => ({}) }),
    };
    await expect(guard.canActivate(context as never)).resolves.toBe(true);
  });

  it('blocks the roster when Automation is disabled even with chat enabled', async () => {
    const guard = new FeatureFlagGuard(new Reflector(), {
      getFeatureSettings: async () => ({
        ...DEFAULT_PLATFORM_FEATURE_SETTINGS,
        flags: { ...DEFAULT_PLATFORM_FLAGS, agent: true, automation: false },
      }),
    } as never);
    const context = {
      getClass: () => AgentStrategiesController,
      getHandler: () => AgentStrategiesController.prototype.buildFindAllQuery,
      switchToHttp: () => ({ getRequest: () => ({}) }),
    };
    await expect(guard.canActivate(context as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
