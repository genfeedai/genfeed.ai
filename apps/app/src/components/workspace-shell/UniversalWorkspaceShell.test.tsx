import { fireEvent, render, screen } from '@testing-library/react';
import { type ReactNode, useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

const navigation = vi.hoisted(() => ({
  pathname: '/acme/~/agent/thread-1',
  searchParams: new URLSearchParams(),
}));
const router = vi.hoisted(() => ({
  back: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}));
const agentState = vi.hoisted(() => ({
  activeThreadId: 'thread-1' as string | null,
}));
const agentActions = vi.hoisted(() => ({
  resetActiveConversationState: vi.fn(),
  setActiveThread: vi.fn(),
}));
const pageShellMount = vi.hoisted(() => vi.fn());
const agentApiService = {} as never;

vi.mock('@genfeedai/agent', () => ({
  useAgentChatStore: Object.assign(
    (selector: (state: typeof agentState) => unknown) => selector(agentState),
    {
      getState: () => ({ ...agentState, ...agentActions }),
    },
  ),
}));

vi.mock('@app/(protected)/[orgSlug]/~/agent/AgentWorkspacePageShell', () => ({
  AgentWorkspacePageShell: ({ threadId }: { threadId?: string }) => {
    useEffect(() => {
      pageShellMount();
    }, []);
    return (
      <div data-testid="persistent-agent-conversation">{threadId ?? 'new'}</div>
    );
  },
}));

vi.mock(
  '@app/(protected)/[orgSlug]/~/agent/AgentWorkspaceLayoutClient',
  () => ({
    AgentWorkspaceLayoutClient: ({ children }: { children: ReactNode }) => (
      <>{children}</>
    ),
  }),
);

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    orgHref: (href: string) => `/acme/~${href}`,
  }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => router,
  useSearchParams: () => navigation.searchParams,
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    ariaLabel,
    children,
    onClick,
  }: {
    ariaLabel?: string;
    children?: ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" aria-label={ariaLabel} onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock('@ui/primitives/dialog', () => ({
  Dialog: ({
    children,
    onOpenChange,
    open,
  }: {
    children: ReactNode;
    onOpenChange: (isOpen: boolean) => void;
    open: boolean;
  }) =>
    open ? (
      <div data-testid="workspace-dialog">
        {children}
        <button
          type="button"
          aria-label="Dismiss workspace overlay"
          onClick={() => onOpenChange(false)}
        />
      </div>
    ) : null,
  DialogContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
  DialogHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('@ui/primitives/drawer', () => ({
  Drawer: ({ children }: { children: ReactNode }) => <>{children}</>,
  DrawerContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DrawerDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
  DrawerHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DrawerTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('@/lib/workspace-shell/workspace-shell-telemetry', () => ({
  captureWorkspaceShellRestorationFailure: vi.fn(),
  captureWorkspaceShellTransition: vi.fn(),
}));

import UniversalWorkspaceShell from './UniversalWorkspaceShell';

describe('UniversalWorkspaceShell', () => {
  beforeEach(() => {
    navigation.pathname = '/acme/~/agent/thread-1';
    navigation.searchParams = new URLSearchParams();
    agentState.activeThreadId = 'thread-1';
    pageShellMount.mockClear();
    agentActions.resetActiveConversationState.mockClear();
    agentActions.setActiveThread.mockClear();
    router.back.mockClear();
    router.push.mockClear();
    router.replace.mockClear();
  });

  it('keeps the active conversation mounted while a registered canvas opens', () => {
    const view = render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div data-testid="canonical-canvas">Workspace overview</div>
      </UniversalWorkspaceShell>,
    );

    expect(
      screen.getByLabelText('Primary conversation workspace'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('persistent-agent-conversation'),
    ).toHaveTextContent('thread-1');
    expect(screen.getByLabelText('Context inspector')).toBeInTheDocument();
    expect(screen.queryByTestId('canonical-canvas')).not.toBeInTheDocument();

    navigation.pathname = '/acme/moonrise/workspace/overview';
    navigation.searchParams = new URLSearchParams();
    view.rerender(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div data-testid="canonical-canvas">Workspace overview</div>
      </UniversalWorkspaceShell>,
    );

    expect(
      screen.getByLabelText('Primary workspace canvas'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Context inspector')).toBeInTheDocument();
    expect(screen.getByTestId('canonical-canvas')).toBeInTheDocument();
    expect(
      screen.getByTestId('persistent-agent-conversation'),
    ).toHaveTextContent('thread-1');
    expect(pageShellMount).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith(
      '/acme/moonrise/workspace/overview?thread=thread-1',
    );
  });

  it('preserves the existing new-conversation reset on canonical agent entry', () => {
    navigation.pathname = '/acme/~/agent';
    agentState.activeThreadId = 'stale-thread';

    render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Routed agent page</div>
      </UniversalWorkspaceShell>,
    );

    expect(agentActions.setActiveThread).toHaveBeenCalledWith(null);
    expect(agentActions.resetActiveConversationState).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Routed agent page')).not.toBeInTheDocument();
  });

  it('restores an allowlisted temporary overlay above the canvas', () => {
    navigation.pathname = '/acme/moonrise/library/images';
    navigation.searchParams = new URLSearchParams({
      overlay: 'shell-preview',
      thread: 'thread-1',
    });

    render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Library</div>
      </UniversalWorkspaceShell>,
    );

    expect(screen.getByTestId('universal-workspace-shell')).toHaveAttribute(
      'data-shell-state',
      'overlay',
    );
    expect(screen.getByTestId('workspace-dialog')).toBeInTheDocument();
    expect(screen.getByText('Library')).toBeInTheDocument();
    expect(screen.getByLabelText('Context inspector')).toBeInTheDocument();
    expect(
      screen.getByTestId('persistent-agent-conversation'),
    ).toHaveTextContent('thread-1');
    expect(
      screen.getByText('No resource reference selected'),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss workspace overlay' }),
    );

    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith(
      '/acme/moonrise/library/images?thread=thread-1',
    );
  });

  it('pushes a registered overlay so browser Back owns UI dismissal', () => {
    navigation.pathname = '/acme/moonrise/workspace/overview';
    navigation.searchParams = new URLSearchParams({ thread: 'thread-1' });

    const view = render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Workspace</div>
      </UniversalWorkspaceShell>,
    );

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Open overlay preview' })[0],
    );

    expect(router.push).toHaveBeenCalledWith(
      '/acme/moonrise/workspace/overview?thread=thread-1&overlay=shell-preview',
    );

    navigation.searchParams = new URLSearchParams({
      overlay: 'shell-preview',
      thread: 'thread-1',
    });
    view.rerender(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Workspace</div>
      </UniversalWorkspaceShell>,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss workspace overlay' }),
    );

    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('lets browser Back dismiss the overlay before the canvas', () => {
    navigation.pathname = '/acme/moonrise/workspace/overview';
    navigation.searchParams = new URLSearchParams({
      overlay: 'shell-preview',
      thread: 'thread-1',
    });

    const view = render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div data-testid="underlying-canvas">Workspace</div>
      </UniversalWorkspaceShell>,
    );

    expect(screen.getByTestId('workspace-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('underlying-canvas')).toBeInTheDocument();

    navigation.searchParams = new URLSearchParams({ thread: 'thread-1' });
    view.rerender(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div data-testid="underlying-canvas">Workspace</div>
      </UniversalWorkspaceShell>,
    );

    expect(screen.queryByTestId('workspace-dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('underlying-canvas')).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('fails an unauthorized overlay reference to its underlying canvas', () => {
    navigation.pathname = '/acme/moonrise/library/images';
    navigation.searchParams = new URLSearchParams({
      folder: 'launch',
      overlay: 'shell-preview',
      overlayRef: 'asset:asset-1',
      thread: 'thread-1',
    });

    render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Library</div>
      </UniversalWorkspaceShell>,
    );

    expect(screen.queryByTestId('workspace-dialog')).not.toBeInTheDocument();
    expect(router.replace).toHaveBeenCalledWith(
      '/acme/moonrise/library/images?folder=launch&thread=thread-1',
    );
  });

  it('does not retain a conversation when the canonical organization changes', () => {
    const view = render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Workspace</div>
      </UniversalWorkspaceShell>,
    );

    navigation.pathname = '/other-org/other-brand/workspace/overview';
    navigation.searchParams = new URLSearchParams();
    view.rerender(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Other workspace</div>
      </UniversalWorkspaceShell>,
    );

    expect(
      screen.getByTestId('persistent-agent-conversation'),
    ).toHaveTextContent('new');
    expect(router.replace).not.toHaveBeenCalledWith(
      expect.stringContaining('thread=thread-1'),
    );
  });

  it('canonicalizes an unknown overlay without leaving the current route', () => {
    navigation.pathname = '/acme/moonrise/posts/calendar';
    navigation.searchParams = new URLSearchParams({
      overlay: 'untrusted-output',
      taskId: 'task-1',
      thread: 'thread-1',
    });

    render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Calendar</div>
      </UniversalWorkspaceShell>,
    );

    expect(router.replace).toHaveBeenCalledWith(
      '/acme/moonrise/posts/calendar?taskId=task-1&thread=thread-1',
    );
  });
});
