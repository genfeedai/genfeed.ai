import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  type ButtonHTMLAttributes,
  type ReactNode,
  useEffect,
  useMemo,
} from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import {
  useWorkspaceInspector,
  WorkspaceInspectorProvider,
} from './WorkspaceInspectorContext';
import { useRegisterWorkspaceSurfaceAdapter } from './WorkspaceSurfaceAdapterContext';

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
  seedComposer: vi.fn(),
  threads: [
    {
      brandId: 'brand-1',
      contextVersion: 3,
      id: 'thread-1',
    },
  ],
  updateThread: vi.fn(),
}));
const agentActions = vi.hoisted(() => ({
  resetActiveConversationState: vi.fn(),
  setActiveThread: vi.fn(),
}));
const inspectorConversationMount = vi.hoisted(() => vi.fn());
const updateThreadContextEffect = vi.hoisted(() => vi.fn());
const agentApiService = {
  updateThreadContextEffect,
} as never;

vi.mock('@genfeedai/agent', () => ({
  ConversationComposerShellProvider: ({
    artifactReferences,
    brandId,
    children,
    dispatchAction,
    draftScopeKey,
    isComposerVisible,
    portalTarget,
    scopeControls,
  }: {
    artifactReferences?: ReadonlyArray<{
      reference: { recordId: string };
    }>;
    brandId?: string;
    children: ReactNode;
    dispatchAction: (invocation: {
      action: {
        isConsequentialProposal: boolean;
        label: string;
        name: string;
        requiredScope: string;
        route: string;
      };
      arguments: string;
    }) => void;
    draftScopeKey: string;
    isComposerVisible?: boolean;
    portalTarget?: HTMLElement | null;
    scopeControls?: ReactNode;
  }) => (
    <div
      data-composer-brand={brandId}
      data-composer-references={artifactReferences
        ?.map((item) => item.reference.recordId)
        .join(',')}
      data-composer-visible={String(isComposerVisible)}
      data-composer-target={
        portalTarget?.dataset.testid ?? (portalTarget ? 'unknown' : 'inline')
      }
      data-draft-scope={draftScopeKey}
    >
      {children}
      {scopeControls}
      <button
        aria-label="Dispatch publish action"
        onClick={() =>
          dispatchAction({
            action: {
              isConsequentialProposal: true,
              label: 'Publish',
              name: 'publish',
              requiredScope: 'brand',
              route: '/posts/review',
            },
            arguments: 'post-1',
          })
        }
        type="button"
      />
      <button
        aria-label="Dispatch workflow action"
        onClick={() =>
          dispatchAction({
            action: {
              isConsequentialProposal: false,
              label: 'Workflow',
              name: 'workflow',
              requiredScope: 'brand',
              route: '/workflows',
            },
            arguments: '',
          })
        }
        type="button"
      />
      <button
        aria-label="Dispatch forged publish action"
        onClick={() =>
          dispatchAction({
            action: {
              isConsequentialProposal: true,
              label: 'Publish',
              name: 'publish',
              requiredScope: 'brand',
              route: '/posts/calendar',
            },
            arguments: 'post-1',
          })
        }
        type="button"
      />
      <button
        aria-label="Dispatch remix action"
        onClick={() =>
          dispatchAction({
            action: {
              isConsequentialProposal: false,
              label: 'Remix',
              name: 'remix',
              requiredScope: 'brand',
              route: '/posts/remix',
            },
            arguments: '',
          })
        }
        type="button"
      />
    </div>
  ),
  ConversationInspectorShellProvider: ({
    children,
    isActive,
  }: {
    children: ReactNode;
    isActive: boolean;
  }) => (
    <div
      data-active={String(isActive)}
      data-testid="conversation-inspector-provider"
    >
      {children}
    </div>
  ),
  getConversationComposerAction: (name: string) => {
    if (name === 'publish' || name === 'remix') {
      return {
        isConsequentialProposal: name === 'publish',
        label: name === 'publish' ? 'Publish' : 'Remix',
        name,
        requiredScope: 'brand',
        route: name === 'publish' ? '/posts/review' : '/posts/remix',
      };
    }
    if (name === 'workflow') {
      return {
        isConsequentialProposal: false,
        label: 'Workflow',
        name: 'workflow',
        requiredScope: 'brand',
        route: '/workflows',
      };
    }
    return null;
  },
  ConversationInspectorPanel: ({
    onOpenConversation,
  }: {
    onOpenConversation?: () => void;
  }) => {
    useEffect(() => {
      inspectorConversationMount();
    }, []);
    return (
      <div data-testid="inspector-conversation">
        <button
          aria-label="Open full conversation"
          onClick={onOpenConversation}
          type="button"
        />
      </div>
    );
  },
  runAgentApiEffect: (effect: Promise<unknown>) => effect,
  useAgentChatStore: Object.assign(
    (selector: (state: typeof agentState) => unknown) => selector(agentState),
    {
      getState: () => ({ ...agentState, ...agentActions }),
    },
  ),
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
    brandSlug: navigation.pathname.includes('/moonrise/') ? 'moonrise' : '',
    href: (href: string) => `/acme/moonrise${href}`,
    orgHref: (href: string) => `/acme/~${href}`,
    orgSlug: navigation.pathname.split('/').filter(Boolean)[0] ?? '',
  }),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    organizationId: 'org-1',
  }),
}));

