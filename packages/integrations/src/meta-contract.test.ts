import { describe, expect, it } from 'vitest';
import { getIntegrationProviderDefinition } from './catalog';
import {
  FACEBOOK_OAUTH_SCOPES,
  INSTAGRAM_OAUTH_SCOPES,
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
  it('requests grants required by comments, insights, conversations and private replies', () => {
    expect(FACEBOOK_OAUTH_SCOPES).toEqual(
      expect.arrayContaining([
        'pages_manage_engagement',
        'read_insights',
        'pages_show_list',
      ]),
    );
    expect(INSTAGRAM_OAUTH_SCOPES).toEqual(
      expect.arrayContaining([
        'instagram_manage_comments',
        'instagram_manage_insights',
        'instagram_manage_messages',
        'pages_manage_metadata',
        'pages_messaging',
        'pages_show_list',
      ]),
    );
  });
});
