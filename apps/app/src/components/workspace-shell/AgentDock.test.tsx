import {
  AGENT_DOCK_MAX_HEIGHT,
  AGENT_DOCK_MIN_HEIGHT,
} from '@contexts/ui/agent-dock-context';
import type { AgentDockContextValue } from '@genfeedai/props/ui/agent-dock.props';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AgentDock from './AgentDock';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

function buildDock(
  overrides: Partial<AgentDockContextValue> = {},
): AgentDockContextValue {
  return {
    attachContent: vi.fn(() => true),
    close: vi.fn(),
    height: 320,
    isAvailable: true,
    isOpen: true,
    open: vi.fn(),
    registerAttachHandler: vi.fn(() => () => undefined),
    setHeight: vi.fn(),
    setIsAvailable: vi.fn(),
    toggle: vi.fn(),
    ...overrides,
  };
}

function renderDock(
  dock: AgentDockContextValue,
  options: { isCompact?: boolean; onOpenFullPage?: () => void } = {},
) {
  const composerSlotRef = vi.fn();
  const onOpenFullPage = options.onOpenFullPage ?? vi.fn();
  const view = render(
    <AgentDock
      composerSlotRef={composerSlotRef}
      dock={dock}
      isCompact={options.isCompact ?? false}
      onOpenFullPage={onOpenFullPage}
      threadTitle="Spring launch plan"
    >
      <p>Conversation transcript</p>
      <div contentEditable suppressContentEditableWarning>
        composer
      </div>
    </AgentDock>,
  );

  return { ...view, composerSlotRef, onOpenFullPage };
}

describe('AgentDock', () => {
  it('shows the conversation in a labelled region while open', () => {
    const { composerSlotRef } = renderDock(buildDock());

    const region = screen.getByRole('region', { name: 'Agent' });
    expect(region).toHaveStyle({ height: '320px' });
    expect(region).toHaveTextContent('Conversation transcript');
    expect(screen.getByTestId('agent-dock-thread-title')).toHaveTextContent(
      'Spring launch plan',
    );
    expect(composerSlotRef).toHaveBeenCalledWith(
      screen.getByTestId('agent-dock-composer-slot'),
    );
  });

  it('shows the conversation scope controls above the transcript', () => {
    render(
      <AgentDock
        dock={buildDock()}
        isCompact={false}
        onOpenFullPage={vi.fn()}
        scopeControls={<span>Acme · Moonrise</span>}
      >
        <p>Conversation transcript</p>
      </AgentDock>,
    );

    expect(screen.getByTestId('agent-dock-scope')).toHaveTextContent(
      'Acme · Moonrise',
    );
  });

  it('stays mounted but hidden while closed', () => {
    renderDock(buildDock({ isOpen: false }));

    expect(screen.queryByRole('region', { name: 'Agent' })).toBeNull();
    expect(screen.getByTestId('agent-dock')).not.toBeVisible();
    expect(screen.getByText('Conversation transcript')).toBeInTheDocument();
  });

  it('opens the full conversation and closes from its header', () => {
    const dock = buildDock();
    const { onOpenFullPage } = renderDock(dock);

    fireEvent.click(screen.getByRole('button', { name: 'Open full page' }));
    expect(onOpenFullPage).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Close agent' }));
    expect(dock.close).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape inside the dock and returns focus', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const dock = buildDock();
    renderDock(dock);

    const composer = screen.getByText('composer');
    composer.focus();
    fireEvent.keyDown(composer, { key: 'Escape' });

    expect(dock.close).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('moves focus into the composer when it opens', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame'] });
    try {
      renderDock(buildDock());
      act(() => {
        vi.advanceTimersToNextFrame();
      });

      expect(document.activeElement).toBe(screen.getByText('composer'));
    } finally {
      vi.useRealTimers();
    }
  });

  it('resizes from the keyboard within its bounds', () => {
    const dock = buildDock();
    renderDock(dock);

    const handle = screen.getByRole('separator', { name: 'Resize agent' });
    expect(handle).toHaveAttribute('aria-valuenow', '320');
    expect(handle).toHaveAttribute('aria-orientation', 'horizontal');

    fireEvent.keyDown(handle, { key: 'ArrowUp' });
    expect(dock.setHeight).toHaveBeenLastCalledWith(336);
    fireEvent.keyDown(handle, { key: 'ArrowDown', shiftKey: true });
    expect(dock.setHeight).toHaveBeenLastCalledWith(272);
    fireEvent.keyDown(handle, { key: 'Home' });
    expect(dock.setHeight).toHaveBeenLastCalledWith(AGENT_DOCK_MAX_HEIGHT);
    fireEvent.keyDown(handle, { key: 'End' });
    expect(dock.setHeight).toHaveBeenLastCalledWith(AGENT_DOCK_MIN_HEIGHT);
  });

  it('renders as a bottom sheet below xl', () => {
    const dock = buildDock();
    renderDock(dock, { isCompact: true });

    const sheet = screen.getByRole('dialog', { name: 'Agent' });
    expect(sheet).toHaveTextContent('Conversation transcript');
    expect(screen.queryByRole('separator')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Close agent' }));
    expect(dock.close).toHaveBeenCalled();
  });
});
