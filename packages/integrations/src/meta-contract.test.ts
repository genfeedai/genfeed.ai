import { describe, expect, it } from 'vitest';
import { getIntegrationProviderDefinition } from './catalog';
import {
  FACEBOOK_OAUTH_SCOPES,
  INSTAGRAM_UNIFIED_LOGIN_DIALOG_URL,
  INSTAGRAM_UNIFIED_LOGIN_PERMISSIONS,
  META_GRAPH_API_VERSION,
  THREADS_API_VERSION,
} from './constants';

describe('Meta API contract defaults', () => {
  it('uses the shared Graph version for both Marketing OAuth endpoints', () => {
    const provider = getIntegrationProviderDefinition('meta_ads');
    expect(provider?.oauth?.authorizationUrl).toBe(
      `https://www.facebook.com/${META_GRAPH_API_VERSION}/dialog/oauth`,
    );
    expect(provider?.oauth?.tokenUrl).toBe(
      `https://graph.facebook.com/${META_GRAPH_API_VERSION}/oauth/access_token`,
    );
    expect(META_GRAPH_API_VERSION).toBe('v26.0');
    expect(THREADS_API_VERSION).toBe('v1.0');
  });
  it('requests the Facebook Page grants required by comments and insights', () => {
    expect(FACEBOOK_OAUTH_SCOPES).toEqual(
      expect.arrayContaining([
        'pages_manage_engagement',
        'read_insights',
        'pages_show_list',
      ]),
    );
  });
  it('needs no Facebook Page permission for Instagram Unified Login', () => {
    expect([...INSTAGRAM_UNIFIED_LOGIN_PERMISSIONS].sort()).toEqual([
      'instagram_basic',
      'instagram_content_publish',
      'instagram_manage_comments',
      'instagram_manage_insights',
      'instagram_manage_messages',
    ]);
    expect(INSTAGRAM_UNIFIED_LOGIN_DIALOG_URL).toBe(
      'https://www.facebook.com/dialog/oauth',
    );
  });
});