vi.mock('@/features/library-remix/LibraryPickerOverlay', () => ({
  default: ({
    onSelect,
  }: {
    onSelect: (reference: {
      brandId: string;
      kind: 'ingredient';
      organizationId: string;
      recordId: string;
      serializer: 'ingredient';
    }) => void;
  }) => (
    <button
      onClick={() =>
        onSelect({
          brandId: 'brand-1',
          kind: 'ingredient',
          organizationId: 'org-1',
          recordId: 'ingredient-1',
          serializer: 'ingredient',
        })
      }
      type="button"
    >
      Select Library source
    </button>
  ),
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
    ...props
  }: {
    ariaLabel?: string;
    children?: ReactNode;
    onClick?: () => void;
  } & ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" aria-label={ariaLabel} onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@ui/overlays/context-inspector/ContextInspector', () => ({
  default: ({
    children,
    onOpenChange,
    isOpen,
  }: {
    children: ReactNode;
    onOpenChange: (isOpen: boolean) => void;
    isOpen: boolean;
  }) =>
    isOpen ? (
      <div data-testid="workspace-dialog">
        {children}
        <button
          type="button"
          aria-label="Dismiss workspace overlay"
          onClick={() => onOpenChange(false)}
        />
      </div>
    ) : null,
}));

vi.mock('@ui/primitives/drawer', () => ({
  Drawer: ({ children, open }: { children: ReactNode; open?: boolean }) =>
    open ? children : null,
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
  captureWorkspaceShellError: vi.fn(),
  captureWorkspaceShellOverlayAbandonment: vi.fn(),
  captureWorkspaceShellRestorationFailure: vi.fn(),
  captureWorkspaceShellScopeCorrection: vi.fn(),
  captureWorkspaceShellTransition: vi.fn(),
}));

import {
  type AnalyticsWorkspaceSurfaceAdapterState,
  useAnalyticsWorkspaceSurfaceAdapter,
} from '@/features/analytics/work-surface/analytics-workspace-surface-adapter-context';

vi.mock('@/features/workflows/workspace/WorkflowSurfaceInspector', () => ({
  WorkflowSurfaceInspector: () => <div>Workflow surface inspector</div>,
}));

vi.mock('@/features/workflows/workspace/WorkflowPickerOverlay', () => ({
  WorkflowPickerOverlay: ({
    onAttachWorkflow,
  }: {
    onAttachWorkflow: (workflow: { _id: string; name: string }) => void;
  }) => (
    <div>
      <p>Authorized workflow picker</p>
      <button
        onClick={() =>
          onAttachWorkflow({ _id: 'workflow-1', name: 'Launch brief' })
        }
        type="button"
      >
        Attach Launch brief
      </button>
    </div>
  ),
}));

import { BrandWorkspaceOverviewSurfaceAdapter } from '@/features/workspace-overview/workspace-overview-surface-adapters';

vi.mock('./use-conversation-scope-controls', () => ({
  useConversationScopeControls: () => ({
    contextLabel: 'Acme · Organization-wide',
    inspectorScope: <div data-testid="workspace-effective-scope" />,
    isConsequentiallyBlocked: false,
    scopeControls: <span>Thread scope</span>,
  }),
}));

