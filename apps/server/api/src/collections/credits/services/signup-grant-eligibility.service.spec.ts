import {
  MAX_FREE_GRANTS_PER_IP_PER_DAY,
  SignupGrantEligibilityService,
} from '@api/collections/credits/services/signup-grant-eligibility.service';
import type { PrismaTransactionClient } from '@api/helpers/utils/transaction/transaction.util';
import * as deployment from '@genfeedai/config';
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

    await expect(service.evaluate(tx, input)).resolves.toEqual({
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

  it('skips the IP check when the user has no session yet', async () => {
    sessionFindFirst.mockResolvedValue(null);
    grantCount.mockResolvedValue(MAX_FREE_GRANTS_PER_IP_PER_DAY);

    await expect(service.evaluate(tx, input)).resolves.toMatchObject({
      isEligible: true,
    });
    expect(grantCount).not.toHaveBeenCalled();
  });

  it('grants a user without an email address on verification alone', async () => {
    userFindFirst.mockResolvedValue({ email: null, emailVerified: true });

    await expect(service.evaluate(tx, input)).resolves.toEqual({
      emailKey: null,
      ipKey: null,
      isEligible: true,
    });
    expect(grantFindFirst).not.toHaveBeenCalled();
  });
});
