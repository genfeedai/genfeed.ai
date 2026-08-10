import {
  buildConversationScopeHref,
  buildOrganizationNewThreadHref,
  buildScopedThreadHref,
  extractAgentThreadIdFromPathname,
} from './conversation-scope-location';

describe('conversation scope location', () => {
  it('rewrites the brand while preserving the connected thread and canvas route', () => {
    expect(
      buildConversationScopeHref({
        brandSlug: 'brand-b',
        organizationSlug: 'acme',
        pathname: '/acme/brand-a/library/images',
        searchParams: new URLSearchParams(
          'thread=thread-1&overlay=asset&overlayRef=asset%3A1&filter=recent',
        ),
        threadId: 'thread-1',
      }),
    ).toBe('/acme/brand-b/library/images?thread=thread-1&filter=recent');
  });

  it('keeps thread ids in conversation paths instead of duplicating query state', () => {
    expect(
      buildConversationScopeHref({
        brandSlug: 'brand-b',
        organizationSlug: 'acme',
        pathname: '/acme/~/agent/thread-1',
        searchParams: new URLSearchParams('thread=thread-1'),
        threadId: 'thread-1',
      }),
    ).toBe('/acme/brand-b/agent/thread-1');
  });

  it('builds zero-carry organization and scoped-thread destinations', () => {
    expect(buildOrganizationNewThreadHref('other-org')).toBe(
      '/other-org/~/agent/new',
    );
    expect(buildScopedThreadHref('acme', 'brand-a', 'thread-1')).toBe(
      '/acme/brand-a/agent/thread-1',
    );
  });

  it('extracts standard agent thread ids and ignores entry routes', () => {
    expect(
      extractAgentThreadIdFromPathname('/agent/cmsjhy6ip0030wjxnrdi5axao'),
    ).toBe('cmsjhy6ip0030wjxnrdi5axao');
    expect(extractAgentThreadIdFromPathname('/agent/new')).toBeNull();
    expect(extractAgentThreadIdFromPathname('/agent/onboarding')).toBeNull();
    expect(extractAgentThreadIdFromPathname('/agent/journey')).toBeNull();
    expect(
      extractAgentThreadIdFromPathname('/agent/onboarding/thread-1'),
    ).toBeNull();
  });
});
