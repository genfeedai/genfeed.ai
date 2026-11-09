import { AssetScope, Platform } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import { defaultComposerCredentialIds } from './genfeed-profile-default.helper';

const profile = { id: 'gf', isConnected: true, platform: Platform.GENFEED };
const x = { id: 'x', isConnected: true, platform: Platform.TWITTER };

describe('defaultComposerCredentialIds', () => {
  it.each([
    [
      'a public brand starts on its profile',
      [x, profile],
      AssetScope.PUBLIC,
      ['gf'],
    ],
    ['a lowercase public scope counts', [profile], 'public', ['gf']],
    [
      'a private brand starts with nothing',
      [x, profile],
      AssetScope.ORGANIZATION,
      [],
    ],
    ['an unknown scope starts with nothing', [profile], undefined, []],
    ['no profile channel starts with nothing', [x], AssetScope.PUBLIC, []],
    [
      'a turned-off profile starts with nothing',
      [{ ...profile, isConnected: false }],
      AssetScope.PUBLIC,
      [],
    ],
  ])('%s', (_name, credentials, scope, expected) => {
    expect(defaultComposerCredentialIds(credentials, scope)).toEqual(expected);
  });
});
