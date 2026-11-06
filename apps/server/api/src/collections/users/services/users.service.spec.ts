// UsersService.findAll's select-projection logic doesn't read getModelMeta's
// field/enum contents for these assertions — only PrismaClient is exercised.
// Real, schema-derived getModelMeta/PRISMA_MODEL_METADATA.User via the light
// @genfeedai/prisma/testing subpath replaces the placeholder above.
vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import {
  SIGNUP_ATTRIBUTION_WINDOW_MS,
  UsersService,
} from '@api/collections/users/services/users.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';

interface UserRow {
  createdAt: Date;
  firstName?: string;
  handle?: string;
  id: string;
  isDeleted: boolean;
  isOnboardingCompleted?: boolean;
  lastName?: string;
  name?: string;
  onboardingCompletedAt?: Date | null;
  onboardingStartedAt?: Date | null;
  onboardingStepsCompleted?: string[];
  onboardingType?: string | null;
  timezone?: string;
}

const matches = (row: object, where: Record<string, unknown>) =>
  Object.entries(where).every(
    ([key, value]) => (row as Record<string, unknown>)[key] === value,
  );

describe('UsersService', () => {
  let users: UserRow[];
  let attributions: Record<string, unknown>[];
  /** The `findMany` arguments the user list sent to the database. */
  let listQueries: Record<string, unknown>[];
  let takenHandles: string[];
  let service: UsersService;

  beforeEach(() => {
    users = [{ createdAt: new Date(), id: 'user_1', isDeleted: false }];
    attributions = [];
    listQueries = [];
    takenHandles = [];

    const user = {
      count: async () => users.length,
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        users.find((row) => matches(row, where)) ?? null,
      findMany: async (args: Record<string, unknown>) => {
        listQueries.push(args);
        return users.map(({ id }) => ({ id }));
      },
      update: async ({
        data,
        where,
      }: {
        data: Partial<UserRow>;
        where: Record<string, unknown>;
      }) => {
        if (data.handle && takenHandles.includes(data.handle)) {
          throw { code: 'P2002' };
        }
        const row = users.find((item) => matches(item, where));
        if (!row) throw new Error('Record to update not found.');
        Object.assign(row, data);
        return { ...row };
      },
    };
    // One attribution per user (unique userId), as the table enforces.
    const userSignupAttribution = {
      createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
        const fresh = data.filter(
          (row) => !attributions.some((item) => item.userId === row.userId),
        );
        attributions.push(...fresh);
        return { count: fresh.length };
      },
    };

    service = new UsersService(
      { user, userSignupAttribution } as unknown as PrismaService,
      {
        debug: () => undefined,
        error: () => undefined,
        log: () => undefined,
        warn: () => undefined,
      } as unknown as LoggerService,
    );
  });

  it('uses an explicit user-list projection with platformRole instead of the removed isSuperAdmin field', async () => {
    await service.findAll({ where: {} }, { page: 1, limit: 20 });

    const [{ select }] = listQueries;
    expect(select).toMatchObject({ platformRole: true, settings: true });
    expect(select).not.toHaveProperty('isSuperAdmin');
    // Column dropped in migration 20260726213000 / #2110. Re-adding it here
    // resurrects Sentry API-GENFEED-AI-65 on any environment that already ran
    // the drop migration (#2185).
    expect(select).not.toHaveProperty('authProviderId');
  });

  it('returns the identity and activity fields required by the admin user list', async () => {
    await service.findAll({ where: {} }, { page: 1, limit: 20 });

    expect(listQueries[0].select).toMatchObject({
      createdAt: true,
      lastActiveAt: true,
      name: true,
    });
  });

  it('preserves an explicit caller select', async () => {
    await service.findAll(
      { select: { id: true }, where: {} },
      { page: 1, limit: 20 },
    );

    expect(listQueries[0].select).toEqual({ id: true });
  });

  it('converts caller include options into the safe user-list select', async () => {
    await service.findAll(
      { include: { members: true }, where: {} },
      { page: 1, limit: 20 },
    );

    expect(listQueries[0].select).toMatchObject({
      members: true,
      platformRole: true,
      settings: true,
    });
    expect(listQueries[0]).not.toHaveProperty('include');
  });

  describe('recordSignupAttribution', () => {
    it('records the first-touch source once for a new account', async () => {
      await expect(
        service.recordSignupAttribution('user_1', {
          landingPath: '/studio',
          referrerDomain: 'chatgpt.com',
        }),
      ).resolves.toBe(true);

      expect(attributions).toEqual([
        {
          landingPath: '/studio',
          referrerDomain: 'chatgpt.com',
          userId: 'user_1',
          utmCampaign: undefined,
          utmContent: undefined,
          utmMedium: undefined,
          utmSource: undefined,
        },
      ]);
    });

    it('keeps the existing record when attribution is posted again', async () => {
      await service.recordSignupAttribution('user_1', { utmSource: 'chatgpt' });

      await expect(
        service.recordSignupAttribution('user_1', { utmSource: 'google' }),
      ).resolves.toBe(false);
      expect(attributions).toEqual([
        expect.objectContaining({ utmSource: 'chatgpt' }),
      ]);
    });

    it('ignores accounts older than the attribution window', async () => {
      users[0].createdAt = new Date(
        Date.now() - SIGNUP_ATTRIBUTION_WINDOW_MS - 1,
      );

      await expect(
        service.recordSignupAttribution('user_1', { utmSource: 'google' }),
      ).resolves.toBe(false);
      expect(attributions).toEqual([]);
    });

    it('ignores a deleted account', async () => {
      users[0].isDeleted = true;

      await expect(
        service.recordSignupAttribution('user_1', { utmSource: 'google' }),
      ).resolves.toBe(false);
      expect(attributions).toEqual([]);
    });
  });

  it('resets all onboarding progress, leaving unrelated account fields alone', async () => {
    users = [
      {
        createdAt: new Date(),
        firstName: 'Jane',
        id: 'opaque-user',
        isDeleted: false,
        isOnboardingCompleted: true,
        onboardingCompletedAt: new Date(),
        onboardingStartedAt: new Date(),
        onboardingStepsCompleted: ['brand', 'voice'],
        onboardingType: 'expert',
        timezone: 'Europe/Paris',
      },
    ];

    await service.resetOnboarding('opaque-user');

    expect(users[0]).toMatchObject({
      firstName: 'Jane',
      isOnboardingCompleted: false,
      onboardingCompletedAt: null,
      onboardingStartedAt: null,
      onboardingStepsCompleted: [],
      onboardingType: null,
      timezone: 'Europe/Paris',
    });
  });

  it('keeps the authentication display name in sync with edited profile names', async () => {
    users = [{ createdAt: new Date(), id: 'opaque-user', isDeleted: false }];

    await service.updateAdminProfile('opaque-user', {
      firstName: ' Jane ',
      lastName: ' Example ',
      handle: ' jane ',
    });

    expect(users[0]).toMatchObject({
      firstName: 'Jane',
      handle: 'jane',
      lastName: 'Example',
      name: 'Jane Example',
    });
  });

  it('reports a duplicate handle as a conflict and leaves the profile unchanged', async () => {
    users = [
      {
        createdAt: new Date(),
        handle: 'jane',
        id: 'opaque-user',
        isDeleted: false,
      },
    ];
    takenHandles = ['taken'];

    await expect(
      service.updateAdminProfile('opaque-user', {
        firstName: '',
        lastName: '',
        handle: 'taken',
      }),
    ).rejects.toThrow('This handle is already in use.');
    expect(users[0].handle).toBe('jane');
  });
});
