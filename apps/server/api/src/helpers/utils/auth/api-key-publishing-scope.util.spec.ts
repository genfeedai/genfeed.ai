import {
  assertApiKeyPublishingScope,
  isPublishingMcpApprovalTool,
} from '@api/helpers/utils/auth/api-key-publishing-scope.util';
import { ApiKeyScope } from '@genfeedai/contracts';
import { ForbiddenException } from '@nestjs/common';

describe('API key publishing scope policy', () => {
  it('accepts the canonical draft scope', () => {
    expect(() =>
      assertApiKeyPublishingScope(
        { isApiKey: true, scopes: [ApiKeyScope.POSTS_DRAFT] },
        'draft',
      ),
    ).not.toThrow();
  });

  it('keeps posts:create as a draft-only compatibility alias', () => {
    expect(() =>
      assertApiKeyPublishingScope(
        { isApiKey: true, scopes: [ApiKeyScope.POSTS_CREATE] },
        'draft',
      ),
    ).not.toThrow();
    expect(() =>
      assertApiKeyPublishingScope(
        { isApiKey: true, scopes: [ApiKeyScope.POSTS_CREATE] },
        'schedule',
      ),
    ).toThrow(ForbiddenException);
  });

  it.each([
    ['schedule', ApiKeyScope.POSTS_SCHEDULE],
    ['approve', ApiKeyScope.POSTS_APPROVE],
    ['publish', ApiKeyScope.POSTS_PUBLISH],
  ] as const)('requires the exact %s scope', (capability, scope) => {
    expect(() =>
      assertApiKeyPublishingScope(
        { isApiKey: true, scopes: [scope] },
        capability,
      ),
    ).not.toThrow();
    expect(() =>
      assertApiKeyPublishingScope(
        { isApiKey: true, scopes: [` ${scope}`] },
        capability,
      ),
    ).toThrow(ForbiddenException);
  });

  it('fails closed when API key scope metadata is missing', () => {
    let thrown: unknown;
    try {
      assertApiKeyPublishingScope(
        { isApiKey: true, scopes: undefined },
        'draft',
      );
    } catch (error: unknown) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      response: expect.objectContaining({
        code: 'API_KEY_PUBLISHING_SCOPE_REQUIRED',
      }),
    });
  });

  it('does not change Better Auth or local identity behavior', () => {
    expect(() =>
      assertApiKeyPublishingScope(
        { isApiKey: false, scopes: undefined },
        'publish',
      ),
    ).not.toThrow();
    expect(() =>
      assertApiKeyPublishingScope(
        { isApiKey: undefined, scopes: undefined },
        'publish',
      ),
    ).not.toThrow();
  });

  it('identifies only deferred MCP tools that can publish', () => {
    expect(isPublishingMcpApprovalTool('create_scheduled_release')).toBe(true);
    expect(isPublishingMcpApprovalTool('post_social_reply')).toBe(true);
    expect(isPublishingMcpApprovalTool('create_article')).toBe(false);
    expect(isPublishingMcpApprovalTool('generate_image')).toBe(false);
    expect(isPublishingMcpApprovalTool('schedule_post')).toBe(false);
  });
});
