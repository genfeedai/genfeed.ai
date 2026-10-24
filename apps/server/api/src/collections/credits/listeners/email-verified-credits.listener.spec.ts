import { EmailVerifiedCreditsListener } from '@api/collections/credits/listeners/email-verified-credits.listener';
import type { OnboardingCreditGrantsService } from '@api/collections/credits/services/onboarding-credit-grants.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';

describe('EmailVerifiedCreditsListener', () => {
  const findOrganization = vi.fn();
  const grantSignupGift = vi.fn();
  const logger = { warn: vi.fn() };
  const listener = new EmailVerifiedCreditsListener(
    {
      organization: { findFirst: findOrganization },
    } as unknown as PrismaService,
    { grantSignupGift } as unknown as OnboardingCreditGrantsService,
    logger as unknown as LoggerService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    grantSignupGift.mockResolvedValue(undefined);
  });

  it('releases the signup gift once the mailbox is verified', async () => {
    findOrganization.mockResolvedValue({ id: 'org-1' });

    await listener.handleEmailVerified({
      ipAddress: '198.51.100.9',
      userId: 'user-1',
    });

    expect(grantSignupGift).toHaveBeenCalledWith('org-1', 'user-1', {
      ipAddress: '198.51.100.9',
    });
  });

  it('does nothing for a user who owns no organization', async () => {
    findOrganization.mockResolvedValue(null);

    await listener.handleEmailVerified({ userId: 'user-1' });

    expect(grantSignupGift).not.toHaveBeenCalled();
  });

  it('never throws into the verification redirect', async () => {
    findOrganization.mockResolvedValue({ id: 'org-1' });
    grantSignupGift.mockRejectedValue(new Error('ledger down'));

    await expect(
      listener.handleEmailVerified({ userId: 'user-1' }),
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });
});
