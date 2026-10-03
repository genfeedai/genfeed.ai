import { describe, expect, it, vi } from 'vitest';

import {
  listMissingMailerSettings,
  resolveIsEmailVerificationEnforced,
} from './better-auth-email-verification.util';

function sources(
  isRequired: boolean,
  isMailerConfigured: boolean,
  isMailerOptional: boolean,
) {
  return {
    isMailerConfigured: vi.fn().mockResolvedValue(isMailerConfigured),
    isMailerOptional: vi.fn().mockReturnValue(isMailerOptional),
    isRequired: vi.fn().mockResolvedValue(isRequired),
    onMailerMissing: vi.fn(),
  };
}

describe('resolveIsEmailVerificationEnforced', () => {
  it.each([true, false])(
    'enforces when the switch is on and a mailer is configured (optional: %s)',
    async (isMailerOptional) => {
      const input = sources(true, true, isMailerOptional);
      await expect(resolveIsEmailVerificationEnforced(input)).resolves.toBe(
        true,
      );
      expect(input.onMailerMissing).not.toHaveBeenCalled();
    },
  );

  it('self-hosted without a mailer keeps working: not enforced, no alert', async () => {
    const input = sources(true, false, true);
    await expect(resolveIsEmailVerificationEnforced(input)).resolves.toBe(
      false,
    );
    expect(input.onMailerMissing).not.toHaveBeenCalled();
  });

  it('hosted without a mailer fails closed and reports it', async () => {
    const input = sources(true, false, false);
    await expect(resolveIsEmailVerificationEnforced(input)).resolves.toBe(true);
    expect(input.onMailerMissing).toHaveBeenCalledTimes(1);
  });

  it('does not enforce when the switch is off, in any mode', async () => {
    for (const [mailer, optional] of [
      [true, true],
      [true, false],
      [false, true],
      [false, false],
    ] as const) {
      const input = sources(false, mailer, optional);
      await expect(resolveIsEmailVerificationEnforced(input)).resolves.toBe(
        false,
      );
      expect(input.onMailerMissing).not.toHaveBeenCalled();
    }
  });

  it('only asks about the mailer when the switch is on', async () => {
    const off = sources(false, true, false);
    await resolveIsEmailVerificationEnforced(off);
    expect(off.isMailerConfigured).not.toHaveBeenCalled();
    expect(off.isMailerOptional).not.toHaveBeenCalled();
  });
});

describe('listMissingMailerSettings', () => {
  it('names the unset or blank settings', () => {
    expect(
      listMissingMailerSettings({
        GENFEEDAI_API_KEY: '  ',
        GENFEEDAI_MICROSERVICES_NOTIFICATIONS_URL: undefined,
      }),
    ).toEqual([
      'GENFEEDAI_API_KEY',
      'GENFEEDAI_MICROSERVICES_NOTIFICATIONS_URL',
    ]);
  });

  it('is empty when everything is set', () => {
    expect(
      listMissingMailerSettings({
        GENFEEDAI_API_KEY: 'key',
        GENFEEDAI_MICROSERVICES_NOTIFICATIONS_URL: 'http://n:3011',
      }),
    ).toEqual([]);
  });
});
