import type { WorkspacePanelHeaderProps } from '@props/ui/workspace-panel.props';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import WorkspacePanelHeader from './WorkspacePanelHeader';

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
function renderHeader(overrides: Partial<WorkspacePanelHeaderProps> = {}) {
  const props: WorkspacePanelHeaderProps = {
    activeView: 'agent',
    hasAgent: true,
    onClose: vi.fn(),
    onNewThread: vi.fn(),
    onOpenFullPage: vi.fn(),
    onSelectView: vi.fn(),
    ...overrides,
  };
  return { ...render(<WorkspacePanelHeader {...props} />), props };
}
describe('WorkspacePanelHeader', () => {
  it('names the Chat view and offers icon actions with no tab strip', () => {
    renderHeader();
    expect(screen.getAllByTestId('workspace-panel-header')).toHaveLength(1);
    expect(screen.getByTestId('workspace-panel-title')).toHaveTextContent(
      'Chat',
    );
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
    for (const name of [
      'History',
      'New thread',
      'Open full page',
      'Close panel',
    ]) {
      expect(screen.getByRole('button', { name })).toBeVisible();
    }
  });
  it('opens History from the Chat header', () => {
    const { props } = renderHeader();
    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    expect(props.onSelectView).toHaveBeenCalledWith('history');
  });
  it('shows History with a way back to Chat', () => {
    const { props } = renderHeader({ activeView: 'history' });
    expect(screen.getByTestId('workspace-panel-title')).toHaveTextContent(
      'History',
    );
    expect(screen.queryByRole('button', { name: 'Open full page' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back to chat' }));
    expect(props.onSelectView).toHaveBeenCalledWith('agent');
  });
  it('starts a conversation and hands off full-page', () => {
    const { props } = renderHeader();
    fireEvent.click(screen.getByRole('button', { name: 'New thread' }));
    expect(props.onNewThread).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Open full page' }));
    expect(props.onOpenFullPage).toHaveBeenCalledTimes(1);
  });
  it('keeps Context to its title and the close control', () => {
    const { props } = renderHeader({ activeView: 'details' });
    expect(screen.getByTestId('workspace-panel-title')).toHaveTextContent(
      'Context',
    );
    expect(screen.queryByRole('button', { name: 'History' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'New thread' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close panel' }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
  it('keeps selection-only surfaces focused on Context', () => {
    renderHeader({ activeView: 'details', hasAgent: false });
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Close panel' })).toBeVisible();
  });
});
