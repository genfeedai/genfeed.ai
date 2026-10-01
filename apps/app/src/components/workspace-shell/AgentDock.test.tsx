import {
  AGENT_DOCK_MAX_HEIGHT,
  AGENT_DOCK_MIN_HEIGHT,
} from '@contexts/ui/agent-dock-context';
import type { AgentDockContextValue } from '@genfeedai/props/ui/agent-dock.props';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect, useState } from 'react';
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

const lifecycle = { mounts: 0, unmounts: 0 };

// Stands in for the conversation: counts mounts and keeps local state, like an
// upload or a streaming run would.
function StatefulConversation() {
  const [draft, setDraft] = useState('');

  useEffect(() => {
    lifecycle.mounts += 1;
    return () => {
      lifecycle.unmounts += 1;
    };
  }, []);

  return (
    <button type="button" onClick={() => setDraft('half-written')}>
      Draft: {draft || 'empty'}
    </button>
  );
}

function renderStateful(dock: AgentDockContextValue, isCompact: boolean) {
  return (
    <AgentDock dock={dock} isCompact={isCompact} onOpenFullPage={vi.fn()}>
      <StatefulConversation />
    </AgentDock>
  );
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
    const view = renderDock(dock);

    const composer = screen.getByText('composer');
    composer.focus();
    fireEvent.keyDown(composer, { key: 'Escape' });
    expect(dock.close).toHaveBeenCalledTimes(1);

    // The provider applies the close; focus follows it back out.
    view.rerender(
      <AgentDock
        dock={{ ...dock, isOpen: false }}
        isCompact={false}
        onOpenFullPage={vi.fn()}
      >
        <div contentEditable suppressContentEditableWarning>
          composer
        </div>
      </AgentDock>,
    );
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('returns keyboard focus to the page bubble after the overlay closes', () => {
    const dock = buildDock({ isOpen: false });
    const view = render(
      <AgentDock
        chrome="bubble"
        dock={dock}
        isCompact={false}
        onOpenFullPage={vi.fn()}
      >
        <div contentEditable suppressContentEditableWarning>
          composer
        </div>
      </AgentDock>,
    );
    const launcher = screen.getByTestId('agent-conversation-bubble');
    launcher.focus();
    fireEvent.click(launcher);
    expect(dock.open).toHaveBeenCalledTimes(1);

    view.rerender(
      <AgentDock
        chrome="bubble"
        dock={{ ...dock, isOpen: true }}
        isCompact={false}
        onOpenFullPage={vi.fn()}
      >
        <div contentEditable suppressContentEditableWarning>
          composer
        </div>
      </AgentDock>,
    );
    view.rerender(
      <AgentDock
        chrome="bubble"
        dock={{ ...dock, isOpen: false }}
        isCompact={false}
        onOpenFullPage={vi.fn()}
      >
        <div contentEditable suppressContentEditableWarning>
          composer
        </div>
      </AgentDock>,
    );

    expect(document.activeElement).toBe(
      screen.getByTestId('agent-conversation-bubble'),
    );
  });

  it('returns keyboard focus to the conversation bubble after the overlay closes', () => {
    const dock = buildDock({ isOpen: false });
    const view = render(
      <AgentDock
        chrome="bubble"
        dock={dock}
        hasMajorPromptBar
        isCompact={false}
        onOpenFullPage={vi.fn()}
      >
        <div contentEditable suppressContentEditableWarning>
          composer
        </div>
      </AgentDock>,
    );
    const launcher = screen.getByTestId('agent-conversation-bubble');
    launcher.focus();
    fireEvent.click(launcher);
    expect(dock.open).toHaveBeenCalledTimes(1);

    view.rerender(
      <AgentDock
        chrome="bubble"
        dock={{ ...dock, isOpen: true }}
        hasMajorPromptBar
        isCompact={false}
        onOpenFullPage={vi.fn()}
      >
        <div contentEditable suppressContentEditableWarning>
          composer
        </div>
      </AgentDock>,
    );
    view.rerender(
      <AgentDock
        chrome="bubble"
        dock={{ ...dock, isOpen: false }}
        hasMajorPromptBar
        isCompact={false}
        onOpenFullPage={vi.fn()}
      >
        <div contentEditable suppressContentEditableWarning>
          composer
        </div>
      </AgentDock>,
    );

    expect(document.activeElement).toBe(
      screen.getByTestId('agent-conversation-bubble'),
    );
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

  it('keeps the conversation mounted across sheet close and the breakpoint', () => {
    lifecycle.mounts = 0;
    lifecycle.unmounts = 0;
    const dock = buildDock({ isOpen: true });
    const view = render(renderStateful(dock, true));

    fireEvent.click(screen.getByRole('button', { name: 'Draft: empty' }));
    expect(
      screen.getByRole('button', { name: 'Draft: half-written' }),
    ).toBeInTheDocument();

    // Close the sheet, then cross into the desktop layout and open there.
    view.rerender(renderStateful({ ...dock, isOpen: false }, true));
    view.rerender(renderStateful({ ...dock, isOpen: true }, false));

    expect(lifecycle.mounts).toBe(1);
    expect(lifecycle.unmounts).toBe(0);
    expect(
      within(screen.getByRole('region', { name: 'Agent' })).getByRole(
        'button',
        { name: 'Draft: half-written' },
      ),
    ).toBeInTheDocument();
  });

  it('returns focus when something outside the dock closes it', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const dock = buildDock({ isOpen: true });
    const view = render(renderStateful(dock, false));

    screen.getByRole('button', { name: 'Draft: empty' }).focus();
    // ⌘J and the topbar close through the provider, not the dock's controls.
    view.rerender(renderStateful({ ...dock, isOpen: false }, false));

    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('switches threads and starts a new one from the header menu', () => {
    const onNewThread = vi.fn();
    const onSelectThread = vi.fn();
    render(
      <AgentDock
        activeThreadId="thread-1"
        dock={buildDock()}
        isCompact={false}
        onNewThread={onNewThread}
        onOpenFullPage={vi.fn()}
        onSelectThread={onSelectThread}
        threads={[
          { id: 'thread-1', title: 'Spring launch plan' },
          { id: 'thread-2', title: 'Make three stronger variations' },
        ]}
      >
        <p>Conversation transcript</p>
      </AgentDock>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Spring launch plan' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New thread' }));
    expect(onNewThread).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Spring launch plan' }));
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Make three stronger variations' }),
    );
    expect(onSelectThread).toHaveBeenCalledWith('thread-2');
  });

  it('shows a chat bubble and radial shortcuts while bubble chrome is closed', () => {
    const onSelectSuggestedAction = vi.fn();
    render(
      <AgentDock
        chrome="bubble"
        dock={buildDock({ isOpen: false })}
        isCompact={false}
        onOpenFullPage={vi.fn()}
        onSelectSuggestedAction={onSelectSuggestedAction}
        suggestedActions={[
          {
            id: 'summarize',
            label: 'Summarize',
            prompt: 'Summarize this page',
          },
        ]}
      >
        <p>Conversation transcript</p>
      </AgentDock>,
    );

    expect(screen.getByTestId('agent-conversation-bubble')).toBeVisible();
    expect(screen.queryByTestId('agent-page-promptbar')).toBeNull();
    const shortcut = screen.getByRole('button', {
      name: 'Summarize. Summarize this page',
    });
    expect(shortcut.parentElement).toHaveClass('opacity-0');
    expect(shortcut.parentElement).toHaveClass('pointer-events-none');
    fireEvent.pointerEnter(screen.getByTestId('agent-conversation-bubble'));
    expect(shortcut.parentElement).toHaveClass('opacity-100');
    expect(shortcut.parentElement).not.toHaveClass('pointer-events-none');
    expect(shortcut).toHaveTextContent('Summarize');
    fireEvent.click(shortcut);
    expect(onSelectSuggestedAction).toHaveBeenCalledWith('Summarize this page');
    expect(screen.queryByRole('region', { name: 'Agent' })).toBeNull();
    expect(
      screen.queryByRole('separator', { name: 'Resize agent' }),
    ).toBeNull();
  });

  it('shows a chat bubble on major prompt-bar pages and an overlay when open', async () => {
    const dock = buildDock({ isOpen: false, open: vi.fn() });
    const { rerender } = render(
      <AgentDock
        chrome="bubble"
        dock={dock}
        hasMajorPromptBar
        isCompact={false}
        onOpenFullPage={vi.fn()}
      >
        <p>Conversation transcript</p>
      </AgentDock>,
    );

    expect(screen.getByTestId('agent-conversation-bubble')).toBeVisible();
    expect(screen.queryByTestId('agent-page-promptbar')).toBeNull();

    fireEvent.click(screen.getByTestId('agent-conversation-bubble'));
    expect(dock.open).toHaveBeenCalledTimes(1);

    rerender(
      <AgentDock
        chrome="bubble"
        dock={{ ...dock, isOpen: true }}
        hasMajorPromptBar
        isCompact={false}
        onOpenFullPage={vi.fn()}
      >
        <p>Conversation transcript</p>
      </AgentDock>,
    );

    const overlay = screen.getByRole('region', { name: 'Agent' });
    expect(overlay).toHaveAttribute('data-chrome', 'bubble');
    expect(overlay).toHaveAttribute('data-morph', 'from');
    expect(overlay).toHaveStyle({ transformOrigin: 'bottom right' });
    expect(overlay.style.transform).toContain('--bubble-from-x');
    expect(overlay).toHaveTextContent('Conversation transcript');
    expect(screen.getByTestId('agent-conversation-bubble')).not.toBeVisible();

    await act(async () => {
      await new Promise((resolve) => {
        requestAnimationFrame(() => resolve(undefined));
      });
    });
    const openOverlay = screen.getByRole('region', { name: 'Agent' });
    expect(openOverlay).toHaveAttribute('data-morph', 'open');
    expect(openOverlay.style.transform).toBe('scale(1, 1)');
    expect(
      screen.queryByRole('separator', { name: 'Resize agent' }),
    ).toBeNull();
  });

  it('keeps focus in the conversation when it moves across the breakpoint', () => {
    const dock = buildDock({ isOpen: true });
    const view = render(renderStateful(dock, false));

    screen.getByRole('button', { name: 'Draft: empty' }).focus();
    view.rerender(renderStateful(dock, true));

    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Draft: empty' }),
    );
  });
});
