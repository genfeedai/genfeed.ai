import type { AgentDockContextValue } from '@genfeedai/props/ui/agent-dock.props';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import AgentDock from './AgentDock';
import WorkspacePanelHeader from './WorkspacePanelHeader';

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
    isAvailable: true,
    isOpen: true,
    open: vi.fn(),
    panel: null,
    registerAttachHandler: vi.fn(() => () => undefined),
    registerPanel: vi.fn(),
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
      header={
        <WorkspacePanelHeader
          activeView="agent"
          hasAgent
          onClose={dock.close}
          onNewThread={vi.fn()}
          onOpenFullPage={onOpenFullPage}
          onSelectView={vi.fn()}
        />
      }
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
    <AgentDock dock={dock} isCompact={isCompact} header={<p>Header</p>}>
      <StatefulConversation />
    </AgentDock>
  );
}

function CompactViews({ dock }: { dock: AgentDockContextValue }) {
  const [tab, setTab] = useState<'agent' | 'details' | 'history'>('agent');
  return (
    <AgentDock
      dock={dock}
      isCompact
      isTabActive={tab === 'agent'}
      header={
        <>
          <WorkspacePanelHeader
            activeView={tab}
            hasAgent
            onClose={dock.close}
            onNewThread={vi.fn()}
            onOpenFullPage={vi.fn()}
            onSelectView={setTab}
          />
          {/* Stand in for the topbar's Chat and Context toggles. */}
          <button onClick={() => setTab('agent')} type="button">
            Show chat
          </button>
          <button onClick={() => setTab('details')} type="button">
            Show context
          </button>
        </>
      }
      alternateContent={
        <p>{tab === 'history' ? 'Real history view' : 'Actual context view'}</p>
      }
    >
      <StatefulConversation />
    </AgentDock>
  );
}

describe('AgentDock', () => {
  it('shows the conversation in a labelled panel region while open', () => {
    const { composerSlotRef } = renderDock(buildDock());

    const region = screen.getByRole('region', { name: 'Agent' });
    expect(region).toHaveTextContent('Conversation transcript');
    expect(composerSlotRef).toHaveBeenCalledWith(
      screen.getByTestId('agent-dock-composer-slot'),
    );
  });

  it('shows the conversation scope controls above the transcript', () => {
    render(
      <AgentDock
        dock={buildDock()}
        isCompact={false}
        header={<p>Header</p>}
        scopeControls={<span>Acme · Moonrise</span>}
      >
        <p>Conversation transcript</p>
      </AgentDock>,
    );

    const scope = screen.getByTestId('agent-dock-scope');
    expect(scope).toHaveTextContent('Acme · Moonrise');
    expect(
      scope.compareDocumentPosition(
        screen.getByText('Conversation transcript'),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('stays mounted but hidden while closed', () => {
    renderDock(buildDock({ isOpen: false }));

    expect(screen.queryByRole('region', { name: 'Agent' })).toBeNull();
    expect(screen.getByTestId('agent-dock')).not.toBeVisible();
    expect(screen.getByText('Conversation transcript')).toBeInTheDocument();
  });

  it('stays mounted but hidden while the Details tab is in front', () => {
    render(
      <AgentDock
        dock={buildDock()}
        isCompact={false}
        isTabActive={false}
        header={<p>Header</p>}
      >
        <p>Conversation transcript</p>
      </AgentDock>,
    );

    expect(screen.queryByRole('region', { name: 'Agent' })).toBeNull();
    expect(screen.getByTestId('agent-dock')).not.toBeVisible();
    expect(screen.getByText('Conversation transcript')).toBeInTheDocument();
  });

  it('closes on Escape inside the panel and returns focus', () => {
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
        header={<p>Header</p>}
      >
        <div contentEditable suppressContentEditableWarning>
          composer
        </div>
      </AgentDock>,
    );
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

  it('renders the unified header in the bottom sheet below xl', async () => {
    const dock = buildDock();
    const { onOpenFullPage } = renderDock(dock, { isCompact: true });

    const sheet = screen.getByRole('dialog', { name: 'Agent' });
    expect(sheet).toHaveTextContent('Conversation transcript');
    expect(screen.queryByRole('separator')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Open full page' }));
    expect(onOpenFullPage).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Close panel' }));
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

  it('keeps the conversation mounted while another tab is in front', () => {
    lifecycle.mounts = 0;
    lifecycle.unmounts = 0;
    const dock = buildDock({ isOpen: true });
    const view = render(renderStateful(dock, false));

    fireEvent.click(screen.getByRole('button', { name: 'Draft: empty' }));
    view.rerender(
      <AgentDock
        dock={dock}
        isCompact={false}
        isTabActive={false}
        header={<p>Header</p>}
      >
        <StatefulConversation />
      </AgentDock>,
    );
    view.rerender(renderStateful(dock, false));

    expect(lifecycle.mounts).toBe(1);
    expect(lifecycle.unmounts).toBe(0);
    expect(
      screen.getByRole('button', { name: 'Draft: half-written' }),
    ).toBeInTheDocument();
  });

  it('returns focus when something outside the panel closes it', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const dock = buildDock({ isOpen: true });
    const view = render(renderStateful(dock, false));

    screen.getByRole('button', { name: 'Draft: empty' }).focus();
    // ⌘J and the topbar close through the provider, not the panel's controls.
    view.rerender(renderStateful({ ...dock, isOpen: false }, false));

    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('keeps one compact header and the same draft across Context and History views', () => {
    lifecycle.mounts = 0;
    lifecycle.unmounts = 0;
    const dock = buildDock();
    render(<CompactViews dock={dock} />);
    expect(screen.getAllByTestId('workspace-panel-header')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Draft: empty' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show context' }));
    expect(screen.getByText('Actual context view')).toBeVisible();
    expect(screen.getByText('Draft: half-written')).not.toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Show chat' }));
    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    expect(screen.getByText('Real history view')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Back to chat' }));
    expect(
      screen.getByRole('button', { name: 'Draft: half-written' }),
    ).toBeVisible();
    expect(lifecycle).toEqual({ mounts: 1, unmounts: 0 });
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
