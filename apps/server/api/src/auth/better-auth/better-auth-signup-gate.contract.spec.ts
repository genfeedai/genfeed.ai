import { WaitlistStatus } from '@genfeedai/contracts';
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
import {
  buildBetterAuthSignupGate,
  SIGNUP_INVITE_ONLY_CODE,
} from './better-auth-signup-gate.util';

const AUTH_BASE_URL = 'http://localhost:3010';
const AUTH_SECRET =
  'better-auth-signup-gate-contract-secret-with-sufficient-entropy';
const STRANGER_EMAIL = 'stranger@example.com';
const APPROVED_EMAIL = 'approved-lead@example.com';
const MEMBER_EMAIL = 'existing-member@example.com';

type FakeWaitlistRow = { email: string; isDeleted: boolean; status: string };
type FakeUserRow = { email: string; isDeleted: boolean };

/**
 * A two-table stand-in for the Prisma client that applies the same filters the
 * gate asks for, so the contract exercises the gate's decisions rather than
 * its call shapes.
 */
function createFakePrisma(rows: {
  users: FakeUserRow[];
  waitlist: FakeWaitlistRow[];
}) {
  return {
    user: {
      count: async ({ where }: { where: { isDeleted: boolean } }) =>
        rows.users.filter((user) => user.isDeleted === where.isDeleted).length,
      findFirst: async ({
        where,
      }: {
        where: { email: { equals: string }; isDeleted: boolean };
      }) =>
        rows.users.find(
          (user) =>
            user.email.toLowerCase() === where.email.equals.toLowerCase() &&
            user.isDeleted === where.isDeleted,
        ) ?? null,
    },
    waitlistEntry: {
      findFirst: async ({
        where,
      }: {
        where: { email: string; isDeleted: boolean; status: string };
      }) =>
        rows.waitlist.find(
          (entry) =>
            entry.email === where.email &&
            entry.isDeleted === where.isDeleted &&
            entry.status === where.status,
        ) ?? null,
    },
  } as unknown as ICreateBetterAuthOptions['prisma'];
}

function createHarness({
  isInviteOnly,
  users = [],
  waitlist = [],
}: {
  isInviteOnly: boolean;
  users?: FakeUserRow[];
  waitlist?: FakeWaitlistRow[];
}) {
  const database: MemoryDB = {
    account: [],
    session: [],
    user: [],
    verification: [],
  };
  const sendMagicLink = vi.fn(
    async (_params: IBetterAuthMagicLinkParams): Promise<void> => undefined,
  );
  const prisma = createFakePrisma({ users, waitlist });
  const signupGate = buildBetterAuthSignupGate({
    prisma,
    resolveIsInviteOnly: async () => isInviteOnly,
  });
  const auth = betterAuth({
    advanced: { database: { generateId: 'uuid' } },
    baseURL: AUTH_BASE_URL,
    basePath: BETTER_AUTH_BASE_PATH,
    database: memoryAdapter(database),
    databaseHooks: buildBetterAuthUserDatabaseHooks(
      undefined,
      undefined,
      undefined,
      signupGate,
    ),
    emailAndPassword: { enabled: true },
    plugins: [
      magicLink(
        buildBetterAuthMagicLinkOptions({ prisma, sendMagicLink, signupGate }),
      ),
    ],
    secret: AUTH_SECRET,
    // The suite sends requests without an Origin header.
    trustedOrigins: [AUTH_BASE_URL],
  });

  function post(path: string, body: Record<string, string>): Promise<Response> {
    return auth.handler(
      new Request(`${AUTH_BASE_URL}${BETTER_AUTH_BASE_PATH}${path}`, {
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }),
    );
  }

  return {
    createdUserEmails: () =>
      database.user.map((user) => String((user as { email: string }).email)),
    post,
    sendMagicLink,
    signUp: (email: string) =>
      post('/sign-up/email', {
        email,
        name: 'Lead',
        password: 'correct-horse-battery-staple',
      }),
  };
}

async function readErrorCode(response: Response): Promise<string | undefined> {
  const body = (await response.json()) as { code?: string };
  return body.code;
}

describe('closed signup', () => {
  const existingMember: FakeUserRow = {
    email: MEMBER_EMAIL,
    isDeleted: false,
  };

  it('lets anyone sign up while signup is open', async () => {
    const harness = createHarness({
      isInviteOnly: false,
      users: [existingMember],
    });

    const response = await harness.signUp(STRANGER_EMAIL);

    expect(response.status).toBe(200);
    expect(harness.createdUserEmails()).toEqual([STRANGER_EMAIL]);
  });

  it('refuses a stranger and creates no account when invite-only', async () => {
    const harness = createHarness({
      isInviteOnly: true,
      users: [existingMember],
    });

    const response = await harness.signUp(STRANGER_EMAIL);

    expect(response.status).toBe(403);
    expect(await readErrorCode(response)).toBe(SIGNUP_INVITE_ONLY_CODE);
    expect(harness.createdUserEmails()).toEqual([]);
  });

  it('lets an approved waitlist email sign up when invite-only', async () => {
    const harness = createHarness({
      isInviteOnly: true,
      users: [existingMember],
      waitlist: [
        {
          email: APPROVED_EMAIL,
          isDeleted: false,
          status: WaitlistStatus.APPROVED,
        },
      ],
    });

    const response = await harness.signUp(APPROVED_EMAIL);

    expect(response.status).toBe(200);
    expect(harness.createdUserEmails()).toEqual([APPROVED_EMAIL]);
  });

  it.each([[WaitlistStatus.PENDING], [WaitlistStatus.REJECTED]])(
    'keeps a %s waitlist email out when invite-only',
    async (status) => {
      const harness = createHarness({
        isInviteOnly: true,
        users: [existingMember],
        waitlist: [{ email: STRANGER_EMAIL, isDeleted: false, status }],
      });

      const response = await harness.signUp(STRANGER_EMAIL);

      expect(response.status).toBe(403);
      expect(harness.createdUserEmails()).toEqual([]);
    },
  );

  it('lets the first account of an empty install bootstrap its owner', async () => {
    const harness = createHarness({ isInviteOnly: true, users: [] });

    const response = await harness.signUp(STRANGER_EMAIL);

    expect(response.status).toBe(200);
    expect(harness.createdUserEmails()).toEqual([STRANGER_EMAIL]);
  });

  it('sends no magic link to an unknown email when invite-only', async () => {
    const harness = createHarness({
      isInviteOnly: true,
      users: [existingMember],
    });

    const response = await harness.post('/sign-in/magic-link', {
      email: STRANGER_EMAIL,
    });

    expect(response.status).toBe(403);
    expect(await readErrorCode(response)).toBe(SIGNUP_INVITE_ONLY_CODE);
    expect(harness.sendMagicLink).not.toHaveBeenCalled();
  });

  it('still sends a magic link to an existing member when invite-only', async () => {
    const harness = createHarness({
      isInviteOnly: true,
      users: [existingMember],
    });

    const response = await harness.post('/sign-in/magic-link', {
      email: MEMBER_EMAIL.toUpperCase(),
    });

    expect(response.status).toBe(200);
    expect(harness.sendMagicLink).toHaveBeenCalledTimes(1);
  });
});
