import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AgentConversationRouteHost from './AgentConversationRouteHost';

const pathnameState = { current: '/test-org/~/agent' };
const searchState = { current: '' };
const shellRenderSpy = vi.fn();
const shellMountSpy = vi.fn();
const shellUnmountSpy = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameState.current,
  useSearchParams: () => new URLSearchParams(searchState.current),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    key === 'exitFullPage' ? 'Back to master and threads' : key,
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

vi.mock('./AgentMasterWorkspace', () => ({
  default: ({ openThreadId }: { openThreadId: string | null }) => (
    <div data-testid="master-workspace">{openThreadId ?? 'list'}</div>
  ),
}));

function setLocation(url: string | null) {
  const [pathname, search = ''] = url === null ? [null] : url.split('?');
  pathnameState.current = pathname as string;
  searchState.current = search;
}

function renderHost(url: string | null) {
  setLocation(url);
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

  it('exposes the documented default export', () => {
    expect(typeof AgentConversationRouteHost).toBe('function');
    expect(AgentConversationRouteHost.name).toBe('AgentConversationRouteHost');
  });

  it('renders the master workspace ahead of the route page on /agent', () => {
    const { getByTestId, queryByTestId } = renderHost('/test-org/~/agent');

    const workspace = getByTestId('master-workspace');
    const page = getByTestId('route-page');

    expect(queryByTestId('conversation-shell')).toBeNull();
    expect(
      workspace.compareDocumentPosition(page) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('renders a single full-page conversation on /agent/new', () => {
    const { getByTestId, queryByTestId } = renderHost('/test-org/~/agent/new');

    expect(getByTestId('conversation-shell')).toHaveTextContent('none');
    expect(queryByTestId('master-workspace')).toBeNull();
  });

  it('shows the Threads list beside the master on /agent/threads', () => {
    const { getByTestId, queryByTestId } = renderHost(
      '/test-org/~/agent/threads',
    );

    expect(getByTestId('master-workspace')).toHaveTextContent('list');
    expect(queryByTestId('conversation-shell')).toBeNull();
  });

  it('opens the thread named in the URL beside the master on /agent/[id]', () => {
    const { getByTestId, queryByTestId } = renderHost(
      '/test-org/~/agent/thread-1',
    );

    expect(getByTestId('master-workspace')).toHaveTextContent('thread-1');
    expect(queryByTestId('conversation-shell')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Back to master and threads' }),
    ).toBeNull();
  });

  it('renders a thread full size on /agent/[id]?view=full with a way back to the two columns', () => {
    const pushState = vi.spyOn(window.history, 'pushState');
    const { getByTestId, queryByTestId } = renderHost(
      '/test-org/~/agent/thread-1?view=full',
    );

    expect(getByTestId('conversation-shell')).toHaveTextContent('thread-1');
    expect(queryByTestId('master-workspace')).toBeNull();

    fireEvent.click(
      screen.getByRole('button', { name: 'Back to master and threads' }),
    );

    expect(pushState).toHaveBeenCalledWith(
      null,
      '',
      '/test-org/~/agent/thread-1',
    );
    pushState.mockRestore();
  });

  it('serves no full view from the retired /agent/[id]/full path', () => {
    const { queryByTestId, getByTestId } = renderHost(
      '/test-org/~/agent/thread-1/full',
    );

    expect(queryByTestId('conversation-shell')).toBeNull();
    expect(queryByTestId('master-workspace')).toBeNull();
    expect(getByTestId('route-page')).toBeInTheDocument();
  });

  it('has no way back on /agent/new, which has no thread to return from', () => {
    renderHost('/test-org/~/agent/new');

    expect(
      screen.queryByRole('button', { name: 'Back to master and threads' }),
    ).toBeNull();
  });

  it('keeps one mounted shell while the full-size thread changes', () => {
    const { rerender, getByTestId } = renderHost(
      '/test-org/~/agent/thread-1?view=full',
    );
    expect(getByTestId('conversation-shell')).toHaveTextContent('thread-1');
    expect(shellMountSpy).toHaveBeenCalledTimes(1);

    setLocation('/test-org/~/agent/thread-2?view=full');
    rerender(
      <AgentConversationRouteHost>
        <div data-testid="route-page" />
      </AgentConversationRouteHost>,
    );

    expect(getByTestId('conversation-shell')).toHaveTextContent('thread-2');
    expect(shellMountSpy).toHaveBeenCalledTimes(1);
    expect(shellUnmountSpy).not.toHaveBeenCalled();

    setLocation('/test-org/~/agent/new');
    rerender(
      <AgentConversationRouteHost>
        <div data-testid="route-page" />
      </AgentConversationRouteHost>,
    );

    expect(getByTestId('conversation-shell')).toHaveTextContent('none');
    expect(shellMountSpy).toHaveBeenCalledTimes(1);
    expect(shellUnmountSpy).not.toHaveBeenCalled();
  });

  it('wraps the conversation in a full-height frame', () => {
    const { getByTestId } = renderHost('/test-org/~/agent/thread-9?view=full');

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

  it('passes no thread id for a malformed full-size thread id', () => {
    renderHost('/test-org/~/agent/undefined?view=full');

    expect(shellRenderSpy).toHaveBeenLastCalledWith(undefined);
  });

  it('keeps the conversation shell mounted when pathname is unresolved', () => {
    const { getByTestId } = renderHost(null);

    expect(getByTestId('conversation-shell')).toHaveTextContent('none');
    expect(getByTestId('route-page')).toBeInTheDocument();
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
