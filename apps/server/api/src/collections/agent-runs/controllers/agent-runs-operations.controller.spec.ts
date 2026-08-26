vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn((_req, _serializer, data) => ({ data })),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AgentRunsOperationsController } from '@api/collections/agent-runs/controllers/agent-runs-operations.controller';
import { AgentRunsOperationsService } from '@api/collections/agent-runs/services/agent-runs-operations.service';
import { testId } from '@helpers/testing/test-id.helper';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import type { Request } from 'express';

describe('AgentRunsOperationsController', () => {
  const brandId = testId('brand');
  const organizationId = testId('org');
  const userId = testId('user');
  const mockUser: User = {
    id: 'user_123',
    brandId,
    organizationId,
    userId,
  };
  const mockRequest = { originalUrl: '/api/runs', query: {} } as Request;
  const operationsService = {
    retryRun: vi.fn(),
  };
  const controller = new AgentRunsOperationsController(
    operationsService as unknown as AgentRunsOperationsService,
  );

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('retains only the retry operation route', () => {
    const handler = AgentRunsOperationsController.prototype.retryRun;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(':id/retries');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata('swagger/apiOperation', handler)).toMatchObject({
      operationId: 'AgentRunsController.retryRun',
    });

    const prototype =
      AgentRunsOperationsController.prototype as unknown as Record<
        string,
        object
      >;
    const paths = Object.getOwnPropertyNames(prototype)
      .filter((name) => name !== 'constructor')
      .map((name) => prototype[name])
      .filter((candidate) => Reflect.hasMetadata(PATH_METADATA, candidate))
      .map((candidate) => Reflect.getMetadata(PATH_METADATA, candidate));

    expect(paths).toEqual([':id/retries']);
  });

  it('allows organization-scoped callers to select a brand', async () => {
    const organizationUser: User = {
      ...mockUser,
      ...mockUser,
      brandId: undefined,
    };
    operationsService.retryRun.mockResolvedValue({ id: 'run1' });

    await controller.retryRun(
      mockRequest,
      'run1',
      organizationUser,
      'selected-brand',
    );

    expect(operationsService.retryRun).toHaveBeenCalledWith('run1', {
      brandId: 'selected-brand',
      organizationId,
      userId,
    });
  });
});
