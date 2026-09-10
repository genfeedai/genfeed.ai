import { CredentialPlatform, PostFormat } from '@genfeedai/contracts';
import {
  DEFAULT_CHAR_LIMIT,
  resolvePlatformCharLimit,
  resolvePlatformLabel,
  X_LONG_FORM_CHAR_LIMIT,
} from '@ui-constants/platform-char-limit.constant';
import { describe, expect, it } from 'vitest';

describe('resolvePlatformCharLimit', () => {
  it('reads the limit from the channel capability catalog', () => {
    expect(resolvePlatformCharLimit(CredentialPlatform.TWITTER)).toBe(280);
    expect(resolvePlatformCharLimit(CredentialPlatform.LINKEDIN)).toBe(3000);
    expect(resolvePlatformCharLimit(CredentialPlatform.FACEBOOK)).toBe(63_206);
    expect(resolvePlatformCharLimit(CredentialPlatform.THREADS)).toBe(500);
  });

  it('lifts the X limit for long-form posts', () => {
    expect(
      resolvePlatformCharLimit(
        CredentialPlatform.TWITTER,
        PostFormat.LONG_FORM,
      ),
    ).toBe(X_LONG_FORM_CHAR_LIMIT);
  });

  it('keeps the long-form lift specific to X', () => {
    expect(
      resolvePlatformCharLimit(
        CredentialPlatform.LINKEDIN,
        PostFormat.LONG_FORM,
      ),
    ).toBe(3000);
  });

  it('falls back when no channel is selected or catalogued', () => {
    expect(resolvePlatformCharLimit(undefined)).toBe(DEFAULT_CHAR_LIMIT);
    expect(resolvePlatformCharLimit('not-a-channel')).toBe(DEFAULT_CHAR_LIMIT);
  });
});

describe('resolvePlatformLabel', () => {
  it('uses the catalogued channel name', () => {
    expect(resolvePlatformLabel(CredentialPlatform.TWITTER)).toBe(
      'X (Twitter)',
    );
  });

  it('falls back to the raw platform for an unknown channel', () => {
    expect(resolvePlatformLabel('carrier-pigeon')).toBe('carrier-pigeon');
    expect(resolvePlatformLabel(undefined)).toBe('');
  });
});
