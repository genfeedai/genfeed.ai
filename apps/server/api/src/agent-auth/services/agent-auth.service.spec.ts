import { createHash } from 'node:crypto';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { PlatformRole, SubscriptionTier } from '@genfeedai/contracts';
import type { ConfigService } from '@libs/config/config.service';

vi.mock('@genfeedai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/config')>();

  return {
    ...actual,
    isCloudDeployment: () => true,
  };
});

const { AgentAuthService } = await import('./agent-auth.service');

const userId = 'user_1';
const organizationId = 'org_1';

type RegistrationRecord = {
  claimAttemptTokenHash: string;
  claimTokenHash: string;
  claimedAt: Date | null;
  emailHash: string;
  exchangedAt: Date | null;
  expiresAt: Date;
  failedAttempts: number;
  id: string;
  organizationId: string | null;
  requestedScopes: string[];
  revokedAt: Date | null;
  userCodeHash: string;
  userId: string | null;
};

type RegistrationCreateData = Pick<
  RegistrationRecord,
  | 'claimAttemptTokenHash'
  | 'claimTokenHash'
  | 'emailHash'
  | 'expiresAt'
  | 'requestedScopes'
  | 'userCodeHash'
>;

type RegistrationUpdateData = Omit<
  Partial<RegistrationRecord>,
  'failedAttempts'
> & {
  failedAttempts?: number | { increment: number };
};

type RegistrationWhere = Omit<Partial<RegistrationRecord>, 'expiresAt'> & {
  expiresAt?: Date | { gt: Date };
};

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function makeUser(email = 'user@example.com'): AuthenticatedUser {
  return {
    emailAddresses: [{ emailAddress: email }],
    firstName: 'Agent',
    id: userId,
    organizationId: organizationId,
    userId: userId,
  } as AuthenticatedUser;
}

