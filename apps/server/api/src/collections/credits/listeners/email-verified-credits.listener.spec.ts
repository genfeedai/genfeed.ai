import { EmailVerifiedCreditsListener } from '@api/collections/credits/listeners/email-verified-credits.listener';
import type { OnboardingCreditGrantsService } from '@api/collections/credits/services/onboarding-credit-grants.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';

interface OrganizationRow {
  createdAt: string;
  id: string;
  isDeleted: boolean;
  isProactiveOnboarding: boolean;
  userId: string;
}

interface Gift {
  ipAddress?: string;
  organizationId: string;
  userId: string;
}

/**
 * The listener against an in-memory organizations table and a gift ledger:
 * `gifts` is what the signup-gift grant received, `warnings` what was logged.
 */
function listenerWith(
  organizations: OrganizationRow[],
  options: { isDatabaseDown?: boolean; isLedgerDown?: boolean } = {},
) {
  const gifts: Gift[] = [];
  const warnings: string[] = [];
  const prisma = {
    organization: {
      findFirst: async ({
        where,
      }: {
        where: Pick<
          OrganizationRow,
          'isDeleted' | 'isProactiveOnboarding' | 'userId'
        >;
      }) => {
        if (options.isDatabaseDown) {
          throw new Error('database unavailable');
        }
        const owned = organizations
          .filter(
            (row) =>
              row.userId === where.userId &&
              row.isDeleted === where.isDeleted &&
              row.isProactiveOnboarding === where.isProactiveOnboarding,
          )
          .sort((left, right) =>
            left.createdAt.localeCompare(right.createdAt),
          );
        return owned[0] ? { id: owned[0].id } : null;
      },
    },
  };
  const grants = {
    grantSignupGift: async (
      organizationId: string,
      userId: string,
      { ipAddress }: { ipAddress?: string },
    ) => {
      if (options.isLedgerDown) {
        throw new Error('ledger down');
      }
      gifts.push({ ipAddress, organizationId, userId });
    },
  };
  const logger = {
    warn: (message: string) => {
      warnings.push(message);
    },
  };
  const listener = new EmailVerifiedCreditsListener(
    prisma as unknown as PrismaService,
    grants as unknown as OnboardingCreditGrantsService,
    logger as unknown as LoggerService,
  );
  return { gifts, listener, warnings };
}

function ownedBy(
  userId: string,
  overrides: Partial<OrganizationRow> = {},
): OrganizationRow {
  return {
    createdAt: '2026-10-01T00:00:00.000Z',
    id: 'org-1',
    isDeleted: false,
    isProactiveOnboarding: false,
    userId,
    ...overrides,
  };
}

describe('EmailVerifiedCreditsListener', () => {
  it('releases the signup gift once the mailbox is verified', async () => {
    const { gifts, listener } = listenerWith([ownedBy('user-1')]);

    await listener.handleEmailVerified({
      ipAddress: '198.51.100.9',
      userId: 'user-1',
    });

    expect(gifts).toEqual([
      {
        ipAddress: '198.51.100.9',
        organizationId: 'org-1',
        userId: 'user-1',
      },
    ]);
  });

  it('retries the signup gift after a session is persisted without accepting a request IP', async () => {
    const { gifts, listener } = listenerWith([ownedBy('user-1')]);

    await listener.handleSessionCreated({ userId: 'user-1' });

    expect(gifts).toEqual([
      { ipAddress: undefined, organizationId: 'org-1', userId: 'user-1' },
    ]);
  });

  it("credits the user's first live organization, not a deleted or proactive one", async () => {
    const { gifts, listener } = listenerWith([
      ownedBy('user-1', {
        createdAt: '2026-09-01T00:00:00.000Z',
        id: 'org-deleted',
        isDeleted: true,
      }),
      ownedBy('user-1', {
        createdAt: '2026-09-02T00:00:00.000Z',
        id: 'org-proactive',
        isProactiveOnboarding: true,
      }),
      ownedBy('user-1', {
        createdAt: '2026-10-02T00:00:00.000Z',
        id: 'org-later',
      }),
      ownedBy('user-1', {
        createdAt: '2026-10-01T00:00:00.000Z',
        id: 'org-first',
      }),
      ownedBy('user-2', {
        createdAt: '2026-08-01T00:00:00.000Z',
        id: 'org-other',
      }),
    ]);

    await listener.handleEmailVerified({ userId: 'user-1' });

    expect(gifts.map((gift) => gift.organizationId)).toEqual(['org-first']);
  });

  it('does nothing for a user who owns no organization', async () => {
    const { gifts, listener, warnings } = listenerWith([ownedBy('user-2')]);

    await listener.handleEmailVerified({ userId: 'user-1' });

    expect(gifts).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it.each([
    ['the organization lookup fails', { isDatabaseDown: true }],
    ['the gift ledger fails', { isLedgerDown: true }],
  ])('never throws into sign-in when %s', async (_label, options) => {
    const { gifts, listener, warnings } = listenerWith(
      [ownedBy('user-1')],
      options,
    );

    await expect(
      listener.handleSessionCreated({ userId: 'user-1' }),
    ).resolves.toBeUndefined();
    expect(gifts).toEqual([]);
    expect(warnings).toEqual(['Could not release signup gift credits']);
  });
});
