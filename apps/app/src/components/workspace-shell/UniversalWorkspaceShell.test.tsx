import {
  ContextSidebarPanel,
  ContextSidebarProvider,
} from '@contexts/ui/context-sidebar-context';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
  useMemo,
  useState,
} from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import {
  AGENT_DOCK_STORAGE_KEY,
  AgentDockProvider,
  useAgentDock,
} from '@contexts/ui/agent-dock-context';
import { useRegisterWorkspaceSurfaceAdapter } from './WorkspaceSurfaceAdapterContext';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

// The composer renders scope controls itself; the mocked provider only
// records what the shell hands it.
const composerShell = vi.hoisted(() => ({
  scopeControls: null as unknown,
}));
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
const updateThreadContext = vi.hoisted(() => vi.fn());
const agentApiService = {
  updateThreadContext,
} as never;

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../tests/next-intl.stub'
  );

  return { useTranslations: translateFromCatalog };
});

vi.mock('@genfeedai/agent', () => ({
  ConversationComposerShellProvider: ({
    artifactReferences,
    brandId,
    children,
    dispatchAction,
    draftScopeKey,
    isComposerVisible,
    placement,
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
    placement?: string;
    portalTarget?: HTMLElement | null;
    scopeControls?: ReactNode;
  }) => (
    <div
      ref={() => {
        composerShell.scopeControls = scopeControls;
      }}
      data-composer-brand={brandId}
      data-composer-references={artifactReferences
        ?.map((item) => item.reference.recordId)
        .join(',')}
      data-composer-visible={String(isComposerVisible)}
      data-composer-placement={placement}
      data-composer-target={
        portalTarget?.dataset.testid ??
        portalTarget?.parentElement?.dataset.testid ??
        (portalTarget ? 'unknown' : 'inline')
      }
      data-draft-scope={draftScopeKey}
    >
      {children}
      <button
        aria-label="Dispatch publish action"
        onClick={() =>
          dispatchAction({
            action: {
              isConsequentialProposal: true,
              label: 'Publish',
              name: 'publish',
              requiredScope: 'brand',
              route: '/publishing/review',
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
              route: '/automation/workflows',
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
              route: '/publishing/posts?view=calendar',
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
              route: '/publishing/remix',
            },
            arguments: '',
          })
        }
        type="button"
      />
    </div>
  ),
  getConversationComposerAction: (name: string) => {
    if (name === 'publish' || name === 'remix') {
      return {
        isConsequentialProposal: name === 'publish',
        label: name === 'publish' ? 'Publish' : 'Remix',
        name,
        requiredScope: 'brand',
        route: name === 'publish' ? '/publishing/review' : '/publishing/remix',
      };
    }
    if (name === 'workflow') {
      return {
        isConsequentialProposal: false,
        label: 'Workflow',
        name: 'workflow',
        requiredScope: 'brand',
        route: '/automation/workflows',
      };
    }
    return null;
  },
  ConversationDockPanel: () => <div data-testid="dock-conversation" />,
  resolveConversationComposerDestinationHref: ({
    activeHref,
    orgHref,
    route,
    routeBrandSlug,
    selectedBrandSlug,
  }: {
    activeHref: (href: string) => string;
    orgHref: (href: string) => string;
    route: string;
    routeBrandSlug?: string;
    selectedBrandSlug?: string;
  }) =>
    routeBrandSlug?.trim() || selectedBrandSlug?.trim()
      ? activeHref(route)
      : orgHref(route),
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
    activeHref: (href: string) => `/acme/moonrise${href}`,
    brandSlug: navigation.pathname.includes('/moonrise/') ? 'moonrise' : '',
    href: (href: string) => `/acme/moonrise${href}`,
    orgHref: (href: string) => `/acme/~${href}`,
    orgSlug: navigation.pathname.split('/').filter(Boolean)[0] ?? '',
  }),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    brands: [
      { id: 'brand-1', label: 'Brand One', organization: { id: 'org-1' } },
      {
        id: 'brand-analytics-route',
        label: 'Analytics Brand',
        organization: { id: 'org-1' },
      },
    ],
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

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    onClick,
    ...props
  }: {
    children: ReactNode;
    href: string;
  } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      href={href}
      onClick={(event) => {
        // jsdom cannot follow the navigation; the shell's own handler still
        // has to run so the transition stamp is observable.
        event.preventDefault();
        onClick?.(event);
      }}
      {...props}
    >
      {children}
    </a>
  ),
}));

