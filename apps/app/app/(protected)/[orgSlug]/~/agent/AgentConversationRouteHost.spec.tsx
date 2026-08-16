import { render } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentConversationRouteHost } from './AgentConversationRouteHost';

const pathnameState = { current: '/test-org/~/agent' };
const shellRenderSpy = vi.fn();
const shellMountSpy = vi.fn();
const shellUnmountSpy = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameState.current,
}));

vi.mock('./AgentWorkspacePageShell', () => ({
  AgentWorkspacePageShell: ({ threadId }: { threadId?: string }) => {
    shellRenderSpy(threadId);
    useEffect(() => {
      shellMountSpy();
      return () => {
        shellUnmountSpy();
      };
    }, []);
    return <div data-testid="conversation-shell">{threadId ?? 'none'}</div>;
  },
}));

function renderHost(pathname: string) {
  pathnameState.current = pathname;
  return render(
    <AgentConversationRouteHost>
      <div data-testid="route-page" />
    </AgentConversationRouteHost>,
  );
}

describe('AgentConversationRouteHost', () => {
  beforeEach(() => {
    shellRenderSpy.mockClear();
    shellMountSpy.mockClear();
    shellUnmountSpy.mockClear();
  });

  it('renders the conversation shell ahead of the route page on /agent', () => {
    const { getByTestId } = renderHost('/test-org/~/agent');

    const shell = getByTestId('conversation-shell');
    const page = getByTestId('route-page');

    expect(shell).toHaveTextContent('none');
    expect(
      shell.compareDocumentPosition(page) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('keeps one mounted shell while the thread route changes', () => {
    const { rerender, getByTestId } = renderHost('/test-org/~/agent/thread-1');
    expect(getByTestId('conversation-shell')).toHaveTextContent('thread-1');
    expect(shellMountSpy).toHaveBeenCalledTimes(1);

    pathnameState.current = '/test-org/~/agent/thread-2';
    rerender(
      <AgentConversationRouteHost>
        <div data-testid="route-page" />
      </AgentConversationRouteHost>,
    );

    expect(getByTestId('conversation-shell')).toHaveTextContent('thread-2');
    expect(shellMountSpy).toHaveBeenCalledTimes(1);
    expect(shellUnmountSpy).not.toHaveBeenCalled();

    pathnameState.current = '/test-org/~/agent/new';
    rerender(
      <AgentConversationRouteHost>
        <div data-testid="route-page" />
      </AgentConversationRouteHost>,
    );

    expect(getByTestId('conversation-shell')).toHaveTextContent('none');
    expect(shellMountSpy).toHaveBeenCalledTimes(1);
    expect(shellUnmountSpy).not.toHaveBeenCalled();
  });

  it('wraps onboarding conversations in the focused onboarding frame', () => {
    const { getByTestId } = renderHost('/test-org/~/agent/onboarding/thread-9');

    const shell = getByTestId('conversation-shell');
    expect(shell).toHaveTextContent('thread-9');
    expect(shell.parentElement).toHaveClass(
      'relative',
      'flex',
      'h-full',
      'min-h-0',
      'flex-1',
      'flex-col',
      'overflow-hidden',
    );
  });

  it('passes no thread id for malformed thread segments', () => {
    renderHost('/test-org/~/agent/undefined');

    expect(shellRenderSpy).toHaveBeenLastCalledWith(undefined);
  });

  it('renders only the route page outside conversation routes', () => {
    const { queryByTestId, getByTestId } = renderHost(
      '/test-org/~/agent/journey',
    );

    expect(queryByTestId('conversation-shell')).toBeNull();
    expect(getByTestId('route-page')).toBeInTheDocument();
    expect(shellRenderSpy).not.toHaveBeenCalled();
  });
});
