import type { WorkspacePanelTabsProps } from '@props/ui/workspace-panel.props';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import WorkspacePanelTabs from './WorkspacePanelTabs';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

function renderTabs(overrides: Partial<WorkspacePanelTabsProps> = {}) {
  const props: WorkspacePanelTabsProps = {
    activeTab: 'agent',
    hasAgent: true,
    hasDetails: true,
    onClose: vi.fn(),
    onNewThread: vi.fn(),
    onOpenFullPage: vi.fn(),
    onSelectTab: vi.fn(),
    threadMenu: { threadTitle: 'Spring launch plan' },
    ...overrides,
  };

  return { ...render(<WorkspacePanelTabs {...props} />), props };
}

describe('WorkspacePanelTabs', () => {
  it('lists the agent and details tabs and marks the active one', () => {
    renderTabs({ activeTab: 'details' });

    expect(screen.getByRole('tablist', { name: 'Panel tabs' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Agent' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('selects a tab on click', () => {
    const { props } = renderTabs();

    fireEvent.click(screen.getByRole('tab', { name: 'Details' }));

    expect(props.onSelectTab).toHaveBeenCalledWith('details');
  });

  it('wires the tabs to their panels and moves between them with the arrow keys', () => {
    const { props } = renderTabs();
    const agentTab = screen.getByRole('tab', { name: 'Agent' });
    const detailsTab = screen.getByRole('tab', { name: 'Details' });

    expect(agentTab).toHaveAttribute('aria-controls', 'workspace-agent-panel');
    expect(detailsTab).toHaveAttribute(
      'aria-controls',
      'workspace-details-panel',
    );
    expect(agentTab).toHaveAttribute('tabindex', '0');
    expect(detailsTab).toHaveAttribute('tabindex', '-1');

    fireEvent.keyDown(agentTab, { key: 'ArrowRight' });
    expect(props.onSelectTab).toHaveBeenLastCalledWith('details');
    fireEvent.keyDown(agentTab, { key: 'ArrowLeft' });
    expect(props.onSelectTab).toHaveBeenLastCalledWith('details');
    fireEvent.keyDown(agentTab, { key: 'Home' });
    expect(props.onSelectTab).toHaveBeenLastCalledWith('agent');
    fireEvent.keyDown(agentTab, { key: 'End' });
    expect(props.onSelectTab).toHaveBeenLastCalledWith('details');
  });

  it('only lists the tabs the shell can show', () => {
    renderTabs({ hasAgent: false, activeTab: 'details' });

    expect(screen.queryByRole('tab', { name: 'Agent' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Details' })).toBeVisible();
    expect(screen.queryByTestId('workspace-panel-new-thread')).toBeNull();
  });

  it('shows the thread menu, new thread and full page controls on the agent tab', () => {
    const { props } = renderTabs();

    expect(screen.getByTestId('agent-dock-thread-title')).toHaveTextContent(
      'Spring launch plan',
    );
    fireEvent.click(screen.getByRole('button', { name: 'New thread' }));
    expect(props.onNewThread).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Open full page' }));
    expect(props.onOpenFullPage).toHaveBeenCalledTimes(1);
  });

  it('hides the agent controls while Details is in front, and still closes the panel', () => {
    const { props } = renderTabs({ activeTab: 'details' });

    expect(screen.queryByTestId('agent-dock-thread-title')).toBeNull();
    expect(screen.queryByTestId('workspace-panel-full-page')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close panel' }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
