import { useAgentPageContext } from '@genfeedai/agent/hooks/use-agent-page-context';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { MemberRole } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pathnameRef = { current: '/' };
const brandRef: { current: { agentConfig?: unknown } | null } = {
  current: null,
};

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameRef.current,
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ selectedBrand: brandRef.current }),
}));

function renderAt(pathname: string, role?: MemberRole) {
  pathnameRef.current = pathname;
  return renderHook(() => useAgentPageContext(role));
}

describe('useAgentPageContext', () => {
  beforeEach(() => {
    brandRef.current = null;
    useAgentChatStore.setState({ pageContext: null });
  });

  it('falls back to the default context for an unmapped route', () => {
    const { result } = renderAt('/org/brand/definitely-not-a-route');

    expect(result.current.placeholder).toBe('Ask me anything...');
    expect(result.current.suggestedActions).toHaveLength(3);
  });

  it('resolves a mapped route after stripping the org and brand segments', () => {
    const { result } = renderAt(`/acme/main${APP_ROUTES.ANALYTICS.ROOT}`);

    expect(result.current.placeholder).toBe('Ask about your analytics...');
  });

  it('resolves a tilde personal-scope path the same way', () => {
    const { result } = renderAt(`/acme/~${APP_ROUTES.ANALYTICS.ROOT}`);

    expect(result.current.placeholder).toBe('Ask about your analytics...');
  });

  it('leaves short paths unnormalized', () => {
    const { result } = renderAt(APP_ROUTES.ANALYTICS.ROOT);

    expect(result.current.placeholder).toBe('Ask about your analytics...');
  });

  it('prefers the longest matching route prefix', () => {
    const insights = renderAt(`/acme/main${APP_ROUTES.ANALYTICS.INSIGHTS}`);

    expect(insights.result.current.placeholder).toBe(
      'Ask about your AI insights...',
    );
  });

  it('matches by prefix for nested detail routes', () => {
    const { result } = renderAt(
      `/acme/main${APP_ROUTES.ANALYTICS.ROOT}/some-detail-page`,
    );

    expect(result.current.placeholder).toBe('Ask about your analytics...');
  });

  it('publishes the context into the chat store keyed by the raw pathname', () => {
    const pathname = `/acme/main${APP_ROUTES.ANALYTICS.ROOT}`;
    const { result } = renderAt(pathname);

    const stored = useAgentChatStore.getState().pageContext;

    expect(stored?.route).toBe(pathname);
    expect(stored?.placeholder).toBe(result.current.placeholder);
    expect(stored?.suggestedActions).toEqual(result.current.suggestedActions);
  });

  it('clears its own context from the store on unmount', () => {
    const { unmount } = renderAt(`/acme/main${APP_ROUTES.ANALYTICS.ROOT}`);

    expect(useAgentChatStore.getState().pageContext).not.toBeNull();

    unmount();

    expect(useAgentChatStore.getState().pageContext).toBeNull();
  });

  it('leaves a foreign route context in the store untouched on unmount', () => {
    const { unmount } = renderAt(`/acme/main${APP_ROUTES.ANALYTICS.ROOT}`);

    useAgentChatStore.setState({
      pageContext: { route: '/somewhere/else', suggestedActions: [] },
    });
    unmount();

    expect(useAgentChatStore.getState().pageContext?.route).toBe(
      '/somewhere/else',
    );
  });

  it('does not overwrite an existing context that carries a draft type', () => {
    const pathname = `/acme/main${APP_ROUTES.ANALYTICS.ROOT}`;
    pathnameRef.current = pathname;
    useAgentChatStore.setState({
      pageContext: {
        draftType: 'post',
        placeholder: 'Keep me',
        route: pathname,
        suggestedActions: [],
      },
    });

    renderHook(() => useAgentPageContext());

    expect(useAgentChatStore.getState().pageContext?.placeholder).toBe(
      'Keep me',
    );
  });

  it('caps role-filtered fallback actions at three', () => {
    const { result } = renderAt(
      `/acme/main${APP_ROUTES.ANALYTICS.ROOT}`,
      MemberRole.MEMBER,
    );

    expect(result.current.suggestedActions.length).toBeLessThanOrEqual(3);
  });

  it('prefers brand-personalized suggestions over the route defaults', () => {
    brandRef.current = {
      agentConfig: {
        strategy: { topics: ['launch week', 'pricing'] },
        voice: { audience: ['founders'], tone: 'direct' },
      },
    };

    const { result } = renderAt(`/acme/main${APP_ROUTES.ANALYTICS.ROOT}`);
    const labels = result.current.suggestedActions.map((a) => a.label);

    expect(labels).toEqual([
      'Analyze launch week',
      'Grow pricing',
      'Remix launch week',
    ]);
    // The placeholder still comes from the route map.
    expect(result.current.placeholder).toBe('Ask about your analytics...');
  });

  it('falls back to route defaults when the brand config yields no topics', () => {
    brandRef.current = { agentConfig: { voice: { tone: 'direct' } } };

    const { result } = renderAt(`/acme/main${APP_ROUTES.ANALYTICS.ROOT}`);
    const labels = result.current.suggestedActions.map((a) => a.label);

    expect(labels).toContain('Compare');
  });
});
