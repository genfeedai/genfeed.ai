import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { RolesService } from '@api/collections/roles/services/roles.service';
import { SettingsService } from '@api/collections/settings/services/settings.service';
import { UserSetupService } from '@api/collections/users/services/user-setup.service';
import type { LifecycleEmailService } from '@api/services/lifecycle-emails/lifecycle-email.service';
import type { SignupPrefillWorkflowService } from '@api/services/signup-prefill/signup-prefill-workflow.service';
import { ONBOARDING_SIGNUP_GIFT_CREDITS } from '@genfeedai/contracts/types';
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
    addOrganizationCreditsWithExpiration: vi.fn().mockResolvedValue(undefined),
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
    creditsUtilsService as unknown as CreditsUtilsService,
    logger as unknown as LoggerService,
  );
  const listener = new UserProvisioningListener(
    userSetupService,
    lifecycleEmailService as unknown as LifecycleEmailService,
    signupPrefillQueueService as unknown as SignupPrefillWorkflowService,
    logger as unknown as LoggerService,
  );

  const auth = betterAuth({
    basePath: BETTER_AUTH_BASE_PATH,
    baseURL: AUTH_BASE_URL,
    database: memoryAdapter(database),
    databaseHooks: buildBetterAuthUserDatabaseHooks(async (event) => {
      await listener.handleUserCreated(event);
    }),
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
    expect(
      harness.creditsUtilsService.addOrganizationCreditsWithExpiration,
    ).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      ONBOARDING_SIGNUP_GIFT_CREDITS,
      'onboarding-signup-gift',
      'Signup gift credits',
      expect.any(Date),
    );
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
    expect(
      harness.creditsUtilsService.addOrganizationCreditsWithExpiration,
    ).not.toHaveBeenCalled();
  });
});
