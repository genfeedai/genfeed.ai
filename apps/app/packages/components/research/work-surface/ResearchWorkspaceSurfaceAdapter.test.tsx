import {
  ContextSidebarOutlet,
  ContextSidebarProvider,
  useContextSidebar,
} from '@contexts/ui/context-sidebar-context';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const store = {
    pageContext: null as null | Record<string, unknown>,
    setPageContext: vi.fn((context: Record<string, unknown>) => {
      store.pageContext = context;
    }),
  };

  return {
    clearFinding: vi.fn(),
    registeredAdapter: null as null | Record<string, unknown>,
    setEmbedded: vi.fn(),
    store,
  };
});

vi.mock('@genfeedai/agent', () => {
  const useAgentChatStore = Object.assign(
    (selector: (state: typeof mocks.store) => unknown) => selector(mocks.store),
    { getState: () => mocks.store },
  );

  return { useAgentChatStore };
});

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    organizationId: 'organization-1',
  }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/acme/moonrise/discovery/overview',
}));

vi.mock('@pages/research/work-surface/ResearchFindingInspector', () => ({
  default: ({ finding }: { finding: { title: string } }) => (
    <div>Research inspector: {finding.title}</div>
  ),
}));

vi.mock('@pages/research/work-surface/ResearchWorkSurfaceProvider', () => ({
  useOptionalResearchWorkSurface: () => ({
    authorizedFinding: {
      metadata: [],
      reference: { id: 'trend-1', kind: 'research-trend-video' },
      title: 'Selected trend',
    },
    clearFinding: mocks.clearFinding,
    setEmbedded: mocks.setEmbedded,
  }),
}));

vi.mock(
  '@/features/research/work-surface/research-workspace-surface-adapter-context',
  () => ({
    useRegisterResearchWorkspaceSurfaceAdapter: (
      adapter: Record<string, unknown>,
    ) => {
      mocks.registeredAdapter = adapter;
    },
    useResearchWorkspaceSurfaceAdapterRegistrationAvailable: () => true,
  }),
);

import ResearchWorkspaceSurfaceAdapter from './ResearchWorkspaceSurfaceAdapter';

function ShellCloseControl() {
  const contextSidebar = useContextSidebar();

  return (
    <button type="button" onClick={contextSidebar?.close}>
      Close sidebar
    </button>
  );
}

describe('ResearchWorkspaceSurfaceAdapter', () => {
  beforeEach(() => {
    mocks.registeredAdapter = null;
    mocks.setEmbedded.mockClear();
    mocks.clearFinding.mockClear();
    mocks.store.pageContext = null;
    mocks.store.setPageContext.mockClear();
  });

  it('binds the visible typed finding to page context without copying content', async () => {
    render(<ResearchWorkspaceSurfaceAdapter />);

    await waitFor(() => {
      expect(mocks.store.pageContext).toMatchObject({
        researchReferences: [
          {
            brandId: 'brand-1',
            id: 'trend-1',
            kind: 'research-trend-video',
            organizationId: 'organization-1',
          },
        ],
        route: '/acme/moonrise/discovery/overview',
      });
    });
    expect(mocks.store.pageContext).not.toHaveProperty('title');
    expect(mocks.store.pageContext).not.toHaveProperty('metadata');
    expect(mocks.setEmbedded).toHaveBeenCalledWith(true);
    expect(mocks.registeredAdapter).toMatchObject({
      surfaceKey: 'discovery',
    });
  });

  it('renders the live finding in the context sidebar and clears it on close', () => {
    render(
      <ContextSidebarProvider>
        <ShellCloseControl />
        <ContextSidebarOutlet testId="context-sidebar-outlet" />
        <ResearchWorkspaceSurfaceAdapter />
      </ContextSidebarProvider>,
    );

    // Portaled from the Discovery layout's tree, so it reads the provider's
    // finding rather than a detached, null work surface.
    expect(screen.getByTestId('context-sidebar-outlet')).toHaveTextContent(
      'Research inspector: Selected trend',
    );
    expect(mocks.registeredAdapter).not.toHaveProperty('inspectorContent');

    fireEvent.click(screen.getByRole('button', { name: 'Close sidebar' }));
    expect(mocks.clearFinding).toHaveBeenCalledTimes(1);
  });
});
