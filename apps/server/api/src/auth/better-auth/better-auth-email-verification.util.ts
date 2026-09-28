import type { IEmailVerificationEnforcementSources } from './better-auth.types';

/**
 * Email verification is enforced only when the operator turned it on AND a
 * mailer can deliver the verification link. Without a mailer the link can
 * never arrive, so enforcing would lock every new email/password account out
 * of a self-hosted install that never configured `RESEND_API_KEY`. The stored
 * switch is left untouched: adding a mailer later enforces it again.
 *
 * The mailer is only asked when the switch is on.
 */
export async function resolveIsEmailVerificationEnforced({
  isMailerConfigured,
  isRequired,
}: IEmailVerificationEnforcementSources): Promise<boolean> {
  return (await isRequired()) && (await isMailerConfigured());
}
