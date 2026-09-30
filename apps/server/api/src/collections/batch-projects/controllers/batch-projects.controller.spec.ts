import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { BatchProjectsController } from '@api/collections/batch-projects/controllers/batch-projects.controller';
import { API_KEY_SCOPES_KEY } from '@api/helpers/guards/api-key/api-key.guard';
import { ApiKeyScope } from '@genfeedai/contracts';
import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';

function apiKeyUser(scopes: ApiKeyScope[]): AuthenticatedUser {
  return {
    id: 'user-1',
    isApiKey: true,
    organizationId: 'org-1',
    scopes,
    userId: 'user-1',
  } as AuthenticatedUser;
}

describe('BatchProjectsController publishing scopes', () => {
  const service = {
    review: vi.fn().mockResolvedValue({ id: 'project-1' }),
    schedule: vi.fn().mockResolvedValue({ failedCount: 0, scheduledCount: 1 }),
  };
  const controller = new BatchProjectsController(
    service as never,
    service as never,
  );
  const request = {} as Request;

  beforeEach(() => vi.clearAllMocks());

  it('declares the publishing scopes the scheduling endpoint needs', () => {
    expect(
      Reflect.getMetadata(
        API_KEY_SCOPES_KEY,
        BatchProjectsController.prototype.schedule,
      ),
    ).toEqual([ApiKeyScope.POSTS_SCHEDULE, ApiKeyScope.POSTS_PUBLISH]);
    expect(
      Reflect.getMetadata(
        API_KEY_SCOPES_KEY,
        BatchProjectsController.prototype.review,
      ),
    ).toEqual([ApiKeyScope.POSTS_APPROVE]);
  });

  it.each([
    'create',
    'update',
    'remove',
    'addItems',
    'updateItem',
    'removeItem',
    'quote',
    'start',
    'retryItem',
  ] as const)('requires a draft write scope to %s', (method) => {
    expect(
      Reflect.getMetadata(
        API_KEY_SCOPES_KEY,
        BatchProjectsController.prototype[method],
      ),
    ).toEqual([ApiKeyScope.POSTS_DRAFT, ApiKeyScope.POSTS_CREATE]);
  });

  it('leaves reads to membership alone', () => {
    for (const method of ['findAll', 'findOne'] as const) {
      expect(
        Reflect.getMetadata(
          API_KEY_SCOPES_KEY,
          BatchProjectsController.prototype[method],
        ),
      ).toBeUndefined();
    }
  });

  it('refuses to schedule for an API key without the schedule scope', async () => {
    await expect(
      controller.schedule(apiKeyUser([ApiKeyScope.POSTS_DRAFT]), 'project-1', {
        targets: [
          {
            credentialId: 'credential-1',
            platform: 'tiktok',
            scheduledDate: '2099-10-01T09:00:00.000Z',
          },
        ],
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(service.schedule).not.toHaveBeenCalled();
  });

  it('treats a destination without a date as publishing now', async () => {
    await expect(
      controller.schedule(
        apiKeyUser([ApiKeyScope.POSTS_SCHEDULE]),
        'project-1',
        { targets: [{ credentialId: 'credential-1', platform: 'tiktok' }] },
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(service.schedule).not.toHaveBeenCalled();
  });

  it('treats a destination date that is already due as publishing now', async () => {
    await expect(
      controller.schedule(
        apiKeyUser([ApiKeyScope.POSTS_SCHEDULE]),
        'project-1',
        {
          targets: [
            {
              credentialId: 'credential-1',
              platform: 'tiktok',
              scheduledDate: '2020-01-01T00:00:00.000Z',
            },
          ],
        },
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(service.schedule).not.toHaveBeenCalled();
  });

  it('schedules for an API key holding the schedule scope', async () => {
    await controller.schedule(
      apiKeyUser([ApiKeyScope.POSTS_SCHEDULE]),
      'project-1',
      {
        targets: [
          {
            credentialId: 'credential-1',
            platform: 'tiktok',
            scheduledDate: '2099-10-01T09:00:00.000Z',
          },
        ],
      },
    );
    expect(service.schedule).toHaveBeenCalledTimes(1);
  });

  it('refuses a review decision from an API key without the approve scope', async () => {
    await expect(
      controller.review(
        request,
        apiKeyUser([ApiKeyScope.POSTS_SCHEDULE]),
        'project-1',
        { decision: 'approved', itemIds: ['item-1'] },
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(service.review).not.toHaveBeenCalled();
  });
});
