import { WaitlistStatus } from '@genfeedai/contracts';
import type { PrismaClient } from '@genfeedai/prisma';
import { APIError } from 'better-auth';
import type { IBetterAuthSignupGate } from './better-auth.types';

export const SIGNUP_INVITE_ONLY_CODE = 'SIGNUP_INVITE_ONLY';

const SIGNUP_INVITE_ONLY_MESSAGE =
  'Genfeed is invite-only right now. Join the waitlist and we will send an invitation when your spot opens.';

function normalizeEmail(email: string | null | undefined): string | null {
  const normalized = email?.trim().toLowerCase();
  return normalized || null;
}

/**
 * Closed-signup policy for Better Auth.
 *
 * While `isSignupInviteOnly` is on, a new account may only be created for an
 * email the operator approved on the waitlist, or as the very first account of
 * an empty install (so a self-hosted deployment can bootstrap its owner).
 * Invited and warm-up users never reach this gate: they are provisioned
 * straight into the database before their first sign-in.
 */
export function buildBetterAuthSignupGate({
  prisma,
  resolveIsInviteOnly,
}: {
  prisma: PrismaClient;
  resolveIsInviteOnly: () => Promise<boolean>;
}): IBetterAuthSignupGate {
  async function assertCanCreateAccount(
    email: string | null | undefined,
  ): Promise<void> {
    if (!(await resolveIsInviteOnly())) {
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    if (normalizedEmail) {
      const approved = await prisma.waitlistEntry.findFirst({
        select: { id: true },
        where: {
          email: normalizedEmail,
          isDeleted: false,
          status: WaitlistStatus.APPROVED,
        },
      });
      if (approved) {
        return;
      }
    }

    const existingUserCount = await prisma.user.count({
      where: { isDeleted: false },
    });
    if (existingUserCount === 0) {
      return;
    }

    throw APIError.from('FORBIDDEN', {
      code: SIGNUP_INVITE_ONLY_CODE,
      message: SIGNUP_INVITE_ONLY_MESSAGE,
    });
  }

  async function assertCanRequestMagicLink(email: string): Promise<void> {
    if (!(await resolveIsInviteOnly())) {
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    if (normalizedEmail) {
      const existingUser = await prisma.user.findFirst({
        select: { id: true },
        where: {
          email: { equals: normalizedEmail, mode: 'insensitive' },
          isDeleted: false,
        },
      });
      if (existingUser) {
        return;
      }
    }

    await assertCanCreateAccount(email);
  }

  return { assertCanCreateAccount, assertCanRequestMagicLink };
}
