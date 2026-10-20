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
    activeChatId: 'thread-1',
    activeTab: 'agent',
    chatTabs: [
      { id: 'thread-1', title: 'Spring launch plan' },
      { id: 'thread-2', title: 'Caption ideas' },
    ],
    hasDetails: true,
    onClose: vi.fn(),
    onCloseChat: vi.fn(),
    onNewThread: vi.fn(),
    onOpenFullPage: vi.fn(),
    onSelectChat: vi.fn(),
    onSelectTab: vi.fn(),
    threadMenu: {},
    ...overrides,
  };

  return { ...render(<WorkspacePanelTabs {...props} />), props };
}

describe('WorkspacePanelTabs', () => {
  it('lists every open chat and Details, and marks the one in front', () => {
    renderTabs();

    expect(screen.getByRole('tablist', { name: 'Panel tabs' })).toBeVisible();
    expect(
      screen.getByRole('tab', { name: 'Spring launch plan' }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Caption ideas' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('puts Details in front when it is the active tab', () => {
    renderTabs({ activeTab: 'details' });

    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      screen.getByRole('tab', { name: 'Spring launch plan' }),
    ).toHaveAttribute('aria-selected', 'false');
  });

  it('selects a chat or Details on press', () => {
    const { props } = renderTabs();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Caption ideas' }));
    expect(props.onSelectChat).toHaveBeenCalledWith('thread-2');

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Details' }));
    expect(props.onSelectTab).toHaveBeenCalledWith('details');
  });

  it('closes a chat from its own control without selecting it', () => {
    const { props } = renderTabs();

    fireEvent.click(
      screen.getByRole('button', { name: 'Close Caption ideas' }),
    );

    expect(props.onCloseChat).toHaveBeenCalledWith('thread-2');
    expect(props.onSelectChat).not.toHaveBeenCalled();
  });

  it('offers no close control while the only chat is unsaved', () => {
    renderTabs({
      activeChatId: 'new',
      chatTabs: [{ id: 'new', title: 'New chat' }],
      hasDetails: false,
      onCloseChat: undefined,
    });

    expect(screen.getByRole('tab', { name: 'New chat' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      screen.queryByRole('button', { name: /^Close New chat/ }),
    ).toBeNull();
  });

  it('only lists Details when the shell hosts no agent', () => {
    renderTabs({ activeTab: 'details', chatTabs: [] });

    expect(screen.getAllByRole('tab')).toHaveLength(1);
    expect(screen.getByRole('tab', { name: 'Details' })).toBeVisible();
    expect(screen.queryByTestId('workspace-panel-new-thread')).toBeNull();
  });

  it('starts a chat and opens the full page from the agent controls', () => {
    const { props } = renderTabs();

    fireEvent.click(screen.getByRole('button', { name: 'New thread' }));
    expect(props.onNewThread).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Open full page' }));
    expect(props.onOpenFullPage).toHaveBeenCalledTimes(1);
  });

  it('hides the full page control while Details is in front, and still closes the panel', () => {
    const { props } = renderTabs({ activeTab: 'details' });

    expect(screen.queryByTestId('workspace-panel-full-page')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close panel' }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
