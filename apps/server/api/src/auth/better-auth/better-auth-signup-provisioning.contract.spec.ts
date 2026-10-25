import { BrandsService } from '@api/collections/brands/services/brands.service';
import { EmailVerifiedCreditsListener } from '@api/collections/credits/listeners/email-verified-credits.listener';
import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { FreeTrialService } from '@api/collections/credits/services/free-trial.service';
import { OnboardingCreditGrantsService } from '@api/collections/credits/services/onboarding-credit-grants.service';
import { SignupGrantEligibilityService } from '@api/collections/credits/services/signup-grant-eligibility.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { RolesService } from '@api/collections/roles/services/roles.service';
import { SettingsService } from '@api/collections/settings/services/settings.service';
import { UserSetupService } from '@api/collections/users/services/user-setup.service';
import type {
  PrismaTransactionClient,
  TransactionUtil,
} from '@api/helpers/utils/transaction/transaction.util';
import type { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import type { LifecycleEmailService } from '@api/services/lifecycle-emails/lifecycle-email.service';
import type { SignupPrefillWorkflowService } from '@api/services/signup-prefill/signup-prefill-workflow.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import * as deployment from '@genfeedai/config';
import type { LoggerService } from '@libs/logger/logger.service';
import { betterAuth } from 'better-auth';
import { type MemoryDB, memoryAdapter } from 'better-auth/adapters/memory';
import { magicLink } from 'better-auth/plugins';
import { describe, expect, it, vi } from 'vitest';
import { BETTER_AUTH_BASE_PATH } from './better-auth.constants';
import {
  buildBetterAuthMagicLinkOptions,
  buildBetterAuthUserDatabaseHooks,
} from './better-auth.factory';
import type {
  IBetterAuthMagicLinkParams,
  ICreateBetterAuthOptions,
} from './better-auth.types';
import { UserProvisioningListener } from './listeners/user-provisioning.listener';

const AUTH_BASE_URL = 'http://localhost:3010';
const AUTH_SECRET =
  'better-auth-signup-provisioning-contract-secret-with-sufficient-entropy';
const TEST_EMAIL = 'signup-provisioning-contract@example.com';
const ORGANIZATION_ID = 'org_signup';
const BRAND_ID = 'brand_signup';
const MEMBER_ID = 'member_signup';
const ROLE_ID = 'role_admin';

type SessionBody = {
  session: {
    token: string;
    userId: string;
  };
  user: {
    email: string;
    handle?: string;
    id: string;
  };
};

type CreatedUser = {
  email: string;
  handle?: string;
  id: string;
};

function createSignupProvisioningHarness() {
  const database: MemoryDB = {
    account: [],
    session: [],
    user: [],
    verification: [],
  };
  let deliveredMagicLink: IBetterAuthMagicLinkParams | undefined;
  const sendMagicLink = vi.fn(
    async (params: IBetterAuthMagicLinkParams): Promise<void> => {
      deliveredMagicLink = params;
    },
  );
  const prisma = {
    user: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  } as unknown as ICreateBetterAuthOptions['prisma'];

  const organizationsService = {
    create: vi.fn().mockResolvedValue({
      id: ORGANIZATION_ID,
      label: 'Default Organization',
    }),
    findOne: vi.fn().mockResolvedValue(null),
    generateUniqueSlug: vi.fn().mockResolvedValue('default-organization'),
  };
  const organizationSettingsService = {
    create: vi.fn().mockResolvedValue({
      id: 'org_settings_signup',
      organizationId: ORGANIZATION_ID,
    }),
    ensureForOrganization: vi.fn().mockResolvedValue({
      id: 'org_settings_signup',
      organizationId: ORGANIZATION_ID,
    }),
    findOne: vi.fn().mockResolvedValue(null),
    getLatestMajorVersionModelIds: vi.fn().mockResolvedValue(['model1']),
  };
  const brandsService = {
    create: vi.fn().mockResolvedValue({
      id: BRAND_ID,
      organizationId: ORGANIZATION_ID,
    }),
    findOne: vi.fn().mockResolvedValue(null),
    generateUniqueSlug: vi.fn().mockResolvedValue('default-organization'),
  };
  const membersService = {
    create: vi.fn().mockResolvedValue({
      id: MEMBER_ID,
      organizationId: ORGANIZATION_ID,
    }),
    findOne: vi.fn().mockResolvedValue(null),
  };
  const rolesService = {
    findOne: vi.fn().mockResolvedValue({ id: ROLE_ID, key: 'admin' }),
  };
  const settingsService = {
    create: vi.fn().mockResolvedValue({ id: 'user_settings_signup' }),
    findOne: vi.fn().mockResolvedValue(null),
  };
  const creditBalanceService = {
    getOrCreateBalance: vi.fn().mockResolvedValue({ balance: 0 }),
  };
  const creditsUtilsService = {
    grantSignupGift: vi.fn().mockResolvedValue(undefined),
    getOrganizationCreditsWithExpiration: vi.fn().mockResolvedValue({
      credits: [],
      total: 0,
    }),
  };
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const lifecycleEmailService = {
    scheduleSignupLifecycle: vi.fn().mockResolvedValue(undefined),
  };
  const signupPrefillQueueService = {
    enqueuePrefill: vi.fn().mockResolvedValue(undefined),
  };
  const notificationsService = {
    dispatch: vi.fn().mockResolvedValue(undefined),
  };

  const userSetupService = new UserSetupService(
    organizationsService as unknown as OrganizationsService,
    organizationSettingsService as unknown as OrganizationSettingsService,
    brandsService as unknown as BrandsService,
    membersService as unknown as MembersService,
    rolesService as unknown as RolesService,
    settingsService as unknown as SettingsService,
    {
      ensureForOrganization: vi.fn().mockResolvedValue({ id: 'ba_1' }),
    } as unknown as import('@api/collections/billing-accounts/services/billing-accounts.service').BillingAccountsService,
    creditBalanceService as unknown as CreditBalanceService,
    creditsUtilsService as unknown as OnboardingCreditGrantsService,
    logger as unknown as LoggerService,
  );
  const listener = new UserProvisioningListener(
    userSetupService,
    lifecycleEmailService as unknown as LifecycleEmailService,
    signupPrefillQueueService as unknown as SignupPrefillWorkflowService,
    notificationsService as unknown as ActivityRecorderService,
    logger as unknown as LoggerService,
  );

  const sessionCreated = vi.fn(async (event: { userId: string }) => {
    expect(
      database.session.some((session) => session.userId === event.userId),
    ).toBe(true);
  });
  const auth = betterAuth({
    basePath: BETTER_AUTH_BASE_PATH,
    baseURL: AUTH_BASE_URL,
    database: memoryAdapter(database),
    databaseHooks: buildBetterAuthUserDatabaseHooks(
      async (event) => {
        await listener.handleUserCreated(event);
      },
      undefined,
      sessionCreated,
    ),
    plugins: [
      magicLink(
        buildBetterAuthMagicLinkOptions({
          prisma,
          sendMagicLink,
        }),
      ),
    ],
    rateLimit: { enabled: false },
    secret: AUTH_SECRET,
    user: {
      additionalFields: {
        handle: {
          input: false,
          required: false,
          type: 'string',
        },
      },
      fields: { image: 'avatar' },
    },
  });

  return {
    auth,
    brandsService,
    creditsUtilsService,
    database,
    getDeliveredMagicLink(): IBetterAuthMagicLinkParams {
      if (!deliveredMagicLink) {
        throw new Error('Expected Better Auth to deliver a magic link');
      }
      return deliveredMagicLink;
    },
    logger,
    membersService,
    organizationsService,
    request(path: string, init?: RequestInit): Promise<Response> {
      return auth.handler(
        new Request(`${AUTH_BASE_URL}${BETTER_AUTH_BASE_PATH}${path}`, init),
      );
    },
    userSetupService,
    sessionCreated,
  };
}

async function requestMagicLink(
  harness: ReturnType<typeof createSignupProvisioningHarness>,
): Promise<Response> {
  return harness.request('/sign-in/magic-link', {
    body: JSON.stringify({ email: TEST_EMAIL }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
}

async function verifyMagicLink(
  harness: ReturnType<typeof createSignupProvisioningHarness>,
  token: string,
): Promise<Response> {
  return harness.request(
    `/magic-link/verify?token=${encodeURIComponent(token)}`,
  );
}

function getSessionCookie(response: Response): string {
  const setCookie = response.headers.get('set-cookie');
  const sessionCookie = setCookie?.match(
    /(?:^|, )([^=;,]*session_token=[^;,]+)/,
  )?.[1];

  if (!sessionCookie) {
    throw new Error('Expected signup verification to set a session cookie');
  }
  return sessionCookie;
}

describe('Better Auth signup provisioning contract', () => {
  it('provisions handle, org, brand, member, and credits before the session is usable', async () => {
    const harness = createSignupProvisioningHarness();
    await requestMagicLink(harness);
    const delivered = harness.getDeliveredMagicLink();

    const verificationResponse = await verifyMagicLink(
      harness,
      delivered.token,
    );
    const sessionCookie = getSessionCookie(verificationResponse);
    const sessionResponse = await harness.request('/get-session', {
      headers: { cookie: sessionCookie },
    });
    const session = (await sessionResponse.json()) as SessionBody;
    const createdUser = harness.database.user[0] as CreatedUser | undefined;

    expect(verificationResponse.status).toBe(200);
    expect(sessionResponse.status).toBe(200);
    expect(session.user.email).toBe(TEST_EMAIL);
    expect(harness.sessionCreated).toHaveBeenCalledWith({
      userId: session.user.id,
    });
    expect(session.session.userId).toBe(session.user.id);
    expect(createdUser?.id).toBe(session.user.id);
    expect(createdUser?.handle).toMatch(
      /^signup-provisioning-cont-[0-9a-f]{8}$/,
    );
    expect(harness.organizationsService.create).toHaveBeenCalledTimes(1);
    expect(harness.brandsService.create).toHaveBeenCalledTimes(1);
    expect(harness.membersService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        roleId: ROLE_ID,
        roleKey: 'admin',
        userId: session.user.id,
      }),
    );
    expect(harness.creditsUtilsService.grantSignupGift).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      session.user.id,
    );
  });

  it('defers a verified OAuth gift until a usable session IP exists and releases it only once', async () => {
    const hosted = vi
      .spyOn(deployment, 'isSelfHostedDeployment')
      .mockReturnValue(false);
    const metered = vi
      .spyOn(deployment, 'usesMeteredCredits')
      .mockReturnValue(true);
    try {
      const harness = createSignupProvisioningHarness();
      const paid: Array<
        Parameters<CreditsUtilsService['addPromotionalCreditsInTransaction']>[0]
      > = [];
      const tx = {
        organization: {
          findFirst: vi.fn().mockResolvedValue({ id: ORGANIZATION_ID }),
        },
        user: {
          findFirst: vi.fn(
            async ({ where }: { where: { id: string } }) =>
              harness.database.user.find((user) => user.id === where.id) ??
              null,
          ),
        },
        session: {
          findFirst: vi.fn(
            async ({
              where,
            }: {
              where: { userId: string; ipAddress: { notIn: string[] } };
            }) =>
              harness.database.session.find(
                (session) =>
                  session.userId === where.userId &&
                  typeof session.ipAddress === 'string' &&
                  !where.ipAddress.notIn.includes(session.ipAddress),
              ) ?? null,
          ),
        },
        creditTransaction: {
          findFirst: vi.fn(async () =>
            paid[0]
              ? {
                  organizationId: ORGANIZATION_ID,
                  balanceAfter: paid[0].creditsToAdd,
                }
              : null,
          ),
          count: vi.fn().mockResolvedValue(0),
        },
      } as unknown as PrismaTransactionClient;
      const grants = new OnboardingCreditGrantsService(
        {
          runInTransaction: async (
            operation: (client: PrismaTransactionClient) => Promise<unknown>,
          ) => operation(tx),
        } as unknown as TransactionUtil,
        {} as OrganizationSettingsService,
        {
          addPromotionalCreditsInTransaction: async (
            input: Parameters<
              CreditsUtilsService['addPromotionalCreditsInTransaction']
            >[0],
          ) => {
            paid.push(input);
            return {
              currentBalance: 0,
              newBalance: input.creditsToAdd,
              wasApplied: true,
            };
          },
          publishCreditAddition: vi.fn(),
        } as unknown as CreditsUtilsService,
        {} as FreeTrialService,
        harness.logger as unknown as LoggerService,
        undefined,
        new SignupGrantEligibilityService(
          harness.logger as unknown as LoggerService,
        ),
      );
      harness.creditsUtilsService.grantSignupGift.mockImplementation(
        (
          ...args: Parameters<OnboardingCreditGrantsService['grantSignupGift']>
        ) => grants.grantSignupGift(...args),
      );
      const release = new EmailVerifiedCreditsListener(
        {
          organization: {
            findFirst: vi.fn().mockResolvedValue({ id: ORGANIZATION_ID }),
          },
        } as unknown as PrismaService,
        grants,
        harness.logger as unknown as LoggerService,
      );
      harness.sessionCreated.mockImplementation((event) =>
        release.handleSessionCreated(event),
      );
      const context = await harness.auth.$context;
      // These are the same adapter calls used by Better Auth's OAuth callback;
      // no provider exchange or external request is involved.
      const { user } = await context.internalAdapter.createOAuthUser(
        { email: TEST_EMAIL, emailVerified: true, name: 'OAuth Signup' },
        { providerId: 'google', accountId: 'offline-oauth-account' },
      );
      expect(paid).toHaveLength(0);
      await context.internalAdapter.createSession(user.id);
      expect(paid).toHaveLength(0);

      const session = await context.internalAdapter.createSession(
        user.id,
        false,
        { ipAddress: '203.0.113.7' },
      );
      expect(paid).toHaveLength(1);
      expect(paid[0]).toMatchObject({
        creditsToAdd: 25,
        source: 'onboarding-signup-gift',
        options: {
          metadata: {
            ipKey: expect.stringMatching(/^[0-9a-f]{64}$/),
            emailKey: expect.stringMatching(/^[0-9a-f]{64}$/),
          },
        },
      });
      await context.internalAdapter.deleteSession(session.token);
      await context.internalAdapter.createSession(user.id, false, {
        ipAddress: '203.0.113.7',
      });
      await release.handleSessionCreated({ userId: user.id });
      expect(paid).toHaveLength(1);
      expect(JSON.stringify(paid)).not.toContain('203.0.113.7');
    } finally {
      hosted.mockRestore();
      metered.mockRestore();
    }
  });

  it('keeps a recoverable session when provisioning fails instead of returning a null session', async () => {
    const harness = createSignupProvisioningHarness();
    harness.organizationsService.create.mockRejectedValue(
      new Error('org create failed'),
    );
    await requestMagicLink(harness);
    const delivered = harness.getDeliveredMagicLink();

    const verificationResponse = await verifyMagicLink(
      harness,
      delivered.token,
    );
    const sessionCookie = getSessionCookie(verificationResponse);
    const sessionResponse = await harness.request('/get-session', {
      headers: { cookie: sessionCookie },
    });
    const session = (await sessionResponse.json()) as SessionBody;

    expect(verificationResponse.status).toBe(200);
    expect(session).not.toBeNull();
    expect(session.user.email).toBe(TEST_EMAIL);
    expect(harness.logger.error).toHaveBeenCalled();
    expect(harness.membersService.create).not.toHaveBeenCalled();
    expect(harness.creditsUtilsService.grantSignupGift).not.toHaveBeenCalled();
  });
});
