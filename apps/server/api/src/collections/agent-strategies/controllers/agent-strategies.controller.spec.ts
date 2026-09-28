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
