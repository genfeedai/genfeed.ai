import {
  ContextSidebarOutlet,
  ContextSidebarProvider,
  useContextSidebar,
} from '@contexts/ui/context-sidebar-context';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({
  pathname: '/acme/moonrise/automation/workflows/workflow-1',
  searchParams: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => navigation.searchParams,
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@genfeedai/agent', () => ({
  useAgentChatStore: (
    selector: (state: {
      activeThreadId: string;
      threads: { contextVersion: number; id: string }[];
    }) => unknown,
  ) =>
    selector({
      activeThreadId: 'thread-1',
      threads: [{ contextVersion: 3, id: 'thread-1' }],
    }),
}));

vi.mock('./WorkflowSurfaceInspector', () => ({
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
      data-inspector-context-version={contextVersion}
      data-inspector-pathname={pathname}
      data-inspector-thread={threadId}
    >
      Workflow surface inspector
    </div>
  ),
}));

import { WorkflowRunContextPanel } from './WorkflowRunContextPanel';

function ShellProbe() {
  const contextSidebar = useContextSidebar();

  return (
    <>
      <p data-testid="sidebar-state">
        {contextSidebar?.selection
          ? `${contextSidebar.selection.title}:${contextSidebar.isOpen ? 'open' : 'closed'}`
          : 'none'}
      </p>
      <button type="button" onClick={contextSidebar?.toggle}>
        Toggle sidebar
      </button>
    </>
  );
}

function panelTree() {
  return (
    <ContextSidebarProvider>
      <ShellProbe />
      <ContextSidebarOutlet testId="context-sidebar-outlet" />
      <WorkflowRunContextPanel />
    </ContextSidebarProvider>
  );
}

function renderPanel() {
  const view = render(panelTree());

  return {
    ...view,
    navigateTo: (pathname: string) => {
      navigation.pathname = pathname;
      view.rerender(panelTree());
    },
  };
}

describe('WorkflowRunContextPanel', () => {
  beforeEach(() => {
    navigation.pathname = '/acme/moonrise/automation/workflows/workflow-1';
    navigation.searchParams = new URLSearchParams();
  });

  it('registers the workflow closed by default and opens from the toggle', () => {
    renderPanel();

    expect(screen.getByTestId('sidebar-state')).toHaveTextContent(
      'Workflow:closed',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Toggle sidebar' }));

    expect(screen.getByTestId('sidebar-state')).toHaveTextContent(
      'Workflow:open',
    );
    const inspector = screen.getByText('Workflow surface inspector');
    expect(inspector).toHaveAttribute(
      'data-inspector-pathname',
      '/acme/moonrise/automation/workflows/workflow-1',
    );
    expect(inspector).toHaveAttribute('data-inspector-thread', 'thread-1');
    expect(inspector).toHaveAttribute('data-inspector-context-version', '3');
  });

  it('titles a run route as a workflow run', () => {
    navigation.pathname = '/acme/moonrise/automation/runs/run-1';
    renderPanel();

    expect(screen.getByTestId('sidebar-state')).toHaveTextContent(
      'Workflow run:closed',
    );
  });

  it('follows navigation between workflows and clears on the list', () => {
    const { navigateTo } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Toggle sidebar' }));
    expect(screen.getByTestId('sidebar-state')).toHaveTextContent(
      'Workflow:open',
    );

    navigateTo('/acme/moonrise/automation/workflows/workflow-2');

    // A different workflow is a new selection: it starts closed again.
    expect(screen.getByTestId('sidebar-state')).toHaveTextContent(
      'Workflow:closed',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Toggle sidebar' }));
    expect(screen.getByText('Workflow surface inspector')).toHaveAttribute(
      'data-inspector-pathname',
      '/acme/moonrise/automation/workflows/workflow-2',
    );

    navigateTo('/acme/moonrise/automation/workflows');

    expect(screen.getByTestId('sidebar-state')).toHaveTextContent('none');
    expect(screen.getByTestId('context-sidebar-outlet')).toBeEmptyDOMElement();
  });
});
