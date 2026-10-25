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
vi.mock('next/navigation', () => ({
  usePathname: () => '/acme/moonrise/workspace',
  useSearchParams: () => new URLSearchParams(),
}));
function renderTabs(overrides: Partial<WorkspacePanelTabsProps> = {}) {
  const props: WorkspacePanelTabsProps = {
    activeTab: 'agent',
    hasAgent: true,
    onClose: vi.fn(),
    onNewThread: vi.fn(),
    onOpenFullPage: vi.fn(),
    onSelectTab: vi.fn(),
    ...overrides,
  };
  return { ...render(<WorkspacePanelTabs {...props} />), props };
}
describe('WorkspacePanelTabs', () => {
  it('has one header with stable named views and labeled actions', () => {
    renderTabs();
    expect(screen.getAllByTestId('workspace-panel-header')).toHaveLength(1);
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Chat',
      'Context',
      'History',
    ]);
    expect(screen.getByRole('tab', { name: 'Chat' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('button', { name: 'More' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Close panel' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'New thread' })).toBeNull();
  });
  it('selects Context and History without selecting a conversation', () => {
    const { props } = renderTabs();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Context' }));
    expect(props.onSelectTab).toHaveBeenCalledWith('details');
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'History' }));
    expect(props.onSelectTab).toHaveBeenCalledWith('history');
  });
  it('marks History active and still offers Chat and empty Context', () => {
    renderTabs({ activeTab: 'history' });
    expect(screen.getByRole('tab', { name: 'History' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'Context' })).toBeVisible();
  });
  it('starts a conversation and hands off full-page from the shared More menu', async () => {
    const { props } = renderTabs();
    fireEvent.keyDown(screen.getByRole('button', { name: 'More' }), {
      key: 'Enter',
    });
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'New thread' }),
    );
    expect(props.onNewThread).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('button', { name: 'More' }), {
      key: 'Enter',
    });
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Open full page' }),
    );
    expect(props.onOpenFullPage).toHaveBeenCalledTimes(1);
  });
  it('keeps selection-only surfaces focused on Context', () => {
    const { props } = renderTabs({ activeTab: 'details', hasAgent: false });
    expect(screen.getAllByRole('tab')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close panel' }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
