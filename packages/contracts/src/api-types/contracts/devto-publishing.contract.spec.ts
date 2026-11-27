import { describe, expect, it } from 'vitest';
import { CredentialPlatform } from '../..';
import { resolveChannelTargetSettings } from './channel-capabilities.contract';

describe('Dev.to target settings', () => {
  it('keeps a saveAsDraft choice and the other publishing settings', () => {
    expect(
      resolveChannelTargetSettings(CredentialPlatform.DEV_TO, {
        canonicalUrl: 'https://genfeed.ai/a',
        saveAsDraft: true,
        series: 'Genfeed',
        tags: 'webdev',
      }),
    ).toEqual({
      canonicalUrl: 'https://genfeed.ai/a',
      saveAsDraft: true,
      series: 'Genfeed',
      tags: 'webdev',
    });
  });

  it('publishes by default and drops a saveAsDraft value that is not a boolean', () => {
    expect(
      resolveChannelTargetSettings(CredentialPlatform.DEV_TO, {}),
    ).toMatchObject({ saveAsDraft: false });
    expect(
      resolveChannelTargetSettings(CredentialPlatform.DEV_TO, {
        saveAsDraft: 'yes',
      }),
    ).toMatchObject({ saveAsDraft: false });
  });
});
