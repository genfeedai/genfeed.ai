import { testId } from '@genfeedai/helpers/testing/test-id.helper';
import {
  buildConversationScopeHref,
  extractAgentThreadIdFromPathname,
} from './conversation-scope-location';

describe('conversation scope location', () => {
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

  it('extracts standard agent thread ids and ignores entry routes', () => {
    const threadId = testId('thread');
    expect(extractAgentThreadIdFromPathname(`/agent/${threadId}`)).toBe(
      threadId,
    );
    expect(extractAgentThreadIdFromPathname('/agent/new')).toBeNull();
    expect(extractAgentThreadIdFromPathname('/agent/onboarding')).toBeNull();
    expect(extractAgentThreadIdFromPathname('/agent/journey')).toBeNull();
    expect(
      extractAgentThreadIdFromPathname('/agent/onboarding/thread-1'),
    ).toBeNull();
  });
});
