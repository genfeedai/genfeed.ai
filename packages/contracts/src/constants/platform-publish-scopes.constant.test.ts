import { describe, expect, it } from 'vitest';
import { CredentialPlatform } from '..';
import {
  getRequiredPublishScopes,
  PLATFORM_REQUIRED_PUBLISH_SCOPES,
} from './platform-publish-scopes.constant';

describe('PLATFORM_REQUIRED_PUBLISH_SCOPES', () => {
  it('declares the publish permission each connected publishing platform needs', () => {
    expect(
      PLATFORM_REQUIRED_PUBLISH_SCOPES[CredentialPlatform.TWITTER],
    ).toEqual(['tweet.write']);
    expect(PLATFORM_REQUIRED_PUBLISH_SCOPES[CredentialPlatform.TIKTOK]).toEqual(
      ['video.publish'],
    );
    expect(
      PLATFORM_REQUIRED_PUBLISH_SCOPES[CredentialPlatform.YOUTUBE],
    ).toEqual(['https://www.googleapis.com/auth/youtube.upload']);
    expect(
      PLATFORM_REQUIRED_PUBLISH_SCOPES[CredentialPlatform.LINKEDIN],
    ).toEqual(['w_member_social']);
    expect(
      PLATFORM_REQUIRED_PUBLISH_SCOPES[CredentialPlatform.INSTAGRAM],
    ).toEqual(['instagram_content_publish']);
    expect(
      PLATFORM_REQUIRED_PUBLISH_SCOPES[CredentialPlatform.FACEBOOK],
    ).toEqual(['pages_manage_posts']);
    expect(PLATFORM_REQUIRED_PUBLISH_SCOPES[CredentialPlatform.FANVUE]).toEqual(
      ['write:media', 'write:post'],
    );
  });

  it('leaves platforms without a declared publish scope unknown', () => {
    expect(getRequiredPublishScopes(CredentialPlatform.REDDIT)).toBeUndefined();
    expect(getRequiredPublishScopes('not-a-platform')).toBeUndefined();
  });
});
