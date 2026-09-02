import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
  useEffect,
  useMemo,
} from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import {
  OPEN_CONTEXT_TAB_EVENT,
  OPEN_CONVERSATION_TAB_EVENT,
} from '@/lib/workspace/agent-composer-events';
import {
  useWorkspaceInspector,
  WorkspaceInspectorProvider,
} from './WorkspaceInspectorContext';
import { useRegisterWorkspaceSurfaceAdapter } from './WorkspaceSurfaceAdapterContext';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

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
      {scopeControls}
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
              route: '/publishing/calendar',
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
  ConversationInspectorPanel: ({
    onOpenConversation,
  }: {
    onOpenConversation: () => void;
  }) => {
    useEffect(() => {
      inspectorConversationMount();
    }, []);
    return (
      <div data-testid="inspector-conversation">
        {/* The panel's own expand affordance — the shell owns the navigation,
            so the test drives it through this callback. */}
        <button
          aria-label="Expand conversation panel"
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

const libraryPickerState = vi.hoisted(() => ({
  items: [] as Array<{ id: string; metadataLabel?: string }>,
  status: 'empty' as 'empty' | 'ready',
}));

vi.mock('@/features/library-remix/LibrarySourcePreview', () => ({
  default: ({ record }: { record: { id: string } }) => (
    <div data-testid={`source-preview-${record.id}`} />
  ),
  getLibrarySourceLabel: (record: { id: string; metadataLabel?: string }) =>
    record.metadataLabel || record.id,
}));

vi.mock('@/features/library-remix/use-library-picker', () => ({
  LIBRARY_PICKER_CATEGORIES: [
    { category: 'IMAGE', key: 'images', label: 'Images' },
    { category: 'VIDEO', key: 'videos', label: 'Videos' },
    { category: 'GIF', key: 'gifs', label: 'GIFs' },
  ],
  useLibraryPicker: ({
    onSelect,
  }: {
    onSelect: (
      reference: unknown,
      record: { id: string; metadataLabel?: string },
    ) => void;
  }) => ({
    category: 'images',
    isLoadingMore: false,
    isValidatingId: null,
    loadMore: vi.fn(),
    retry: vi.fn(),
    select: async (ingredient: { id: string; metadataLabel?: string }) => {
      onSelect(
        {
          brandId: 'brand-1',
          kind: 'ingredient',
          organizationId: 'org-1',
          recordId: ingredient.id,
          serializer: 'ingredient',
        },
        ingredient,
      );
    },
    selectionFailure: null,
    setCategory: vi.fn(),
    state: {
      hasMore: false,
      items: libraryPickerState.items,
      status: libraryPickerState.status,
      total: libraryPickerState.items.length,
    },
  }),
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

/** Stands in for the topbar's below-`xl` drawer opener. */
function MobileInspectorOpenFixture() {
  const inspector = useWorkspaceInspector();

  return (
    <button type="button" onClick={() => inspector?.setIsMobileOpen(true)}>
      Open inspector drawer
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
    window.localStorage?.removeItem('genfeed:workspace-inspector:panes');
    libraryPickerState.items = [];
    libraryPickerState.status = 'empty';
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
        renderInspector: () => <p>Studio inspector</p>,
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
      screen.getByTestId('workspace-inspector-composer-slot'),
    ).not.toHaveClass('border-t');
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

    render(
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
      screen.queryByLabelText('Workspace inspector'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Inspector' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Conversation' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'Context and conversation for the active workspace surface.',
      ),
    ).not.toBeInTheDocument();
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
    expect(screen.getByTestId('workspace-canvas-layout')).toHaveClass(
      'focus:outline-none',
    );
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
    expect(screen.getByTestId('workspace-composer-slot')).toHaveClass(
      'max-w-3xl',
    );
    expect(screen.getByTestId('workspace-composer-slot')).not.toHaveClass(
      'bg-background',
    );
    expect(screen.getByTestId('workspace-composer-dock')).not.toHaveClass(
      'bg-background',
    );
    expect(screen.getByTestId('workspace-composer-dock')).toHaveClass(
      'pb-6',
      'md:pb-8',
    );
    const dockFade = screen
      .getByTestId('workspace-composer-dock')
      .querySelector('[data-composer-dock-fade]');
    expect(dockFade).toBeInTheDocument();
    expect(dockFade).toHaveClass('bg-gradient-to-t');
    expect(dockFade).toHaveClass('from-background');
    expect(dockFade).toHaveClass('to-transparent');
    expect(dockFade).toHaveClass('h-8');
    expect(dockFade).not.toHaveClass('h-28');
    expect(screen.getByTestId('workspace-canvas-layout')).toHaveClass(
      'overflow-hidden',
    );
    expect(screen.getByTestId('workspace-canvas-layout')).not.toHaveClass(
      'overflow-auto',
      'pb-48',
      'md:pb-56',
    );
    expect(
      screen.queryByTestId('workspace-inspector-composer-slot'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId('universal-workspace-shell').parentElement,
    ).toHaveAttribute('data-composer-target', 'workspace-composer-slot');

    navigation.pathname = '/acme/moonrise/workspace';
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
    expect(
      screen.getByTestId('universal-workspace-shell').parentElement,
    ).toHaveAttribute('data-composer-placement', 'inspector');
    expect(inspectorConversationMount).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalledWith(
      expect.stringContaining('thread='),
    );
  });

  it('deep links the inspector conversation back to its full surface', () => {
    navigation.pathname = '/acme/moonrise/workspace';
    navigation.searchParams = new URLSearchParams();

    const view = render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Workspace overview</div>
      </UniversalWorkspaceShell>,
    );

    // Brand-scoped agent route so the expanded conversation keeps topbar brand
    // context (not org `~/agent` which drops brand selection).
    const expandLink = screen.getByRole('link', {
      name: 'Open full conversation',
    });
    expect(expandLink).toHaveAttribute('href', '/acme/moonrise/agent/thread-1');

    // The href alone proves nothing about telemetry: the click has to stamp
    // the pending transition, or the arrival on `/agent` reports as `browser`.
    fireEvent.click(expandLink);
    vi.mocked(captureWorkspaceShellTransition).mockClear();

    navigation.pathname = '/acme/moonrise/agent/thread-1';
    navigation.searchParams = new URLSearchParams();
    view.rerender(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Conversation canvas</div>
      </UniversalWorkspaceShell>,
    );

    expect(captureWorkspaceShellTransition).toHaveBeenCalledWith(
      expect.objectContaining({ transition: 'conversation_return' }),
    );
  });

  it('returns to the full conversation from the inspector panel', () => {
    navigation.pathname = '/acme/moonrise/workspace';
    navigation.searchParams = new URLSearchParams();

    render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Workspace overview</div>
      </UniversalWorkspaceShell>,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Expand conversation panel' }),
    );

    expect(router.push).toHaveBeenCalledWith('/acme/moonrise/agent/thread-1');
  });

  it('renders the pinned Conversation section even when the surface declares no product panes', () => {
    navigation.pathname = '/acme/moonrise/publishing/overview';
    navigation.searchParams = new URLSearchParams();

    render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Publishing overview</div>
      </UniversalWorkspaceShell>,
    );

    // This route registers no product surface adapter — the context pane
    // falls back to the generic workspace body. Conversation still has to
    // render: it is pinned chrome, not a pane a surface opts into.
    const [conversationSection] = screen.getAllByTestId(
      'workspace-inspector-conversation-section',
    );
    expect(conversationSection).toBeInTheDocument();
  });

  it('expands the Context pane on the composer context event', async () => {
    navigation.pathname = '/acme/moonrise/publishing/overview';
    navigation.searchParams = new URLSearchParams();

    render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Publishing overview</div>
      </UniversalWorkspaceShell>,
    );

    const [contextTrigger] = screen.getAllByTestId(
      'workspace-inspector-pane-trigger-context',
    );
    const [filesTrigger] = screen.getAllByTestId(
      'workspace-inspector-pane-trigger-files',
    );

    // Collapse the default-expanded Context pane first, so the event's
    // effect is observable rather than a no-op.
    fireEvent.click(contextTrigger);
    await waitFor(() =>
      expect(contextTrigger).toHaveAttribute('aria-expanded', 'false'),
    );

    fireEvent(window, new CustomEvent(OPEN_CONTEXT_TAB_EVENT));

    await waitFor(() =>
      expect(contextTrigger).toHaveAttribute('aria-expanded', 'true'),
    );
    // A dropped listener would leave Files at its default state either way —
    // assert it stays collapsed so this isn't proving something trivial.
    expect(filesTrigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens the mobile inspector drawer on the composer conversation event', async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: query === '(max-width: 1279px)',
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    }));
    navigation.pathname = '/acme/moonrise/publishing/overview';
    navigation.searchParams = new URLSearchParams();

    render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Publishing overview</div>
      </UniversalWorkspaceShell>,
    );

    expect(
      screen.queryByText(
        'Context and conversation for the active workspace surface.',
      ),
    ).not.toBeInTheDocument();

    fireEvent(window, new CustomEvent(OPEN_CONVERSATION_TAB_EVENT));

    expect(
      await screen.findByText(
        'Context and conversation for the active workspace surface.',
      ),
    ).toBeVisible();
  });

  it('keeps the desktop rail conversation pinned and visible at xl+ on the composer event', async () => {
    navigation.pathname = '/acme/moonrise/publishing/overview';
    navigation.searchParams = new URLSearchParams();

    render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Publishing overview</div>
      </UniversalWorkspaceShell>,
    );

    fireEvent(window, new CustomEvent(OPEN_CONVERSATION_TAB_EVENT));

    // Conversation never toggles — it is always mounted. The event only
    // matters for the mobile drawer, so at xl+ the drawer copy stays absent.
    await waitFor(() => {
      const [conversationSection] = screen.getAllByTestId(
        'workspace-inspector-conversation-section',
      );
      expect(conversationSection).toBeVisible();
    });
    expect(
      screen.queryByText(
        'Context and conversation for the active workspace surface.',
      ),
    ).not.toBeInTheDocument();
  });

  it('leads the inspector rail with Context, Files, Browser, then pins Conversation last', () => {
    navigation.pathname = '/acme/moonrise/publishing/overview';
    navigation.searchParams = new URLSearchParams();

    render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Publishing overview</div>
      </UniversalWorkspaceShell>,
    );

    // The desktop rail and the mobile drawer both render the stack; order is
    // identical in each, so assert on the first one.
    const [panes] = screen.getAllByTestId('workspace-inspector-panes');
    const [contextTrigger] = screen.getAllByTestId(
      'workspace-inspector-pane-trigger-context',
    );
    const [filesTrigger] = screen.getAllByTestId(
      'workspace-inspector-pane-trigger-files',
    );
    const [browserTrigger] = screen.getAllByTestId(
      'workspace-inspector-pane-trigger-browser',
    );

    expect(
      contextTrigger.compareDocumentPosition(filesTrigger) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      filesTrigger.compareDocumentPosition(browserTrigger) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    const [conversationSection] = screen.getAllByTestId(
      'workspace-inspector-conversation-section',
    );
    expect(
      panes.compareDocumentPosition(conversationSection) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('collapses and re-expands a product pane from its accordion trigger', async () => {
    navigation.pathname = '/acme/moonrise/publishing/overview';
    navigation.searchParams = new URLSearchParams();

    render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Publishing overview</div>
      </UniversalWorkspaceShell>,
    );

    const [filesTrigger] = screen.getAllByTestId(
      'workspace-inspector-pane-trigger-files',
    );
    expect(filesTrigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(filesTrigger);
    await waitFor(() =>
      expect(filesTrigger).toHaveAttribute('aria-expanded', 'true'),
    );

    fireEvent.click(filesTrigger);
    await waitFor(() =>
      expect(filesTrigger).toHaveAttribute('aria-expanded', 'false'),
    );
  });

  it('expands multiple product panes at the same time', async () => {
    navigation.pathname = '/acme/moonrise/publishing/overview';
    navigation.searchParams = new URLSearchParams();

    render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Publishing overview</div>
      </UniversalWorkspaceShell>,
    );

    const [contextTrigger] = screen.getAllByTestId(
      'workspace-inspector-pane-trigger-context',
    );
    const [filesTrigger] = screen.getAllByTestId(
      'workspace-inspector-pane-trigger-files',
    );
    const [browserTrigger] = screen.getAllByTestId(
      'workspace-inspector-pane-trigger-browser',
    );

    // Context is expanded by default.
    expect(contextTrigger).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(filesTrigger);
    await waitFor(() =>
      expect(filesTrigger).toHaveAttribute('aria-expanded', 'true'),
    );

    fireEvent.click(browserTrigger);
    await waitFor(() =>
      expect(browserTrigger).toHaveAttribute('aria-expanded', 'true'),
    );

    // Expanding Files and then Browser never collapsed Context — unlike the
    // old exclusive tabs, the accordion supports N panes open at once.
    expect(contextTrigger).toHaveAttribute('aria-expanded', 'true');
    expect(filesTrigger).toHaveAttribute('aria-expanded', 'true');
    expect(browserTrigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('lets the operator expand the Files pane and preview a library source in Browser without collapsing Files', async () => {
    navigation.pathname = '/acme/moonrise/publishing/overview';
    navigation.searchParams = new URLSearchParams();
    libraryPickerState.status = 'ready';
    libraryPickerState.items = [
      { id: 'image-1', metadataLabel: 'Source image-1' },
    ];

    render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Publishing overview</div>
      </UniversalWorkspaceShell>,
    );

    const [filesTrigger] = screen.getAllByTestId(
      'workspace-inspector-pane-trigger-files',
    );
    fireEvent.click(filesTrigger);

    await waitFor(() =>
      expect(filesTrigger).toHaveAttribute('aria-expanded', 'true'),
    );
    expect(screen.getByTestId('source-preview-image-1')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Select Source image-1' }),
    );

    const [browserTrigger] = screen.getAllByTestId(
      'workspace-inspector-pane-trigger-browser',
    );
    await waitFor(() =>
      expect(browserTrigger).toHaveAttribute('aria-expanded', 'true'),
    );

    // Browser opening to preview the selection never collapsed Files — both
    // panes stay expanded simultaneously.
    expect(filesTrigger).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getAllByTestId('source-preview-image-1').length,
    ).toBeGreaterThan(1);
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
      expect(updateThreadContextEffect).toHaveBeenCalledWith(
        'thread-1',
        {
          brandId: 'brand-1',
          expectedContextVersion: 3,
        },
        expect.any(AbortSignal),
      ),
    );
  });

  it('hands the single conversation to the mobile drawer while it is open', () => {
    navigation.pathname = '/acme/moonrise/workspace';
    navigation.searchParams = new URLSearchParams();

    render(
      <WorkspaceInspectorProvider>
        <MobileInspectorOpenFixture />
        <UniversalWorkspaceShell agentApiService={agentApiService}>
          <div>Workspace overview</div>
        </UniversalWorkspaceShell>
      </WorkspaceInspectorProvider>,
    );

    expect(screen.getByTestId('inspector-conversation')).toBeInTheDocument();
    // The shell paints no sub-navbar of its own — the drawer opens from the
    // topbar toggle only.
    expect(
      screen.queryByRole('button', { name: 'Inspector' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Conversation' }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Open inspector drawer' }),
    );

    // Still exactly one: both inspector hosts stay in the DOM, so a second copy
    // here would portal a second prompt bar into the one shell composer slot.
    expect(screen.getAllByTestId('inspector-conversation')).toHaveLength(1);
    expect(
      screen.getAllByTestId('workspace-inspector-composer-slot'),
    ).toHaveLength(1);
    // Desktop + mobile inspector hosts can both expose the Context tab label.
    expect(screen.getAllByText('Context').length).toBeGreaterThan(0);
  });

  it('keeps the inspector conversation and composer mounted when collapsed', () => {
    navigation.pathname = '/acme/moonrise/workspace';
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
    const inspectorContent = screen.getByTestId('workspace-inspector-content');

    expect(inspectorContent).toHaveStyle({
      minWidth: '320px',
      width: '320px',
    });

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
    expect(screen.getByTestId('workspace-inspector-content')).toBe(
      inspectorContent,
    );
    expect(inspectorContent).toHaveStyle({
      minWidth: '320px',
      width: '320px',
    });
    expect(inspectorConversationMount).toHaveBeenCalledTimes(1);
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
    expect(
      screen.getAllByText('Authoritative Analytics context').length,
    ).toBeGreaterThan(0);
    expect(
      await screen.findByText('Visible analytics query'),
    ).toBeInTheDocument();
    // The inspector renders the adapter's real context, never developer copy:
    // no raw `route:/…` breadcrumb and no `Registered … adapter slot` fallback.
    expect(screen.queryByText(/adapter slot/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^route:\//)).not.toBeInTheDocument();
  });

  it('mounts the brand overview registration in the harness inspector', async () => {
    navigation.pathname = '/acme/moonrise/workspace';

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
    navigation.pathname = '/acme/moonrise/studio/storyboard';
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
    ['/acme/moonrise/automation/workflows/new'],
    ['/acme/moonrise/automation/workflows/workflow-1'],
    ['/acme/moonrise/automation/workflows'],
    ['/acme/moonrise/automation/templates'],
    ['/acme/moonrise/automation/runs'],
    ['/acme/moonrise/automation/runs/run-1'],
  ])('renders the workflow inspector on %s', (pathname) => {
    navigation.pathname = pathname;
    navigation.searchParams = new URLSearchParams();

    render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Workflow canvas</div>
      </UniversalWorkspaceShell>,
    );

    const inspector = screen.getByText('Workflow surface inspector');
    expect(inspector).toBeInTheDocument();
    // The inspector resolves its own selection from the raw pathname, so the
    // shell must hand it the untouched route plus the retained thread scope.
    expect(inspector).toHaveAttribute('data-inspector-pathname', pathname);
    expect(inspector).toHaveAttribute('data-inspector-thread', 'thread-1');
    expect(inspector).toHaveAttribute('data-inspector-context-version', '3');
  });

  it.each([
    ['/acme/moonrise/automation'],
    ['/acme/moonrise/settings/skills'],
    ['/acme/moonrise/automation/library'],
    ['/acme/moonrise/automation/agents'],
  ])('keeps the generic inspector on %s', (pathname) => {
    navigation.pathname = pathname;
    navigation.searchParams = new URLSearchParams();

    render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Automation canvas</div>
      </UniversalWorkspaceShell>,
    );

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
      '/acme/moonrise/publishing/remix?sourceArtifact=ingredient%3Aingredient-1',
    );
  });

  it('keeps effective scope in the inspector and renders composer controls once', () => {
    navigation.pathname = '/acme/moonrise/workspace';

    render(
      <UniversalWorkspaceShell
        agentApiService={agentApiService}
        composerScopeControls={<span>Scoped controls</span>}
      >
        <div>Conversation</div>
      </UniversalWorkspaceShell>,
    );

    expect(screen.getAllByText('Scoped controls')).toHaveLength(1);
    expect(screen.getAllByText('Thread scope')).toHaveLength(1);
    expect(screen.getByTestId('workspace-effective-scope')).toBeInTheDocument();
  });

  it('keeps generic product context cards and actions off conversation routes', () => {
    render(
      <UniversalWorkspaceShell agentApiService={agentApiService}>
        <div>Conversation</div>
      </UniversalWorkspaceShell>,
    );

    expect(
      screen.getByText(
        'Context from the active conversation appears here as the agent works.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-effective-scope')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Choose workflow' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Open overlay preview' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Return to conversation' }),
    ).toBeNull();
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
      expect.stringContaining('/publishing/calendar'),
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
      screen.getAllByRole('button', { name: 'Open overlay preview' })[0],
    );

    expect(router.push).toHaveBeenCalledWith(
      '/acme/moonrise/workspace?overlay=shell-preview',
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
    navigation.pathname = '/acme/moonrise/workspace';
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

    navigation.pathname = '/other-org/other-brand/workspace';
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
    navigation.pathname = '/acme/moonrise/publishing/calendar';
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
      '/acme/moonrise/publishing/calendar?taskId=task-1',
    );
  });
});