function buildService() {
  const records = new Map<string, RegistrationRecord>();
  const apiKeysService = {
    createWithKey: vi.fn().mockResolvedValue({
      apiKey: {
        expiresAt: new Date('2026-09-12T12:00:00.000Z'),
        id: 'api_key_1',
      },
      plainKey: 'gf_live_agent_auth_secret',
    }),
    findByKey: vi.fn().mockResolvedValue({
      id: 'api_key_1',
      metadata: {
        kind: 'agent-auth-registration',
        registrationId: 'registration_1',
      },
      organizationId,
      userId,
    }),
    revoke: vi.fn().mockResolvedValue({ id: 'api_key_1', isRevoked: true }),
  } as unknown as ApiKeysService;
  const prisma = {
    agentAuthRegistration: {
      create: vi.fn(({ data }: { data: RegistrationCreateData }) => {
        const record: RegistrationRecord = {
          claimedAt: null,
          exchangedAt: null,
          failedAttempts: 0,
          organizationId: null,
          revokedAt: null,
          userId: null,
          ...data,
          id: 'registration_1',
        };
        records.set(record.id, record);
        return record;
      }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      findUnique: vi.fn(
        ({
          where,
        }: {
          where: {
            claimAttemptTokenHash?: string;
            claimTokenHash?: string;
          };
        }) =>
          Array.from(records.values()).find(
            (record) =>
              record.claimAttemptTokenHash === where.claimAttemptTokenHash ||
              record.claimTokenHash === where.claimTokenHash,
          ) ?? null,
      ),
      updateMany: vi.fn(
        ({
          data,
          where,
        }: {
          data: RegistrationUpdateData;
          where: RegistrationWhere;
        }) => {
          const record = Array.from(records.values()).find((candidate) =>
            Object.entries(where).every(([key, value]) => {
              if (
                key === 'expiresAt' &&
                value &&
                typeof value === 'object' &&
                'gt' in value
              ) {
                const lowerBound = Reflect.get(value, 'gt');
                return (
                  lowerBound instanceof Date && candidate.expiresAt > lowerBound
                );
              }
              return candidate[key as keyof RegistrationRecord] === value;
            }),
          );
          if (!record) return { count: 0 };
          const { failedAttempts, ...scalarData } = data;
          Object.assign(record, scalarData);
          if (typeof failedAttempts === 'number') {
            record.failedAttempts = failedAttempts;
          } else if (failedAttempts) {
            record.failedAttempts += failedAttempts.increment;
          }
          return { count: 1 };
        },
      ),
    },
    apiKey: {
      count: vi.fn().mockResolvedValue(0),
    },
    organizationSetting: {
      findUnique: vi.fn().mockResolvedValue({
        subscriptionTier: SubscriptionTier.PRO,
      }),
    },
    user: {
      findFirst: vi.fn().mockResolvedValue({
        email: 'user@example.com',
        emailVerified: true,
        platformRole: PlatformRole.USER,
      }),
    },
  } as unknown as PrismaService;
  const configService = {
    get: vi.fn((key: string) => {
      if (key === 'GENFEEDAI_APP_URL') return 'https://app.genfeed.ai';
      if (key === 'GENFEEDAI_API_PUBLIC_URL') return 'https://api.genfeed.ai';
      return undefined;
    }),
  } as unknown as ConfigService;

  return {
    apiKeysService,
    prisma,
    records,
    service: new AgentAuthService(apiKeysService, configService, prisma),
  };
}

async function register(service: InstanceType<typeof AgentAuthService>) {
  return service.register({
    assertion: 'User@Example.com',
    assertion_type: 'verified_email',
    requested_credential_type: 'api_key',
    requested_scopes: ['videos:read', 'images:create'],
    type: 'identity_assertion',
  });
}

describe('AgentAuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts a verified-email claim without issuing a credential', async () => {
    const { apiKeysService, records, service } = buildService();

    const result = await register(service);
    const record = Array.from(records.values())[0];

    expect(result.registration_type).toBe('verified_email');
    expect(result.claim.user_code).toMatch(/^\d{6}$/);
    expect(result.claim.verification_uri).toContain(
      'https://app.genfeed.ai/agent-auth/claim?claim_attempt_token=',
    );
    expect(record?.emailHash).toBe(hash('user@example.com'));
    expect(JSON.stringify(record)).not.toContain('user@example.com');
    expect(record?.claimTokenHash).toBe(hash(result.claim_token));
    expect(record?.claimAttemptTokenHash).not.toContain(
      result.claim.verification_uri,
    );
    expect(apiKeysService.createWithKey).not.toHaveBeenCalled();
  });

  it('binds a claim only to the matching verified signed-in user', async () => {
    const { service } = buildService();
    const registration = await register(service);
    const claimAttemptToken = new URL(
      registration.claim.verification_uri,
    ).searchParams.get('claim_attempt_token');

    await expect(
      service.completeClaim(makeUser('attacker@example.com'), {
        claim_attempt_token: claimAttemptToken ?? '',
        user_code: registration.claim.user_code,
      }),
    ).rejects.toThrow('verified email does not match');

    await expect(
      service.completeClaim(makeUser(), {
        claim_attempt_token: claimAttemptToken ?? '',
        user_code: registration.claim.user_code,
      }),
    ).resolves.toEqual({ status: 'claimed' });
  });

  it('lets the confirmation page inspect only the server-bound scopes', async () => {
    const { service } = buildService();
    const registration = await register(service);
    const claimAttemptToken = new URL(
      registration.claim.verification_uri,
    ).searchParams.get('claim_attempt_token');

    await expect(
      service.inspectClaim({
        claim_attempt_token: claimAttemptToken ?? '',
      }),
    ).resolves.toMatchObject({
      requested_scopes: ['videos:read', 'images:create'],
      status: 'pending',
    });
  });

  it('issues one scoped API key after claim and rejects replay', async () => {
    const { apiKeysService, prisma, service } = buildService();
    const registration = await register(service);
    const claimAttemptToken = new URL(
      registration.claim.verification_uri,
    ).searchParams.get('claim_attempt_token');
    await service.completeClaim(makeUser(), {
      claim_attempt_token: claimAttemptToken ?? '',
      user_code: registration.claim.user_code,
    });

    const result = await service.exchangeClaim({
      claim_token: registration.claim_token,
    });

    expect(result).toMatchObject({
      credential: 'gf_live_agent_auth_secret',
      credential_type: 'api_key',
      scopes: ['videos:read', 'images:create'],
    });
    expect(apiKeysService.createWithKey).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          kind: 'agent-auth-registration',
        }),
        organizationId,
        scopes: ['videos:read', 'images:create'],
        userId,
      }),
    );
    expect(prisma.apiKey.count).toHaveBeenCalledWith({
      where: {
        isRevoked: false,
        organizationId,
        userId,
      },
    });
    await expect(
      service.exchangeClaim({ claim_token: registration.claim_token }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        error: 'invalid_grant',
        error_description: expect.stringContaining('already exchanged'),
      }),
    });
    expect(apiKeysService.createWithKey).toHaveBeenCalledTimes(1);
  });

  it('returns authorization_pending before the user claims the registration', async () => {
    const { service } = buildService();
    const registration = await register(service);

    await expect(
      service.exchangeClaim({ claim_token: registration.claim_token }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'authorization_pending' }),
    });
  });

  it('allows exactly one concurrent exchange to mint a credential', async () => {
    const { apiKeysService, service } = buildService();
    const registration = await register(service);
    const claimAttemptToken = new URL(
      registration.claim.verification_uri,
    ).searchParams.get('claim_attempt_token');
    await service.completeClaim(makeUser(), {
      claim_attempt_token: claimAttemptToken ?? '',
      user_code: registration.claim.user_code,
    });

    const results = await Promise.allSettled([
      service.exchangeClaim({ claim_token: registration.claim_token }),
      service.exchangeClaim({ claim_token: registration.claim_token }),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    expect(apiKeysService.createWithKey).toHaveBeenCalledTimes(1);
  });

  it('releases the exchange reservation when credential minting fails', async () => {
    const { apiKeysService, service } = buildService();
    const registration = await register(service);
    const claimAttemptToken = new URL(
      registration.claim.verification_uri,
    ).searchParams.get('claim_attempt_token');
    await service.completeClaim(makeUser(), {
      claim_attempt_token: claimAttemptToken ?? '',
      user_code: registration.claim.user_code,
    });
    vi.mocked(apiKeysService.createWithKey).mockRejectedValueOnce(
      new Error('credential mint failed'),
    );

    await expect(
      service.exchangeClaim({ claim_token: registration.claim_token }),
    ).rejects.toThrow('credential mint failed');

    await expect(
      service.exchangeClaim({ claim_token: registration.claim_token }),
    ).resolves.toMatchObject({
      credential: 'gf_live_agent_auth_secret',
      credential_type: 'api_key',
    });
    expect(apiKeysService.createWithKey).toHaveBeenCalledTimes(2);
  });

  it('revokes only proof-of-possession credentials issued by agent auth', async () => {
    const { apiKeysService, prisma, service } = buildService();

    await expect(
      service.revokeCredential({ token: 'gf_live_agent_auth_secret' }),
    ).resolves.toEqual({ revoked: true });
    expect(apiKeysService.revoke).toHaveBeenCalledWith('api_key_1');
    expect(prisma.agentAuthRegistration.updateMany).toHaveBeenCalledWith({
      data: { revokedAt: expect.any(Date) },
      where: {
        id: 'registration_1',
        organizationId,
        revokedAt: null,
        userId,
      },
    });

    vi.mocked(apiKeysService.findByKey).mockResolvedValueOnce({
      id: 'api_key_other',
      metadata: { kind: 'user-created' },
    } as never);
    await expect(
      service.revokeCredential({ token: 'gf_live_other_secret' }),
    ).resolves.toEqual({ revoked: false });
  });
});
