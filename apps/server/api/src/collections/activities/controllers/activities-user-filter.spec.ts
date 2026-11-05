import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { ActivitiesController } from '@api/collections/activities/controllers/activities.controller';
import { ActivitiesQueryDto } from '@api/collections/activities/dto/activities-query.dto';
import type { ActivitiesService } from '@api/collections/activities/services/activities.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

const access = vi.hoisted(() => ({ isSuperAdmin: false }));

vi.mock('@api/helpers/utils/auth/auth.util', () => ({
  getIsSuperAdmin: () => access.isSuperAdmin,
}));
vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: (
    _request: unknown,
    _serializer: unknown,
    data: unknown,
  ) => data,
}));

type ActivityRow = { id: string; organizationId: string; userId: string };
type ActivityWhere = { organizationId?: string; userId?: string };

const rows: ActivityRow[] = [
  { id: 'other-user-in-org-2', organizationId: 'org-2', userId: 'user-2' },
  { id: 'third-user-in-org-2', organizationId: 'org-2', userId: 'user-3' },
  { id: 'other-user-in-org-1', organizationId: 'org-1', userId: 'user-2' },
  { id: 'caller-in-org-1', organizationId: 'org-1', userId: 'user-1' },
];

// Behaves like the activities table for the filters this route can set.
const activitiesService = {
  attachOrganizationLabels: async (docs: ActivityRow[]) => docs,
  findAll: async ({ where }: { where: ActivityWhere }) => ({
    docs: rows.filter(
      (row) =>
        (where.organizationId === undefined ||
          row.organizationId === where.organizationId) &&
        (where.userId === undefined || row.userId === where.userId),
    ),
  }),
};

const controller = new ActivitiesController(
  { error: vi.fn(), log: vi.fn() } as unknown as LoggerService,
  activitiesService as unknown as ActivitiesService,
);
const operator = {
  brandId: '',
  id: 'operator',
  organizationId: 'org-operator',
  userId: 'operator',
} as AuthenticatedUser;
const member = {
  brandId: '',
  id: 'user-1',
  organizationId: 'org-1',
  userId: 'user-1',
} as AuthenticatedUser;

function listFor(user: AuthenticatedUser, userId: string) {
  return controller.findAll(
    {} as Request,
    Object.assign(new ActivitiesQueryDto(), { userId }),
    user,
  ) as unknown as Promise<{ docs: ActivityRow[] }>;
}

describe('activities user filter', () => {
  it("lists one user's activities across organizations for an operator", async () => {
    access.isSuperAdmin = true;

    const result = await listFor(operator, 'user-2');

    expect(result.docs.map((row) => row.id)).toEqual([
      'other-user-in-org-2',
      'other-user-in-org-1',
    ]);
  });

  it("keeps a member's list inside their organization", async () => {
    access.isSuperAdmin = false;

    const result = await listFor(member, 'user-2');

    expect(result.docs.map((row) => row.id)).toEqual([
      'other-user-in-org-1',
      'caller-in-org-1',
    ]);
  });
});
