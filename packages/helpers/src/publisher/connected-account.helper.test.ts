import {
  accountHealthToConnectedAccount,
  formatAccountHandle,
  toConnectedAccount,
} from '@helpers/publisher/connected-account.helper';
import { describe, expect, it } from 'vitest';

describe('formatAccountHandle', () => {
  it.each([
    ['genfeedai', '@genfeedai'],
    ['@genfeedai', '@genfeedai'],
    ['  @genfeedai ', '@genfeedai'],
    ['', null],
    [null, null],
    [undefined, null],
  ])('formats %j as %j', (input, expected) => {
    expect(formatAccountHandle(input)).toBe(expected);
  });
});

describe('toConnectedAccount', () => {
  it('maps the real avatar, handle and the operator label of a credential', () => {
    expect(
      toConnectedAccount({
        externalAvatar: 'https://cdn.example/avatar.png',
        externalHandle: 'genfeedai',
        externalName: 'Genfeed AI',
        label: 'Main TikTok',
        platform: 'tiktok',
      } as Parameters<typeof toConnectedAccount>[0]),
    ).toEqual({
      avatarUrl: 'https://cdn.example/avatar.png',
      handle: 'genfeedai',
      name: 'Main TikTok',
      platform: 'tiktok',
    });
  });

  it('falls back to the provider name when there is no label', () => {
    expect(
      toConnectedAccount({
        externalName: 'Genfeed AI',
        platform: 'youtube',
      } as Parameters<typeof toConnectedAccount>[0]),
    ).toEqual({
      avatarUrl: null,
      handle: null,
      name: 'Genfeed AI',
      platform: 'youtube',
    });
  });
});

describe('accountHealthToConnectedAccount', () => {
  it('maps a health summary onto the same shape', () => {
    expect(
      accountHealthToConnectedAccount({
        avatarUrl: 'https://cdn.example/avatar.png',
        handle: 'genfeedai',
        label: 'Genfeed',
        platform: 'instagram',
      } as Parameters<typeof accountHealthToConnectedAccount>[0]),
    ).toEqual({
      avatarUrl: 'https://cdn.example/avatar.png',
      handle: 'genfeedai',
      name: 'Genfeed',
      platform: 'instagram',
    });
  });
});
