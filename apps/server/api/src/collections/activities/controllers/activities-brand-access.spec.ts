import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { ActivitiesController } from '@api/collections/activities/controllers/activities.controller';
import { ActivitiesQueryDto } from '@api/collections/activities/dto/activities-query.dto';
import type { ActivitiesService } from '@api/collections/activities/services/activities.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { MemberRole } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  isCloudDeployment: () => true,
}));
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

interface ActivityRow {
  brandId: string | null;
  entityModel: string;
  id: string;
  isDeleted: boolean;
  organizationId: string;
}

type Condition = Record<string, unknown>;

const rows: ActivityRow[] = [
  row('allowed-brand', 'brand-a', 'Post'),
  row('hidden-brand', 'brand-b', 'Post'),
  row('other-hidden-brand', 'brand-c', 'Ingredient'),
  row('credit-ledger', null, 'CreditTransaction'),
  row('org-level', null, 'Organization'),
  { ...row('other-org', 'brand-a', 'Post'), organizationId: 'org-2' },
];

function row(
  id: string,
  brandId: string | null,
  entityModel: string,
): ActivityRow {
  return {
    brandId,
    entityModel,
    id,
    isDeleted: false,
    organizationId: 'org-1',
  };
}

function matches(activity: ActivityRow, condition: Condition): boolean {
  return Object.entries(condition).every(([field, expected]) => {
    if (field === 'OR') {
      return (expected as Condition[]).some((branch) =>
        matches(activity, branch),
      );
    }
    if (field === 'AND') {
      return (expected as Condition[]).every((part) =>
        matches(activity, part),
      );
    }
    const actual = activity[field as keyof ActivityRow];
    if (expected && typeof expected === 'object' && 'in' in expected) {
      return (expected.in as unknown[]).includes(actual);
    }
    return actual === expected;
  });
}

// Behaves like the activities table for the filters this route can set.
const activitiesService = {
  attachDisplayContext: async (docs: ActivityRow[]) => docs,
  collapsePostActivities: async (docs: ActivityRow[]) => docs,
  countUnread: async (where: Condition) =>
    rows.filter((activity) => matches(activity, where)).length,
  findAll: async ({ where }: { where: Condition }) => ({
    docs: rows.filter((activity) => matches(activity, where)),
  }),
};

function accessFor(role: MemberRole, brandIds: string[]): BrandAccessService {
  return new BrandAccessService({
    member: {
      findFirst: vi.fn().mockResolvedValue({
        brands: brandIds.map((id) => ({ id })),
        role: { key: role },
      }),
    },
  } as unknown as PrismaService);
}

function controllerFor(role: MemberRole, brandIds: string[]) {
  return new ActivitiesController(
    { error: vi.fn(), log: vi.fn() } as unknown as LoggerService,
    activitiesService as unknown as ActivitiesService,
    accessFor(role, brandIds),
  );
}

const member = {
  brandId: '',
  id: 'user-1',
  organizationId: 'org-1',
  userId: 'user-1',
} as AuthenticatedUser;

function query(fields: Partial<ActivitiesQueryDto> = {}) {
  return Object.assign(new ActivitiesQueryDto(), fields);
}

async function idsListedFor(
  controller: ActivitiesController,
  user: AuthenticatedUser,
  fields: Partial<ActivitiesQueryDto> = {},
) {
  const result = (await controller.findAll(
    {} as Request,
    query(fields),
    user,
  )) as unknown as { docs: ActivityRow[] };
  return result.docs.map((activity) => activity.id);
}

describe('activity feed brand access', () => {
  beforeEach(() => vi.clearAllMocks());

  it('hides activity from brands a restricted member cannot access in the organization feed', async () => {
    const controller = controllerFor(MemberRole.MEMBER, ['brand-a']);

    expect(await idsListedFor(controller, member)).toEqual([
      'allowed-brand',
      'credit-ledger',
      'org-level',
    ]);
  });

  it('returns no activity from a brand the member cannot access when they ask for it by id', async () => {
    const controller = controllerFor(MemberRole.MEMBER, ['brand-a']);

    expect(
      await idsListedFor(controller, member, { brandId: 'brand-b' }),
    ).toEqual(['credit-ledger']);
  });

  it('does not let a stale active brand widen a restricted member to a brand they lost', async () => {
    const controller = controllerFor(MemberRole.MEMBER, ['brand-a']);

    expect(
      await idsListedFor(controller, { ...member, brandId: 'brand-b' }),
    ).toEqual(['credit-ledger']);
  });

  it('shows a brand the member can access when they ask for it by id', async () => {
    const controller = controllerFor(MemberRole.MEMBER, ['brand-a']);

    expect(
      await idsListedFor(controller, member, { brandId: 'brand-a' }),
    ).toEqual(['allowed-brand', 'credit-ledger']);
  });

  it('counts unread activity only inside the brands the member can access', async () => {
    const controller = controllerFor(MemberRole.MEMBER, ['brand-a']);

    const result = await controller.unreadCount({} as Request, query(), member);

    expect(result.unreadCount).toBe(3);
  });

  it('keeps every brand in the organization visible to an organization admin', async () => {
    const controller = controllerFor(MemberRole.ADMIN, []);

    expect(await idsListedFor(controller, member)).toEqual([
      'allowed-brand',
      'hidden-brand',
      'other-hidden-brand',
      'credit-ledger',
      'org-level',
    ]);
  });
});
