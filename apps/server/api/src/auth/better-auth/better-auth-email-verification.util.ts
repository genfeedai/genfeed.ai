import type { IEmailVerificationEnforcementSources } from './better-auth.types';

/**
 * Email verification is enforced when the operator turned it on, with one
 * exception: a deployment where a mailer is optional (self-hosted, or an
 * explicit `ALLOW_EMAIL_VERIFICATION_WITHOUT_MAILER` dev setting) and none can
 * deliver the link. There enforcing would lock every new email/password
 * account out of an install that never configured `RESEND_API_KEY`. The stored
 * switch is left untouched: adding a mailer later enforces it again.
 *
 * Anywhere else (hosted) a missing mailer is a misconfiguration, so this fails
 * closed: verification stays required and `onMailerMissing` is called so the
 * misconfiguration is reported instead of silently letting accounts in
 * unverified.
 *
 * The mailer is only asked when the switch is on.
 */
export async function resolveIsEmailVerificationEnforced({
  isMailerConfigured,
  isMailerOptional,
  isRequired,
  onMailerMissing,
}: IEmailVerificationEnforcementSources): Promise<boolean> {
  if (!(await isRequired())) {
    return false;
  }
  if (await isMailerConfigured()) {
    return true;
  }
  if (isMailerOptional()) {
    return false;
  }
  onMailerMissing?.();
  return true;
}

/** Names the notifications settings a hosted deployment is missing, if any. */
export function listMissingMailerSettings(
  settings: Readonly<Record<string, string | undefined>>,
): string[] {
  return Object.entries(settings)
    .filter(([, value]) => !value?.trim())
    .map(([key]) => key);
}
