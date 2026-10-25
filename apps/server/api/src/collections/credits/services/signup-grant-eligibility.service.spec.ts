import { hashToken } from '@api/auth/shared/pkce.util';
import {
  MAX_FREE_GRANTS_PER_IP_PER_DAY,
  SignupGrantEligibilityService,
} from '@api/collections/credits/services/signup-grant-eligibility.service';
import type { PrismaTransactionClient } from '@api/helpers/utils/transaction/transaction.util';
import * as deployment from '@genfeedai/config';
import { CreditTransactionCategory } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';

describe('SignupGrantEligibilityService', () => {
  const userFindFirst = vi.fn();
  const grantFindFirst = vi.fn();
  const grantCount = vi.fn();
  const sessionFindFirst = vi.fn();
  const logger = { log: vi.fn(), warn: vi.fn() };
  const tx = {
    creditTransaction: { count: grantCount, findFirst: grantFindFirst },
    session: { findFirst: sessionFindFirst },
    user: { findFirst: userFindFirst },
  } as unknown as PrismaTransactionClient;
  const service = new SignupGrantEligibilityService(
    logger as unknown as LoggerService,
  );
  const input = { source: 'onboarding-trial', userId: 'user-1' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(deployment, 'isSelfHostedDeployment').mockReturnValue(false);
    vi.spyOn(deployment, 'usesMeteredCredits').mockReturnValue(true);
    userFindFirst.mockResolvedValue({
      email: 'Jane.Doe+promo@gmail.com',
      emailVerified: true,
    });
    grantFindFirst.mockResolvedValue(null);
    grantCount.mockResolvedValue(0);
    sessionFindFirst.mockResolvedValue({ ipAddress: '203.0.113.7' });
  });
  afterEach(() => vi.restoreAllMocks());

  it('is always eligible where the hosted free trial does not exist', async () => {
    vi.spyOn(deployment, 'isSelfHostedDeployment').mockReturnValue(true);

    await expect(
      service.evaluate(tx, { ...input, isCardRequired: true }),
    ).resolves.toEqual({
      cardKey: null,
      emailKey: null,
      ipKey: null,
      isEligible: true,
    });
    expect(userFindFirst).not.toHaveBeenCalled();
  });

  it('withholds the grant from an unverified mailbox', async () => {
    userFindFirst.mockResolvedValue({
      email: 'jane@example.com',
      emailVerified: false,
    });

    await expect(service.evaluate(tx, input)).resolves.toEqual({
      isEligible: false,
      reason: 'email-unverified',
    });
    expect(grantFindFirst).not.toHaveBeenCalled();
  });

  it('withholds the grant from an unknown user', async () => {
    userFindFirst.mockResolvedValue(null);

    await expect(service.evaluate(tx, input)).resolves.toEqual({
      isEligible: false,
      reason: 'email-unverified',
    });
  });

  it('withholds the grant when another account already collected it with an alias of the mailbox', async () => {
    grantFindFirst.mockResolvedValue({ id: 'earlier-grant' });

    await expect(service.evaluate(tx, input)).resolves.toEqual({
      isEligible: false,
      reason: 'duplicate-mailbox',
    });
    expect(grantFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          metadata: {
            equals: expect.stringMatching(/^[0-9a-f]{64}$/),
            path: ['emailKey'],
          },
          organization: { userId: { not: 'user-1' } },
          source: 'onboarding-trial',
        }),
      }),
    );
  });

  it('keys every alias of one Gmail mailbox identically', async () => {
    const first = await service.evaluate(tx, input);
    userFindFirst.mockResolvedValue({
      email: 'janedoe@googlemail.com',
      emailVerified: true,
    });
    const second = await service.evaluate(tx, input);

    expect(first).toMatchObject({ isEligible: true });
    expect(second).toEqual(first);
  });

  it('withholds the grant once one IP address has collected the daily limit', async () => {
    grantCount.mockResolvedValue(MAX_FREE_GRANTS_PER_IP_PER_DAY);

    await expect(service.evaluate(tx, input)).resolves.toEqual({
      isEligible: false,
      reason: 'ip-velocity',
    });
  });

  it('counts prior grants by the hashed IP stored on the ledger, not by live sessions', async () => {
    await service.evaluate(tx, input);

    expect(grantCount).toHaveBeenCalledWith({
      where: expect.objectContaining({
        metadata: {
          equals: expect.stringMatching(/^[0-9a-f]{64}$/),
          path: ['ipKey'],
        },
        organization: { userId: { not: 'user-1' } },
      }),
    });
    expect(grantCount.mock.calls[0]?.[0].where).not.toHaveProperty(
      'organization.user.sessions',
    );
  });

  it('returns the IP key to record on the grant', async () => {
    await expect(service.evaluate(tx, input)).resolves.toMatchObject({
      ipKey: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it('grants while an IP address is under the daily limit', async () => {
    grantCount.mockResolvedValue(MAX_FREE_GRANTS_PER_IP_PER_DAY - 1);

    await expect(service.evaluate(tx, input)).resolves.toMatchObject({
      isEligible: true,
    });
  });

  it('uses the request IP when the user has no session yet', async () => {
    sessionFindFirst.mockResolvedValue(null);
    grantCount.mockResolvedValue(MAX_FREE_GRANTS_PER_IP_PER_DAY);

    await expect(
      service.evaluate(tx, { ...input, ipAddress: '198.51.100.9' }),
    ).resolves.toEqual({ isEligible: false, reason: 'ip-velocity' });
  });

  it('prefers the first session IP over the request IP', async () => {
    const withSession = await service.evaluate(tx, input);
    const withRequestIp = await service.evaluate(tx, {
      ...input,
      ipAddress: '198.51.100.9',
    });

    expect(withRequestIp).toEqual(withSession);
  });

  it('withholds a hosted OAuth gift until a trusted IP is available', async () => {
    sessionFindFirst.mockResolvedValue(null);
    grantCount.mockResolvedValue(MAX_FREE_GRANTS_PER_IP_PER_DAY);

    await expect(
      service.evaluate(tx, { ...input, source: 'onboarding-signup-gift' }),
    ).resolves.toEqual({ isEligible: false, reason: 'ip-required' });
    expect(grantCount).not.toHaveBeenCalled();
  });

  it('keeps the daily signup-gift count after prior recipients sign out, across distinct verified mailboxes', async () => {
    const durableIpKeys: string[] = [];
    grantCount.mockImplementation(async () => durableIpKeys.length);
    const source = 'onboarding-signup-gift';
    for (let index = 0; index < MAX_FREE_GRANTS_PER_IP_PER_DAY; index += 1) {
      userFindFirst.mockResolvedValue({
        email: `mailbox-${index}@example.com`,
        emailVerified: true,
      });
      const eligibility = await service.evaluate(tx, {
        source,
        userId: `user-${index}`,
      });
      expect(eligibility.isEligible).toBe(true);
      if (!eligibility.isEligible || !eligibility.ipKey)
        throw new Error('Expected a keyed grant');
      durableIpKeys.push(eligibility.ipKey);
      // Signing out deletes the prior recipient's sessions, never their ledger.
      sessionFindFirst.mockResolvedValue(null);
      sessionFindFirst.mockResolvedValueOnce({ ipAddress: '203.0.113.7' });
    }
    userFindFirst.mockResolvedValue({
      email: 'another-mailbox@example.com',
      emailVerified: true,
    });
    await expect(
      service.evaluate(tx, { source, userId: 'another-user' }),
    ).resolves.toEqual({ isEligible: false, reason: 'ip-velocity' });
    expect(grantCount).toHaveBeenLastCalledWith({
      where: {
        category: CreditTransactionCategory.ADD,
        createdAt: { gte: expect.any(Date) },
        isDeleted: false,
        metadata: { equals: hashToken('203.0.113.7'), path: ['ipKey'] },
        organization: { userId: { not: 'another-user' } },
        source,
      },
    });
  });

  it('withholds a hosted gift when the available session has an empty IP', async () => {
    sessionFindFirst.mockResolvedValue({ ipAddress: '' });
    await expect(service.evaluate(tx, input)).resolves.toEqual({
      isEligible: false,
      reason: 'ip-required',
    });
  });

  it('grants a user without an email address on verification alone', async () => {
    userFindFirst.mockResolvedValue({ email: null, emailVerified: true });

    await expect(service.evaluate(tx, input)).resolves.toEqual({
      cardKey: null,
      emailKey: null,
      ipKey: expect.stringMatching(/^[0-9a-f]{64}$/),
      isEligible: true,
    });
    expect(grantFindFirst).not.toHaveBeenCalled();
  });

  describe('card requirement', () => {
    const cardInput = { ...input, isCardRequired: true };

    it('withholds a card-gated grant while no card has been verified', async () => {
      await expect(service.evaluate(tx, cardInput)).resolves.toEqual({
        isEligible: false,
        reason: 'card-required',
      });
      expect(logger.log).toHaveBeenCalledWith(
        'Free credit grant withheld',
        expect.objectContaining({ reason: 'card-required' }),
      );
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('does not ask for a card on grants that do not need one', async () => {
      await expect(service.evaluate(tx, input)).resolves.toMatchObject({
        isEligible: true,
      });
    });

    it('withholds the grant when another account already used the same card', async () => {
      grantFindFirst.mockImplementation(
        async ({ where }: { where: { metadata: { path: string[] } } }) =>
          where.metadata.path[0] === 'cardKey' ? { id: 'earlier-grant' } : null,
      );

      await expect(
        service.evaluate(tx, { ...cardInput, cardKey: 'card-hash' }),
      ).resolves.toEqual({ isEligible: false, reason: 'duplicate-card' });
      expect(grantFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            metadata: { equals: 'card-hash', path: ['cardKey'] },
            organization: { userId: { not: 'user-1' } },
            source: 'onboarding-trial',
          }),
        }),
      );
    });

    it('returns the card key to record on the grant', async () => {
      await expect(
        service.evaluate(tx, { ...cardInput, cardKey: 'card-hash' }),
      ).resolves.toMatchObject({ cardKey: 'card-hash', isEligible: true });
    });
  });
});
