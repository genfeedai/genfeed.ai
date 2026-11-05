import { CredentialPlatform } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import {
  resolveChannelDescription,
  resolveChannelLabel,
} from './batch-post.utils';

describe('resolveChannelDescription', () => {
  it.each([
    ['its own caption', 'TikTok cut', 'Shared caption', 'TikTok cut'],
    ['the shared caption when empty', '', 'Shared caption', 'Shared caption'],
    [
      'the shared caption when blank',
      '   ',
      'Shared caption',
      'Shared caption',
    ],
    ['nothing when neither is set', '', undefined, ''],
  ])('uses %s', (_case, description, shared, expected) => {
    expect(resolveChannelDescription({ description }, shared)).toBe(expected);
  });
});

describe('resolveChannelLabel', () => {
  it.each([
    [
      'its own title',
      CredentialPlatform.YOUTUBE,
      'Long title',
      'Shared',
      'Long title',
    ],
    [
      'the shared title when empty',
      CredentialPlatform.TIKTOK,
      '',
      'Shared',
      'Shared',
    ],
    ['no title on X', CredentialPlatform.TWITTER, 'Ignored', 'Shared', ''],
  ])('uses %s', (_case, platform, label, shared, expected) => {
    expect(resolveChannelLabel({ label, platform }, shared)).toBe(expected);
  });
});
