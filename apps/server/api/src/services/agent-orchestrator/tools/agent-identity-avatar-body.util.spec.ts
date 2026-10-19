import { buildIdentityAvatarVideoBody } from '@api/services/agent-orchestrator/tools/agent-identity-avatar-body.util';
import { describe, expect, it } from 'vitest';

describe('buildIdentityAvatarVideoBody', () => {
  it('defaults to portrait', () => {
    expect(buildIdentityAvatarVideoBody('hi', {}, {})).toEqual({
      aspectRatio: '9:16',
      text: 'hi',
      useIdentity: true,
    });
  });

  it('picks the format from the platform', () => {
    expect(
      buildIdentityAvatarVideoBody('hi', { platform: 'twitter' }, {})
        .aspectRatio,
    ).toBe('16:9');
  });

  it('lets an explicit ratio beat the composer setting and platform', () => {
    expect(
      buildIdentityAvatarVideoBody(
        'hi',
        { aspectRatio: '1:1', platform: 'tiktok' },
        { generationSettings: { aspectRatio: '16:9' } as never },
      ).aspectRatio,
    ).toBe('1:1');
  });

  it('uses the composer ratio when the tool call has none', () => {
    expect(
      buildIdentityAvatarVideoBody(
        'hi',
        { aspectRatio: '4:5' },
        { generationSettings: { aspectRatio: '16:9' } as never },
      ).aspectRatio,
    ).toBe('16:9');
  });
});
