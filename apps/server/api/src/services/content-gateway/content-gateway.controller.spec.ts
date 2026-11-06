import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ContentGatewayController } from '@api/services/content-gateway/content-gateway.controller';
import type { ContentGatewayService } from '@api/services/content-gateway/content-gateway.service';
import { testId } from '@helpers/testing/test-id.helper';
import type { Request } from 'express';

const organizationId = testId('org');
const userId = testId('user');

type GatewayResult = { executions: string[]; posts: Record<string, unknown>[] };

/**
 * The content gateway, recording each routed signal and manual skill run with
 * the tenant it ran for and answering with `result`.
 */
function buildController(
  result: GatewayResult = { executions: ['execution-1'], posts: [] },
) {
  const signals: unknown[] = [];
  const manualRuns: unknown[][] = [];
  const gateway = {
    processManualRequest: async (...args: unknown[]) => {
      manualRuns.push(args);
      return result;
    },
    routeSignal: async (signal: unknown) => {
      signals.push(signal);
      return result;
    },
  };
  return {
    controller: new ContentGatewayController(
      gateway as unknown as ContentGatewayService,
    ),
    manualRuns,
    signals,
  };
}

describe('ContentGatewayController', () => {
  const mockUser = {
    id: 'user_123',
    organizationId,
    userId,
  } as unknown as User;
  const mockRequest = { originalUrl: '/content-gateway/signal' } as Request;

  it('routes a signal for the caller organization with its payload', async () => {
    const { controller, signals } = buildController();
    const payload = { skillSlugs: ['video-gen', 'thumbnail'] };

    const result = await controller.routeSignal(mockRequest, mockUser, {
      brandId: 'brand-1',
      payload,
      type: 'cron',
    });

    expect(result.executions).toEqual(['execution-1']);
    expect(signals).toEqual([
      expect.objectContaining({
        brandId: 'brand-1',
        organizationId,
        payload,
        type: 'cron',
      }),
    ]);
  });

  it('runs a manual skill for the caller organization and user with its params', async () => {
    const { controller, manualRuns } = buildController();
    const params = { format: 'reel', tone: 'casual' };

    await controller.executeSkill(mockRequest, mockUser, {
      brandId: 'brand-5',
      params,
      skillSlug: 'video-gen',
    });

    expect(manualRuns).toEqual([
      [organizationId, 'brand-5', 'video-gen', params, userId],
    ]);
  });

  it('serializes posts before returning the gateway response', async () => {
    const { controller } = buildController({
      executions: ['execution-1'],
      posts: [
        {
          description: 'Safe response',
          id: 'post-1',
          targetSettings: { internal: true },
        },
      ],
    });

    const result = await controller.routeSignal(mockRequest, mockUser, {
      brandId: 'brand-1',
      payload: {},
      type: 'manual',
    });

    expect(result.posts.data[0]).toMatchObject({
      attributes: { description: 'Safe response' },
      id: 'post-1',
      type: 'post',
    });
    expect(result.posts.data[0]).toHaveProperty(
      'attributes.targetSettings',
      undefined,
    );
  });
});