vi.mock('@ui/primitives/button', async () => {
  const { forwardRef } = await import('react');

  return {
    Button: forwardRef<
      HTMLButtonElement,
      {
        ariaLabel?: string;
        children?: ReactNode;
        onClick?: () => void;
      } & ButtonHTMLAttributes<HTMLButtonElement>
    >(function MockButton({ ariaLabel, children, onClick, ...props }, ref) {
      return (
        <button
          ref={ref}
          type="button"
          aria-label={ariaLabel}
          onClick={onClick}
          {...props}
        >
          {children}
        </button>
      );
    }),
  };
});

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
  DrawerContent: ({ children, id }: { children: ReactNode; id?: string }) => (
    <div id={id}>{children}</div>
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
import { captureWorkspaceShellTransition } from '@/lib/workspace-shell/workspace-shell-telemetry';

vi.mock('@/features/workflows/workspace/WorkflowSurfaceInspector', () => ({
  WorkflowSurfaceInspector: ({
    contextVersion,
    pathname,
    threadId,
  }: {
    contextVersion?: number;
    pathname: string;
    threadId: string | null;
  }) => (
    <div
      data-inspector-context-version={String(contextVersion)}
      data-inspector-pathname={pathname}
      data-inspector-thread={String(threadId)}
    >
      Workflow surface inspector
    </div>
  ),
}));

vi.mock('@/features/workflows/workspace/WorkflowPickerOverlay', () => ({
  WorkflowPickerOverlay: ({
    onAttachWorkflow,
  }: {
    onAttachWorkflow: (workflow: { id: string; label: string }) => void;
  }) => (
    <div>
      <p>Authorized workflow picker</p>
      <button
        onClick={() =>
          onAttachWorkflow({ id: 'workflow-1', label: 'Launch brief' })
        }
        type="button"
      >
        Attach Launch brief
      </button>
    </div>
  ),
}));

vi.mock('./use-conversation-scope-controls', () => ({
  useConversationScopeControls: () => ({
    contextLabel: 'Acme · Organization-wide',
    isConsequentiallyBlocked: false,
    scopeControls: (
      <>
        <span>Thread scope</span>
        <button type="button">Switch organization</button>
      </>
    ),
    scopeStatus: <span>Scope out of sync</span>,
  }),
}));

import UniversalWorkspaceShell from './UniversalWorkspaceShell';

function AnalyticsAdapterFixture() {
  const adapter = useMemo<AnalyticsWorkspaceSurfaceAdapterState>(
    () => ({
      composerContext: <span>Visible analytics query</span>,
      contextLabel: 'Canvas · Post analytics',
      key: 'analytics:/analytics/posts',
      surfaceKey: 'analytics',
    }),
    [],
  );
  useAnalyticsWorkspaceSurfaceAdapter(adapter);
  return <div>Post analytics canvas</div>;
}

/** Stands in for `/analytics/brands/:id`, which resolves a route-scoped brand. */
function AnalyticsBrandRouteAdapterFixture({
  brandId,
}: {
  readonly brandId: string;
}) {
  const adapter = useMemo<AnalyticsWorkspaceSurfaceAdapterState>(
    () => ({
      brandId,
      composerContext: null,
      contextLabel: 'Canvas · Brand analytics',
      key: `analytics:/analytics/brands/${brandId}`,
      surfaceKey: 'analytics',
    }),
    [brandId],
  );
  useAnalyticsWorkspaceSurfaceAdapter(adapter);
  return <div>Brand analytics canvas</div>;
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
    updateThreadContext.mockReset();
    updateThreadContext.mockResolvedValue({
      brandId: 'brand-studio',
      contextVersion: 4,
      id: 'thread-1',
    });
    agentActions.resetActiveConversationState.mockClear();
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    }));
    agentActions.setActiveThread.mockReset();
    agentActions.setActiveThread.mockImplementation(
      (threadId: string | null) => {
        agentState.activeThreadId = threadId;
      },
    );
    agentState.seedComposer.mockClear();
    router.back.mockClear();
    router.push.mockClear();
    router.replace.mockClear();
    vi.mocked(captureWorkspaceShellTransition).mockClear();
  });

  it('renders the registered selection in the context sidebar until the page deselects', () => {
    navigation.pathname = '/acme/moonrise/library/assets';
    function SelectionSurface() {
      const [isSelected, setIsSelected] = useState(true);

      return (
        <>
          <ContextSidebarPanel
            onClose={() => setIsSelected(false)}
            selection={
              isSelected
                ? {
                    id: 'asset-1',
                    kind: 'asset',
                    origin: 'user',
                    subtitle: 'flux-dev',
                    title: 'Image',
                  }
                : null
            }
          >
            <p>Asset detail</p>
          </ContextSidebarPanel>
          <div>Library grid</div>
        </>
      );
    }

    const { container } = render(
      <ContextSidebarProvider>
        <UniversalWorkspaceShell agentApiService={agentApiService}>
          <SelectionSurface />
        </UniversalWorkspaceShell>
      </ContextSidebarProvider>,
    );

    const aside = container.querySelector('#workspace-context-inspector');
    expect(aside).not.toHaveAttribute('inert');
    expect(aside).not.toHaveAttribute('aria-hidden');
    const sidebar = screen.getByRole('complementary', {
      name: 'Selection details',
    });
    expect(
      within(sidebar).getByTestId('context-sidebar-title'),
    ).toHaveTextContent('Image');
    expect(
      within(sidebar).getByTestId('context-sidebar-outlet'),
    ).toHaveTextContent('Asset detail');

    fireEvent.click(
      within(sidebar).getByRole('button', { name: 'Close details' }),
    );

    expect(screen.queryByText('Asset detail')).toBeNull();
    expect(
      container.querySelector('#workspace-context-inspector'),
    ).toHaveAttribute('inert');
    expect(
      container.querySelector('#workspace-context-inspector'),
    ).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps the context sidebar rail closed and inert with no selection', () => {
    navigation.pathname = '/acme/moonrise/workspace';

    const { container } = render(
      <ContextSidebarProvider>
        <UniversalWorkspaceShell agentApiService={agentApiService}>
          <div>Workspace overview</div>
        </UniversalWorkspaceShell>
      </ContextSidebarProvider>,
    );

    const aside = container.querySelector('#workspace-context-inspector');
    expect(aside).toBeInTheDocument();
    expect(aside).toHaveAttribute('inert');
    expect(aside).toHaveAttribute('aria-hidden', 'true');
    expect(aside).toHaveStyle({ width: '0px' });
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  });

  it('sizes the context sidebar rail to the default width and exposes the resize separator', () => {
    navigation.pathname = '/acme/moonrise/workspace';

    function SelectionSurface() {
      return (
        <ContextSidebarPanel
          onClose={() => {}}
          selection={{
            id: 'asset-1',
            kind: 'asset',
            origin: 'user',
            subtitle: 'flux-dev',
            title: 'Image',
          }}
        >
          <p>Asset detail</p>
        </ContextSidebarPanel>
      );
    }

    const { container } = render(
      <ContextSidebarProvider>
        <UniversalWorkspaceShell agentApiService={agentApiService}>
          <SelectionSurface />
        </UniversalWorkspaceShell>
      </ContextSidebarProvider>,
    );

    const inspectorContent = screen.getByTestId('workspace-inspector-content');
    expect(inspectorContent).toHaveStyle({
      minWidth: '320px',
      width: '320px',
    });
    expect(
      screen.getByRole('separator', { name: 'Resize details' }),
    ).toHaveAttribute('aria-valuenow', '320');
    expect(container.querySelector('#workspace-context-inspector')).toHaveStyle(
      { width: '320px' },
    );
  });

  it('attaches the open inspector to the content panel through the layout root', () => {
    navigation.pathname = '/acme/moonrise/workspace';

    function SelectionSurface() {
      return (
        <ContextSidebarPanel
          onClose={() => {}}
          selection={{
            id: 'asset-1',
            kind: 'asset',
            origin: 'user',
            title: 'Image',
          }}
        >
          <p>Asset detail</p>
        </ContextSidebarPanel>
      );
    }

    const { container } = render(
      <div data-testid="layout-root" data-workspace-shell="true">
        <ContextSidebarProvider>
          <UniversalWorkspaceShell agentApiService={agentApiService}>
            <SelectionSurface />
          </UniversalWorkspaceShell>
        </ContextSidebarProvider>
      </div>,
    );

    const layoutRoot = screen.getByTestId('layout-root');
    const aside = container.querySelector('#workspace-context-inspector');
    // Open: the panel squares its right edge; the inspector adds no left edge
    // of its own, so the two share one divider.
    expect(layoutRoot).toHaveAttribute('data-inspector-open', 'true');
    expect(
      layoutRoot.style.getPropertyValue('--workspace-inspector-width'),
    ).toBe('320px');
    expect(aside).toHaveClass('rounded-r-lg', 'border-y', 'border-r');
    expect(aside).not.toHaveClass('border-l', 'rounded-lg');

    fireEvent.click(screen.getByRole('button', { name: 'Close details' }));

    expect(layoutRoot).toHaveAttribute('data-inspector-open', 'false');
    expect(
      layoutRoot.style.getPropertyValue('--workspace-inspector-width'),
    ).toBe('0px');
    expect(aside).not.toHaveClass('border-r');
  });

  it('keeps the mobile drawer closed without a context sidebar selection', () => {
    navigation.pathname = '/acme/moonrise/workspace';

    const { container } = render(
      <ContextSidebarProvider>
        <UniversalWorkspaceShell agentApiService={agentApiService}>
          <div>Workspace overview</div>
        </UniversalWorkspaceShell>
      </ContextSidebarProvider>,
    );

    // The mocked Drawer renders nothing at all while closed — the mobile
    // drawer body (and its `id`) only exists once a selection opens it.
    expect(
      container.querySelector('#workspace-context-inspector-drawer'),
    ).not.toBeInTheDocument();
  });

  it('synchronizes a Studio adapter scope and exposes its typed reference', async () => {
    navigation.pathname = '/acme/moonrise/studio/storyboard';
    navigation.searchParams = new URLSearchParams();
    agentState.threads[0].brandId = 'brand-previous';

    function StudioSurface() {
      useRegisterWorkspaceSurfaceAdapter({
        contextLabel: 'Studio · Storyboard · Launch visual',
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
        scope: {
          brandId: 'brand-studio',
          organizationId: 'org-acme',
        },
        surfaceKey: 'studio-specialized',
      });
      return <div>Studio canvas</div>;
    }

    const view = render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <StudioSurface />
      </UniversalWorkspaceShell>,
    );

    await waitFor(() =>
      expect(updateThreadContext).toHaveBeenCalledWith(
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
    expect(screen.queryByTestId('workspace-composer-slot')).toBeNull();
    expect(
      screen.getByText('Studio canvas').closest('[data-composer-brand]'),
    ).toHaveAttribute('data-composer-brand', 'brand-studio');
    expect(
      screen.getByText('Studio canvas').closest('[data-composer-references]'),
    ).toHaveAttribute('data-composer-references', 'ingredient-1');
    expect(
      screen.getByText('Studio canvas').closest('[data-composer-visible]'),
    ).toHaveAttribute('data-composer-visible', 'true');
    // The legacy inspector housing is gone and no bottom dock exists off the
    // agent route yet, so the composer has no portal target to render into.
    expect(
      screen.getByText('Studio canvas').closest('[data-composer-target]'),
    ).toHaveAttribute('data-composer-target', 'inline');
  });

  it('passes the selected brand to a new conversation composer', () => {
    navigation.pathname = '/acme/moonrise/agent/new';
    agentState.activeThreadId = null;

    render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>New conversation</div>
      </UniversalWorkspaceShell>,
    );

    expect(
      screen.getByText('New conversation').closest('[data-composer-brand]'),
    ).toHaveAttribute('data-composer-brand', 'brand-1');
  });

  it('keeps a conversation created from Studio out of the canonical URL', () => {
    navigation.pathname = '/acme/moonrise/studio/storyboard';
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

  it('hides inspector chrome on focused onboarding so the canvas is the conversation', () => {
    navigation.pathname = '/acme/~/agent/onboarding';
    agentState.activeThreadId = null;

    const { container } = render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div data-testid="canonical-canvas">Onboarding conversation</div>
      </UniversalWorkspaceShell>,
    );

    expect(screen.getByTestId('universal-workspace-shell')).toHaveAttribute(
      'data-workspace-surface',
      'agent-onboarding',
    );
    expect(screen.getByTestId('canonical-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-composer-slot')).toBeInTheDocument();
    expect(
      container.querySelector('#workspace-context-inspector'),
    ).not.toBeInTheDocument();
  });

  it('binds the topbar brand on product routes without a surface adapter', async () => {
    navigation.pathname = '/acme/moonrise/publishing/overview';
    navigation.searchParams = new URLSearchParams();
    agentState.threads[0].brandId = null;

    render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Publishing overview</div>
      </UniversalWorkspaceShell>,
    );

    expect(
      screen.getByText('Publishing overview').closest('[data-composer-brand]'),
    ).toHaveAttribute('data-composer-brand', 'brand-1');

    await waitFor(() =>
      expect(updateThreadContext).toHaveBeenCalledWith(
        'thread-1',
        {
          brandId: 'brand-1',
          expectedContextVersion: 3,
        },
        expect.any(AbortSignal),
      ),
    );
  });

  it('renders product-owned adapter context in the shared shell slots', async () => {
    navigation.pathname = '/acme/moonrise/analytics/posts';
    navigation.searchParams = new URLSearchParams();

    render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <AnalyticsAdapterFixture />
      </UniversalWorkspaceShell>,
    );

    expect(screen.getByText('Post analytics canvas')).toBeInTheDocument();
    await waitFor(() => {
      const controls = render(
        <div>{composerShell.scopeControls as ReactNode}</div>,
      );
      try {
        expect(controls.container).toHaveTextContent('Visible analytics query');
      } finally {
        controls.unmount();
      }
    });
    // Never developer copy: no raw `route:/…` breadcrumb and no `Registered
    // … adapter slot` fallback.
    expect(screen.queryByText(/adapter slot/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^route:\//)).not.toBeInTheDocument();
  });

  it('rebinds the open thread when navigating to a brand analytics route', async () => {
    navigation.pathname = '/acme/~/analytics/brands/brand-analytics-route';
    navigation.searchParams = new URLSearchParams();
    agentState.threads[0].brandId = 'brand-previous';
    agentState.threads[0].contextVersion = 3;

    render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <AnalyticsBrandRouteAdapterFixture brandId="brand-analytics-route" />
      </UniversalWorkspaceShell>,
    );

    expect(screen.getByText('Brand analytics canvas')).toBeInTheDocument();
    await waitFor(() =>
      expect(updateThreadContext).toHaveBeenCalledWith(
        'thread-1',
        {
          brandId: 'brand-analytics-route',
          expectedContextVersion: 3,
        },
        expect.any(AbortSignal),
      ),
    );
  });

  it('never binds or syncs an analytics route brand that is not authorized', async () => {
    navigation.pathname = '/acme/~/analytics/brands/brand-unauthorized';
    navigation.searchParams = new URLSearchParams();
    agentState.threads[0].brandId = 'brand-previous';
    agentState.threads[0].contextVersion = 3;

    render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <AnalyticsBrandRouteAdapterFixture brandId="brand-unauthorized" />
      </UniversalWorkspaceShell>,
    );

    expect(screen.getByText('Brand analytics canvas')).toBeInTheDocument();
    expect(updateThreadContext).not.toHaveBeenCalled();
    expect(agentState.threads[0].brandId).toBe('brand-previous');
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
  });

  it('restores a registered overlay above the canvas from a direct URL load', () => {
    navigation.pathname = '/acme/moonrise/studio/storyboard';
    navigation.searchParams = new URLSearchParams({
      overlay: 'workflow-picker',
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
    expect(screen.getByText('Authorized workflow picker')).toBeInTheDocument();
    expect(
      screen.getByTestId('workspace-overlay-composer-slot'),
    ).toBeInTheDocument();
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

    // Loaded straight from a URL, not pushed by this session: dismissal
    // replaces the overlay params rather than assuming an owned history entry.
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith(
      '/acme/moonrise/studio/storyboard',
    );
  });

  it('dispatches publish only as a trusted brand-scoped review route', () => {
    navigation.pathname = '/acme/moonrise/workspace';
    navigation.searchParams = new URLSearchParams();

    render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Workspace</div>
      </UniversalWorkspaceShell>,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Dispatch publish action' }),
    );

    expect(router.push).toHaveBeenCalledWith(
      '/acme/moonrise/publishing/review',
    );
  });

  it('opens and restores the trusted workflow picker without dialog graph UI', () => {
    navigation.pathname = '/acme/moonrise/workspace';
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
      '/acme/moonrise/workspace?overlay=workflow-picker',
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
    navigation.pathname = '/acme/moonrise/automation/workflows/workflow-1';
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

  it.each([
    ['/acme/moonrise/automation/workflows/workflow-1'],
    ['/acme/moonrise/automation/runs/run-1'],
  ])('leaves the workflow detail to the page on %s', (pathname) => {
    navigation.pathname = pathname;
    navigation.searchParams = new URLSearchParams();

    render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Workflow canvas</div>
      </UniversalWorkspaceShell>,
    );

    // The automation layout registers the workflow or run as a context
    // sidebar selection; the shell no longer mounts (and polls) its own copy.
    expect(
      screen.queryByText('Workflow surface inspector'),
    ).not.toBeInTheDocument();
  });

  it('dispatches Remix through the authorized no-parameter Library overlay', () => {
    navigation.pathname = '/acme/moonrise/workspace';
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
      '/acme/moonrise/workspace?overlay=library-picker',
    );
  });

  it('consumes a reauthorized Library reference into the canonical Remix route', () => {
    navigation.pathname = '/acme/moonrise/workspace';
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
      '/acme/moonrise/studio/generate?sourceArtifact=ingredient%3Aingredient-1',
    );
  });

  it('hands the composer each scope control once', () => {
    navigation.pathname = '/acme/moonrise/workspace';

    render(
      <UniversalWorkspaceShell
        agentApiService={agentApiService}
        composerScopeControls={<span>Scoped controls</span>}
      >
        <div>Conversation</div>
      </UniversalWorkspaceShell>,
    );

    const { container } = render(
      <div>{composerShell.scopeControls as ReactNode}</div>,
    );
    expect(container).toHaveTextContent(
      /^Thread scopeSwitch organizationScoped controls$/,
    );
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
      expect.stringContaining('/publishing/review'),
    );
  });

  it('rejects forged command metadata instead of trusting the invocation', () => {
    navigation.pathname = '/acme/moonrise/workspace';

    render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Workspace</div>
      </UniversalWorkspaceShell>,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Dispatch forged publish action' }),
    );

    expect(router.push).not.toHaveBeenCalledWith(
      expect.stringContaining('view=calendar'),
    );
  });

  it('pushes a registered overlay so browser Back owns UI dismissal', () => {
    navigation.pathname = '/acme/moonrise/workspace';
    navigation.searchParams = new URLSearchParams();

    const view = render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Workspace</div>
      </UniversalWorkspaceShell>,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Dispatch remix action' }),
    );

    expect(router.push).toHaveBeenCalledWith(
      '/acme/moonrise/workspace?overlay=library-picker',
    );

    navigation.searchParams = new URLSearchParams({
      overlay: 'library-picker',
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
    navigation.pathname = '/acme/moonrise/workspace';
    navigation.searchParams = new URLSearchParams({
      overlay: 'library-picker',
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

  it('does not retain a conversation when the canonical organization changes', () => {
    const view = render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Workspace</div>
      </UniversalWorkspaceShell>,
    );

    navigation.pathname = '/other-org/other-brand/workspace';
    navigation.searchParams = new URLSearchParams();
    view.rerender(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Other workspace</div>
      </UniversalWorkspaceShell>,
    );

    // A different organization is a different scope: the draft key resets to
    // a fresh, unthreaded scope rather than carrying the previous org's thread.
    expect(
      screen.getByTestId('universal-workspace-shell').parentElement,
    ).toHaveAttribute('data-draft-scope', 'other-org:new:0');
    expect(router.replace).not.toHaveBeenCalledWith(
      expect.stringContaining('thread=thread-1'),
    );
  });

  it('canonicalizes an unknown overlay without leaving the current route', () => {
    navigation.pathname = '/acme/moonrise/publishing/review';
    navigation.searchParams = new URLSearchParams({
      overlay: 'untrusted-output',
      taskId: 'task-1',
    });

    render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Approval queue</div>
      </UniversalWorkspaceShell>,
    );

    expect(router.replace).toHaveBeenCalledWith(
      '/acme/moonrise/publishing/review?taskId=task-1',
    );
  });

  describe('agent dock', () => {
    let dock: ReturnType<typeof useAgentDock> = null;

    function DockProbe() {
      dock = useAgentDock();
      return null;
    }

    function renderWithDock(children: ReactNode = <DockProbe />) {
      return render(
        <AgentDockProvider>
          <UniversalWorkspaceShell agentApiService={agentApiService}>
            {children}
          </UniversalWorkspaceShell>
        </AgentDockProvider>,
      );
    }

    beforeEach(() => {
      dock = null;
      window.localStorage.removeItem(AGENT_DOCK_STORAGE_KEY);
    });

    it('hosts a closed dock on product routes and mounts the conversation on first open', async () => {
      navigation.pathname = '/acme/moonrise/workspace';
      renderWithDock();

      await waitFor(() => expect(dock?.isAvailable).toBe(true));
      expect(screen.queryByRole('region', { name: 'Agent' })).toBeNull();
      expect(screen.getByTestId('agent-page-promptbar')).toBeVisible();
      expect(screen.queryByTestId('agent-conversation-bubble')).toBeNull();
      expect(screen.queryByTestId('dock-conversation')).toBeNull();

      act(() => dock?.open());

      const region = screen.getByRole('region', { name: 'Agent' });
      expect(region).toHaveAttribute('data-chrome', 'bubble');
      expect(within(region).getByTestId('dock-conversation')).toBeVisible();
      expect(screen.queryByTestId('agent-page-promptbar')).toBeNull();
      expect(
        screen.getByTestId('agent-dock-composer-slot').closest('section'),
      ).toBe(region);
      expect(
        document.querySelector('[data-composer-placement]'),
      ).toHaveAttribute('data-composer-placement', 'dock');

      // Closing keeps the conversation mounted so drafts and runs survive.
      act(() => dock?.close());
      expect(screen.queryByRole('region', { name: 'Agent' })).toBeNull();
      expect(screen.getByTestId('agent-page-promptbar')).toBeVisible();
      expect(screen.getByTestId('dock-conversation')).toBeInTheDocument();
    });

    it('uses a chat bubble on studio pages instead of a second promptbar', async () => {
      navigation.pathname = '/acme/moonrise/studio/generate';
      renderWithDock();

      await waitFor(() => expect(dock?.isAvailable).toBe(true));
      expect(screen.getByTestId('agent-conversation-bubble')).toBeVisible();
      expect(screen.queryByTestId('agent-page-promptbar')).toBeNull();
    });

    it('renders scope notices in the dock without the scope switchers', async () => {
      navigation.pathname = '/acme/moonrise/workspace';
      renderWithDock();
      await waitFor(() => expect(dock?.isAvailable).toBe(true));

      act(() => dock?.open());

      const scope = screen.getByTestId('agent-dock-scope');
      expect(scope).toHaveTextContent('Scope out of sync');
      expect(scope).not.toHaveTextContent('Switch organization');
    });

    it('never hosts the dock on the conversation route and closes it there', async () => {
      window.localStorage.setItem(
        AGENT_DOCK_STORAGE_KEY,
        JSON.stringify({ height: 320, isOpen: true }),
      );
      navigation.pathname = '/acme/~/agent/thread-1';
      renderWithDock();

      await waitFor(() => expect(dock?.isOpen).toBe(false));
      expect(dock?.isAvailable).toBe(false);
      expect(screen.queryByTestId('agent-dock')).toBeNull();
    });

    it('opens the full conversation from the dock header', async () => {
      navigation.pathname = '/acme/moonrise/workspace';
      renderWithDock();
      await waitFor(() => expect(dock?.isAvailable).toBe(true));
      act(() => dock?.open());

      fireEvent.click(screen.getByRole('button', { name: 'Open full page' }));

      expect(router.push).toHaveBeenCalledWith(
        expect.stringMatching(/^\/acme\/moonrise\/agent\//),
      );
    });

    it('attaches a record to the dock draft with its brand and opens the dock', async () => {
      navigation.pathname = '/acme/moonrise/workspace';
      renderWithDock();
      await waitFor(() => expect(dock?.isAvailable).toBe(true));

      let isAttached = false;
      act(() => {
        isAttached =
          dock?.attachContent({
            brandId: 'brand-1',
            contentTitle: 'Spring launch still',
            contentType: 'image',
            id: 'ingredient-1',
            kind: 'ingredient',
          }) ?? false;
      });

      expect(isAttached).toBe(true);
      expect(dock?.isOpen).toBe(true);
      const draftScope = document
        .querySelector('[data-draft-scope]')
        ?.getAttribute('data-draft-scope');
      expect(
        window.sessionStorage.getItem(
          `genfeed:conversation-composer:v1:${draftScope}`,
        ),
      ).toContain('ingredient-1');
      // The record keeps the brand the page stamped on it.
      expect(
        window.sessionStorage.getItem(
          `genfeed:conversation-composer:v1:${draftScope}`,
        ),
      ).toContain('"brandId":"brand-1"');
    });
  });
});
