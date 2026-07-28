vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn((_req, _serializer, data) => ({ data })),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AgentRunsOperationsController } from '@api/collections/agent-runs/controllers/agent-runs-operations.controller';
import { AgentRunsOperationsService } from '@api/collections/agent-runs/services/agent-runs-operations.service';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import type { Request } from 'express';

describe('AgentRunsOperationsController', () => {
  const mockUser: User = {
    id: 'user_123',
    publicMetadata: {
      brand: '507f1f77bcf86cd799439013',
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439014',
    },
  };
  const mockRequest = { originalUrl: '/api/runs', query: {} } as Request;
  const operationsService = {
    cancelRun: vi.fn(),
    retryRun: vi.fn(),
  };
  const controller = new AgentRunsOperationsController(
    operationsService as unknown as AgentRunsOperationsService,
  );

  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    [
      'cancelRun',
      AgentRunsOperationsController.prototype.cancelRun,
      ':id/cancellations',
      'AgentRunsController.cancelRun',
    ],
    [
      'retryRun',
      AgentRunsOperationsController.prototype.retryRun,
      ':id/retries',
      'AgentRunsController.retryRun',
    ],
  ])('preserves route and operation metadata for %s', (_name, handler, path, operationId) => {
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata('swagger/apiOperation', handler)).toMatchObject({
      operationId,
    });
  });

  it('delegates cancellation with authenticated scope', async () => {
    const run = { id: 'run1', status: 'cancelled' };
    operationsService.cancelRun.mockResolvedValue(run);

    await expect(
      controller.cancelRun(mockRequest, 'run1', mockUser),
    ).resolves.toEqual({ data: run });
    expect(operationsService.cancelRun).toHaveBeenCalledWith('run1', {
      brandId: '507f1f77bcf86cd799439013',
      organizationId: '507f1f77bcf86cd799439012',
      userId: '507f1f77bcf86cd799439014',
    });
  });

  it('allows organization-scoped callers to select a brand', async () => {
    const organizationUser: User = {
      ...mockUser,
      publicMetadata: { ...mockUser.publicMetadata, brand: undefined },
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
      organizationId: '507f1f77bcf86cd799439012',
      userId: '507f1f77bcf86cd799439014',
    });
  });
});