import UniversalWorkspaceShell from './UniversalWorkspaceShell';

function AnalyticsAdapterFixture() {
  const adapter = useMemo<AnalyticsWorkspaceSurfaceAdapterState>(
    () => ({
      composerContext: <span>Visible analytics query</span>,
      contextLabel: 'Canvas · Post analytics',
      inspectorContent: <div>Authoritative Analytics context</div>,
      key: 'analytics:/analytics/posts',
      surfaceKey: 'analytics',
    }),
    [],
  );
  useAnalyticsWorkspaceSurfaceAdapter(adapter);
  return <div>Post analytics canvas</div>;
}

function InspectorToggleFixture() {
  const inspector = useWorkspaceInspector();

  return (
    <button type="button" onClick={inspector?.toggle}>
      Toggle inspector
    </button>
  );
}

describe('UniversalWorkspaceShell', () => {
  beforeEach(() => {
    navigation.pathname = '/acme/~/agent/thread-1';
    navigation.searchParams = new URLSearchParams();
    agentState.activeThreadId = 'thread-1';
    agentState.threads[0].brandId = 'brand-1';
    agentState.threads[0].contextVersion = 3;
    agentState.updateThread.mockClear();
    agentState.updateThread.mockImplementation(
      (
        _threadId: string,
        patch: { brandId?: string; contextVersion?: number },
      ) => {
        Object.assign(agentState.threads[0], patch);
      },
    );
    updateThreadContextEffect.mockReset();
    updateThreadContextEffect.mockResolvedValue({
      brandId: 'brand-studio',
      contextVersion: 4,
      id: 'thread-1',
    });
    inspectorConversationMount.mockClear();
    agentActions.resetActiveConversationState.mockClear();
    agentActions.setActiveThread.mockClear();
    agentState.seedComposer.mockClear();
    router.back.mockClear();
    router.push.mockClear();
    router.replace.mockClear();
  });

  it('synchronizes a Studio adapter scope and exposes its typed reference', async () => {
    navigation.pathname = '/acme/moonrise/studio/image';
    navigation.searchParams = new URLSearchParams();
    agentState.threads[0].brandId = 'brand-previous';

    function StudioSurface() {
      useRegisterWorkspaceSurfaceAdapter({
        contextLabel: 'Studio · Image · Launch visual',
        references: [
          {
            label: 'Launch visual · v2',
            reference: {
              brandId: 'brand-studio',
              kind: 'ingredient',
              organizationId: 'org-acme',
              recordId: 'ingredient-1',
              serializer: 'ingredient',
            },
          },
        ],
        renderInspector: () => <p>Studio inspector</p>,
        scope: {
          brandId: 'brand-studio',
          organizationId: 'org-acme',
        },
        surfaceKey: 'studio',
      });
      return <div>Studio canvas</div>;
    }

    const view = render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <StudioSurface />
      </UniversalWorkspaceShell>,
    );

    await waitFor(() =>
      expect(updateThreadContextEffect).toHaveBeenCalledWith(
        'thread-1',
        {
          brandId: 'brand-studio',
          expectedContextVersion: 3,
        },
        expect.any(AbortSignal),
      ),
    );
    await waitFor(() =>
      expect(agentState.updateThread).toHaveBeenCalledWith('thread-1', {
        brandId: 'brand-studio',
        contextVersion: 4,
      }),
    );
    view.rerender(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <StudioSurface />
      </UniversalWorkspaceShell>,
    );
    expect(screen.getAllByText('Studio inspector')).not.toHaveLength(0);
    expect(screen.queryByTestId('workspace-composer-slot')).toBeNull();
    expect(
      screen.getByTestId('workspace-inspector-composer-slot'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('conversation-inspector-provider'),
    ).toHaveAttribute('data-active', 'false');
    expect(
      screen.getByText('Studio canvas').closest('[data-composer-brand]'),
    ).toHaveAttribute('data-composer-brand', 'brand-studio');
    expect(
      screen.getByText('Studio canvas').closest('[data-composer-references]'),
    ).toHaveAttribute('data-composer-references', 'ingredient-1');
    expect(
      screen.getByText('Studio canvas').closest('[data-composer-visible]'),
    ).toHaveAttribute('data-composer-visible', 'true');
    expect(
      screen.getByText('Studio canvas').closest('[data-composer-target]'),
    ).toHaveAttribute(
      'data-composer-target',
      'workspace-inspector-composer-slot',
    );
  });

  it('keeps a conversation created from Studio out of the canonical URL', () => {
    navigation.pathname = '/acme/moonrise/studio/image';
    navigation.searchParams = new URLSearchParams();
    agentState.activeThreadId = null;

    const view = render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Studio canvas</div>
      </UniversalWorkspaceShell>,
    );

    agentState.activeThreadId = 'thread-created-in-studio';
    view.rerender(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Studio canvas</div>
      </UniversalWorkspaceShell>,
    );

    // Thread identity is the agent store's, not the URL's. `/agent/:id` is the
    // only route that carries it in the path.
    expect(router.replace).not.toHaveBeenCalledWith(
      expect.stringContaining('thread='),
    );
  });

  it('carries one conversation from the agent surface into the canvas inspector', () => {
    const view = render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div data-testid="canonical-canvas">Workspace overview</div>
      </UniversalWorkspaceShell>,
    );

    // `/agent/:id` renders the conversation as its own canvas, so the inspector
    // must not mount a second copy of it — two would portal two prompt bars
    // into the one shell composer slot.
    expect(
      screen.getByLabelText('Primary workspace canvas'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('canonical-canvas')).toBeInTheDocument();
    expect(
      screen.queryByTestId('inspector-conversation'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('universal-workspace-shell')).toHaveAttribute(
      'data-workspace-surface',
      'agent-conversation',
    );
    expect(
      screen.getByTestId('universal-workspace-shell').parentElement,
    ).toHaveAttribute('data-draft-scope', 'acme:thread-1:3');
    expect(screen.getByLabelText('Workspace inspector')).toBeInTheDocument();
    expect(
      screen.getByTestId('conversation-inspector-provider'),
    ).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('workspace-composer-slot')).toBeInTheDocument();
    expect(
      screen.queryByTestId('workspace-inspector-composer-slot'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId('universal-workspace-shell').parentElement,
    ).toHaveAttribute('data-composer-target', 'workspace-composer-slot');

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
    expect(screen.getByLabelText('Workspace inspector')).toBeInTheDocument();
    expect(
      screen.getByTestId('conversation-inspector-provider'),
    ).toHaveAttribute('data-active', 'false');
    expect(screen.queryByTestId('workspace-composer-slot')).toBeNull();
    expect(
      screen.getByTestId('workspace-inspector-composer-slot'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('workspace-canvas-layout')).not.toHaveClass(
      'pb-48',
      'md:pb-56',
    );
    expect(
      screen.getByRole('separator', { name: 'Resize workspace inspector' }),
    ).toHaveAttribute('aria-valuenow', '320');
    expect(screen.getByTestId('canonical-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('inspector-conversation')).toBeInTheDocument();
    expect(screen.getByTestId('universal-workspace-shell')).toHaveAttribute(
      'data-workspace-surface',
      'workspace-overview',
    );
    // Same thread, same draft — leaving the agent route changes where the
    // conversation renders, not which conversation it is.
    expect(
      screen.getByTestId('universal-workspace-shell').parentElement,
    ).toHaveAttribute('data-draft-scope', 'acme:thread-1:3');
    expect(
      screen.getByTestId('universal-workspace-shell').parentElement,
    ).toHaveAttribute(
      'data-composer-target',
      'workspace-inspector-composer-slot',
    );
    expect(inspectorConversationMount).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalledWith(
      expect.stringContaining('thread='),
    );
  });

  it('deep links the inspector conversation back to its full surface', () => {
    navigation.pathname = '/acme/moonrise/workspace/overview';
    navigation.searchParams = new URLSearchParams();

    render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Workspace overview</div>
      </UniversalWorkspaceShell>,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Open full conversation' }),
    );

    expect(router.push).toHaveBeenCalledWith('/acme/~/agent/thread-1');
  });

  it('hands the single conversation to the mobile drawer while it is open', () => {
    navigation.pathname = '/acme/moonrise/workspace/overview';
    navigation.searchParams = new URLSearchParams();

    render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Workspace overview</div>
      </UniversalWorkspaceShell>,
    );

    expect(screen.getByTestId('inspector-conversation')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Inspector' }));

    // Still exactly one: both inspector hosts stay in the DOM, so a second copy
    // here would portal a second prompt bar into the one shell composer slot.
    expect(screen.getAllByTestId('inspector-conversation')).toHaveLength(1);
    expect(
      screen.getAllByTestId('workspace-inspector-composer-slot'),
    ).toHaveLength(1);
    expect(screen.getByText('Workspace inspector')).toBeInTheDocument();
  });

  it('keeps the inspector conversation and composer mounted when collapsed', () => {
    navigation.pathname = '/acme/moonrise/workspace/overview';
    navigation.searchParams = new URLSearchParams();

    render(
      <WorkspaceInspectorProvider>
        <InspectorToggleFixture />
        <UniversalWorkspaceShell agentApiService={agentApiService}>
          <div>Workspace overview</div>
        </UniversalWorkspaceShell>
      </WorkspaceInspectorProvider>,
    );

    const conversation = screen.getByTestId('inspector-conversation');
    const composerSlot = screen.getByTestId(
      'workspace-inspector-composer-slot',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Toggle inspector' }));

    expect(screen.getByLabelText('Workspace inspector')).toHaveAttribute(
      'inert',
    );
    expect(screen.getByLabelText('Workspace inspector')).toHaveStyle({
      width: '0px',
    });
    expect(screen.getByTestId('inspector-conversation')).toBe(conversation);
    expect(screen.getByTestId('workspace-inspector-composer-slot')).toBe(
      composerSlot,
    );
    expect(inspectorConversationMount).toHaveBeenCalledTimes(1);
  });

  it('renders product-owned adapter context in the shared shell slots', () => {
    navigation.pathname = '/acme/moonrise/analytics/posts';
    navigation.searchParams = new URLSearchParams();

    render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <AnalyticsAdapterFixture />
      </UniversalWorkspaceShell>,
    );

    expect(screen.getByText('Post analytics canvas')).toBeInTheDocument();
    expect(
      screen.getAllByText('Authoritative Analytics context').length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('Visible analytics query')).toBeInTheDocument();
    // The inspector renders the adapter's real context, never developer copy:
    // no raw `route:/…` breadcrumb and no `Registered … adapter slot` fallback.
    expect(screen.queryByText(/adapter slot/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^route:\//)).not.toBeInTheDocument();
  });

  it('mounts the brand overview registration in the harness inspector', async () => {
    navigation.pathname = '/acme/moonrise/workspace/overview';

    render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <BrandWorkspaceOverviewSurfaceAdapter>
          <div data-testid="canonical-brand-overview">Workspace overview</div>
        </BrandWorkspaceOverviewSurfaceAdapter>
      </UniversalWorkspaceShell>,
    );

    expect(
      await screen.findByTestId('workspace-surface-adapter-inspector'),
    ).toHaveTextContent('Brand Workspace overview');
    expect(screen.getByTestId('canonical-brand-overview')).toBeInTheDocument();
    // Resolved workspace adapters render the human title/description, never the
    // terminal developer fallback string or a raw route pattern.
    expect(screen.queryByText(/adapter slot/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^route:\//)).not.toBeInTheDocument();
  });

  it('renders a human empty state — not developer copy — when no surface adapter resolves', () => {
    navigation.pathname = '/acme/moonrise/analytics/posts';
    navigation.searchParams = new URLSearchParams();

    render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div data-testid="canonical-canvas">Analytics canvas</div>
      </UniversalWorkspaceShell>,
    );

    // With no adapter registered, the inspector shows a user-facing empty state…
    expect(screen.getByText(/context yet$/)).toBeInTheDocument();
    expect(
      screen.queryByTestId('workspace-surface-adapter-inspector'),
    ).toBeNull();
    // …and never leaks the terminal adapter-slot string or a raw route pattern.
    expect(screen.queryByText(/adapter slot/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^route:\//)).not.toBeInTheDocument();
  });

  it('keeps an organization conversation route as its own canvas', () => {
    navigation.pathname = '/acme/~/agent/thread-1';

    render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div data-testid="routed-conversation">Conversation</div>
      </UniversalWorkspaceShell>,
    );

    expect(screen.getByTestId('routed-conversation')).toHaveTextContent(
      'Conversation',
    );
    expect(
      screen.queryByRole('button', { name: 'Open workspace canvas' }),
    ).not.toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('keeps a brand conversation route as its own canvas', () => {
    navigation.pathname = '/acme/moonrise/agent/thread-1';

    render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div data-testid="routed-conversation">Conversation</div>
      </UniversalWorkspaceShell>,
    );

    expect(screen.getByTestId('routed-conversation')).toHaveTextContent(
      'Conversation',
    );
    expect(
      screen.queryByRole('button', { name: 'Open workspace canvas' }),
    ).not.toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
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
    // The shell frames the route, it no longer replaces it: the agent page is
    // the surface here, so its own children render.
    expect(screen.getByText('Routed agent page')).toBeInTheDocument();
    expect(
      screen.queryByTestId('inspector-conversation'),
    ).not.toBeInTheDocument();
  });

  it('restores an allowlisted temporary overlay above the canvas', () => {
    navigation.pathname = '/acme/moonrise/studio/image';
    navigation.searchParams = new URLSearchParams({
      overlay: 'shell-preview',
    });

    render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Studio</div>
      </UniversalWorkspaceShell>,
    );

    expect(screen.getByTestId('universal-workspace-shell')).toHaveAttribute(
      'data-shell-state',
      'overlay',
    );
    expect(screen.getByTestId('workspace-dialog')).toBeInTheDocument();
    expect(screen.getByText('Studio')).toBeInTheDocument();
    expect(screen.getByLabelText('Workspace inspector')).toBeInTheDocument();
    expect(screen.getByTestId('inspector-conversation')).toBeInTheDocument();
    expect(
      screen.getByText('No resource reference selected'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('workspace-overlay-composer-slot'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('workspace-inspector-composer-slot'),
    ).not.toBeInTheDocument();
    expect(
      screen
        .getByTestId('workspace-overlay-composer-slot')
        .closest('[data-composer-visible]'),
    ).toHaveAttribute('data-composer-visible', 'true');
    expect(
      screen.getByTestId('universal-workspace-shell').parentElement,
    ).toHaveAttribute(
      'data-composer-target',
      'workspace-overlay-composer-slot',
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss workspace overlay' }),
    );

    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/acme/moonrise/studio/image');
  });

  it('dispatches publish only as a trusted brand-scoped review route', () => {
    navigation.pathname = '/acme/moonrise/workspace/overview';
    navigation.searchParams = new URLSearchParams();

    render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Workspace</div>
      </UniversalWorkspaceShell>,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Dispatch publish action' }),
    );

    expect(router.push).toHaveBeenCalledWith('/acme/moonrise/posts/review');
  });

  it('opens and restores the trusted workflow picker without dialog graph UI', () => {
    navigation.pathname = '/acme/moonrise/workspace/overview';
    navigation.searchParams = new URLSearchParams();

    const view = render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Workspace</div>
      </UniversalWorkspaceShell>,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Dispatch workflow action' }),
    );
    expect(router.push).toHaveBeenCalledWith(
      '/acme/moonrise/workspace/overview?overlay=workflow-picker',
    );

    navigation.searchParams = new URLSearchParams({
      overlay: 'workflow-picker',
    });
    view.rerender(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Workspace</div>
      </UniversalWorkspaceShell>,
    );

    expect(screen.getByText('Authorized workflow picker')).toBeInTheDocument();
    expect(screen.queryByText(/graph editor/i)).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Attach Launch brief' }),
    );
    expect(agentState.seedComposer).toHaveBeenCalledWith(
      'Use the deterministic workflow “Launch brief” (workflow ID: workflow-1) for this request: ',
      'thread-1',
    );
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('gives canonical workflow editors focused canvas overflow ownership', () => {
    navigation.pathname = '/acme/moonrise/workflows/workflow-1';
    navigation.searchParams = new URLSearchParams();

    render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Workflow graph editor</div>
      </UniversalWorkspaceShell>,
    );

    expect(screen.getByTestId('workspace-canvas-layout')).toHaveClass(
      'overflow-hidden',
    );
    expect(screen.getByText('Workflow graph editor')).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-dialog')).not.toBeInTheDocument();
  });

  it('dispatches Remix through the authorized no-parameter Library overlay', () => {
    navigation.pathname = '/acme/moonrise/workspace/overview';
    navigation.searchParams = new URLSearchParams();

    render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Workspace</div>
      </UniversalWorkspaceShell>,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Dispatch remix action' }),
    );

    expect(router.push).toHaveBeenCalledWith(
      '/acme/moonrise/workspace/overview?overlay=library-picker',
    );
  });

  it('consumes a reauthorized Library reference into the canonical Remix route', () => {
    navigation.pathname = '/acme/moonrise/workspace/overview';
    navigation.searchParams = new URLSearchParams({
      overlay: 'library-picker',
    });

    render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Workspace</div>
      </UniversalWorkspaceShell>,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Select Library source' }),
    );

    expect(router.replace).toHaveBeenCalledWith(
      '/acme/moonrise/posts/remix?sourceArtifact=ingredient%3Aingredient-1',
    );
  });

  it('exposes the optional scope-control composition slot without owning it', () => {
    render(
      <UniversalWorkspaceShell
        agentApiService={agentApiService}
        composerScopeControls={<span>Scoped controls</span>}
      >
        <div>Conversation</div>
      </UniversalWorkspaceShell>,
    );

    expect(screen.getByText('Scoped controls')).toBeInTheDocument();
    expect(screen.getByText('Thread scope')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-effective-scope')).toBeInTheDocument();
  });

  it('preserves an unauthorized brand action instead of widening org scope', () => {
    navigation.pathname = '/acme/~/agent/thread-1';

    render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Conversation</div>
      </UniversalWorkspaceShell>,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Dispatch publish action' }),
    );

    expect(router.push).not.toHaveBeenCalledWith(
      expect.stringContaining('/posts/review'),
    );
  });

  it('rejects forged command metadata instead of trusting the invocation', () => {
    navigation.pathname = '/acme/moonrise/workspace/overview';

    render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Workspace</div>
      </UniversalWorkspaceShell>,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Dispatch forged publish action' }),
    );

    expect(router.push).not.toHaveBeenCalledWith(
      expect.stringContaining('/posts/calendar'),
    );
  });

  it('pushes a registered overlay so browser Back owns UI dismissal', () => {
    navigation.pathname = '/acme/moonrise/workspace/overview';
    navigation.searchParams = new URLSearchParams();

    const view = render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Workspace</div>
      </UniversalWorkspaceShell>,
    );

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Open overlay preview' })[0],
    );

    expect(router.push).toHaveBeenCalledWith(
      '/acme/moonrise/workspace/overview?overlay=shell-preview',
    );

    navigation.searchParams = new URLSearchParams({
      overlay: 'shell-preview',
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
    });

    const view = render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div data-testid="underlying-canvas">Workspace</div>
      </UniversalWorkspaceShell>,
    );

    expect(screen.getByTestId('workspace-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('underlying-canvas')).toBeInTheDocument();

    navigation.searchParams = new URLSearchParams();
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
    });

    render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Library</div>
      </UniversalWorkspaceShell>,
    );

    expect(screen.queryByTestId('workspace-dialog')).not.toBeInTheDocument();
    expect(router.replace).toHaveBeenCalledWith(
      '/acme/moonrise/library/images?folder=launch',
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

    // A different organization is a different scope: the inspector still hosts
    // a conversation, but not the previous org's thread.
    expect(screen.getByTestId('inspector-conversation')).toBeInTheDocument();
    expect(
      screen.getByTestId('universal-workspace-shell').parentElement,
    ).toHaveAttribute('data-draft-scope', 'other-org:new:0');
    expect(router.replace).not.toHaveBeenCalledWith(
      expect.stringContaining('thread=thread-1'),
    );
  });

  it('canonicalizes an unknown overlay without leaving the current route', () => {
    navigation.pathname = '/acme/moonrise/posts/calendar';
    navigation.searchParams = new URLSearchParams({
      overlay: 'untrusted-output',
      taskId: 'task-1',
    });

    render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Calendar</div>
      </UniversalWorkspaceShell>,
    );

    expect(router.replace).toHaveBeenCalledWith(
      '/acme/moonrise/posts/calendar?taskId=task-1',
    );
  });
});
