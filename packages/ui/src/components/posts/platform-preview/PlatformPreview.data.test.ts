import { CredentialPlatform } from '@genfeedai/contracts';
import type { IPost } from '@genfeedai/contracts/interfaces';
import { buildPostTargets } from '@ui/posts/platform-preview/PlatformPreview.data';
import { describe, expect, it } from 'vitest';

describe('buildPostTargets', () => {
  it('turns stored HTML descriptions into plain captions for every segment', () => {
    const post = {
      children: [{ description: '<p>Reply &amp; more</p>', id: 'child-1' }],
      description: '<p>First</p><p>Second</p>',
      id: 'post-1',
      platform: CredentialPlatform.TWITTER,
    } as unknown as IPost;

    const [target] = buildPostTargets(post, 'Genfeed', '@genfeed');

    expect(target?.caption).toBe('First\n\nSecond');
    expect(target?.threadSegments?.map((segment) => segment.caption)).toEqual([
      'First\n\nSecond',
      'Reply & more',
    ]);
  });
});
