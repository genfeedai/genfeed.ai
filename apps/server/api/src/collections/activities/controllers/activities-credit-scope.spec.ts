import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { ActivitiesController } from '@api/collections/activities/controllers/activities.controller';
import { ActivitiesQueryDto } from '@api/collections/activities/dto/activities-query.dto';
import type { ActivitiesService } from '@api/collections/activities/services/activities.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/utils/auth/auth.util', () => ({
  getIsSuperAdmin: () => false,
}));
vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: (
    _request: unknown,
    _serializer: unknown,
    data: unknown,
  ) => data,
}));

const findAll = vi.fn().mockResolvedValue({ data: [] });
const controller = new ActivitiesController(
  { log: vi.fn(), error: vi.fn() } as unknown as LoggerService,
  { findAll } as unknown as ActivitiesService,
);
const user = {
  id: 'user-1',
  userId: 'user-1',
  organizationId: 'org-1',
  brandId: 'brand-1',
} as AuthenticatedUser;

describe('credit activity tenant scope', () => {
  beforeEach(() => vi.clearAllMocks());

  it('includes organization-wide ledger activity in a brand feed without including other brands', async () => {
    await controller.findAll(
      {} as Request,
      Object.assign(new ActivitiesQueryDto(), { brandId: 'brand-1' }),
      user,
    );
    expect(findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isDeleted: false,
          organizationId: 'org-1',
          OR: [
            { brandId: 'brand-1' },
            { brandId: null, entityModel: 'CreditTransaction' },
          ],
        },
      }),
      expect.anything(),
    );
  });

  it('applies the same boundary to the implicit active-brand feed', async () => {
    await controller.findAll({} as Request, new ActivitiesQueryDto(), user);
    expect(findAll.mock.calls[0][0].where).toEqual({
      isDeleted: false,
      organizationId: 'org-1',
      OR: [
        { brandId: 'brand-1' },
        { brandId: null, entityModel: 'CreditTransaction' },
      ],
    });
  });

  it('keeps organization feeds inside the active organization, even for the same actor', async () => {
    await controller.findAll({} as Request, new ActivitiesQueryDto(), {
      ...user,
      brandId: '',
    });
    expect(findAll.mock.calls[0][0].where).toEqual({
      isDeleted: false,
      organizationId: 'org-1',
    });
  });

  it('rejects a foreign organization filter', async () => {
    await expect(
      controller.findAll(
        {} as Request,
        Object.assign(new ActivitiesQueryDto(), { organizationId: 'org-2' }),
        user,
      ),
    ).rejects.toThrow();
    expect(findAll).not.toHaveBeenCalled();
  });
});
