import { describe, expect, it, vi } from 'vitest';

import { resolveIsEmailVerificationEnforced } from './better-auth-email-verification.util';

function sources(isRequired: boolean, isMailerConfigured: boolean) {
  return {
    isMailerConfigured: vi.fn().mockResolvedValue(isMailerConfigured),
    isRequired: vi.fn().mockResolvedValue(isRequired),
  };
}

describe('resolveIsEmailVerificationEnforced', () => {
  it('enforces when the switch is on and a mailer is configured', async () => {
    await expect(
      resolveIsEmailVerificationEnforced(sources(true, true)),
    ).resolves.toBe(true);
  });

  it('does not enforce when the switch is on but no mailer is configured', async () => {
    await expect(
      resolveIsEmailVerificationEnforced(sources(true, false)),
    ).resolves.toBe(false);
  });

  it('does not enforce when the switch is off, with or without a mailer', async () => {
    await expect(
      resolveIsEmailVerificationEnforced(sources(false, true)),
    ).resolves.toBe(false);
    await expect(
      resolveIsEmailVerificationEnforced(sources(false, false)),
    ).resolves.toBe(false);
  });

  it('only asks about the mailer when the switch is on', async () => {
    const off = sources(false, true);
    await resolveIsEmailVerificationEnforced(off);
    expect(off.isMailerConfigured).not.toHaveBeenCalled();
  });
});
