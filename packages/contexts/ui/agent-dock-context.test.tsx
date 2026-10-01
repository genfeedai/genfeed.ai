import {
  AGENT_DOCK_CHROME_VISIBLE,
  AGENT_DOCK_DEFAULT_HEIGHT,
  AGENT_DOCK_MAX_HEIGHT,
  AGENT_DOCK_MIN_HEIGHT,
  AGENT_DOCK_STORAGE_KEY,
  AgentDockProvider,
  useAgentDock,
} from '@genfeedai/contexts/ui/agent-dock-context';
import type { AgentDockContentReference } from '@props/ui/agent-dock.props';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    clear: () => {
      store = {};
    },
    getItem: (key: string) => store[key] ?? null,
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: localStorageMock,
});

const REFERENCE: AgentDockContentReference = {
  contentTitle: 'Spring launch still',
  contentType: 'image',
  id: 'ingredient-1',
  kind: 'ingredient',
};

let latestDock: ReturnType<typeof useAgentDock> = null;

function DockProbe({ isAvailable = true }: { readonly isAvailable?: boolean }) {
  const dock = useAgentDock();
  latestDock = dock;
  const setIsAvailable = dock?.setIsAvailable;

  useEffect(() => {
    setIsAvailable?.(isAvailable);
  }, [isAvailable, setIsAvailable]);

  return (
    <p data-testid="dock">
      {dock?.isOpen ? 'open' : 'closed'}:{dock?.height}
    </p>
  );
}

function renderDock(isAvailable = true) {
  return render(
    <AgentDockProvider>
      <DockProbe isAvailable={isAvailable} />
    </AgentDockProvider>,
  );
}

function pressShortcut(init: KeyboardEventInit = { metaKey: true }) {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key: 'j',
    ...init,
  });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

describe('AgentDockProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
    latestDock = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts closed at the default height', () => {
    renderDock();

    expect(screen.getByTestId('dock')).toHaveTextContent(
      `closed:${AGENT_DOCK_DEFAULT_HEIGHT}`,
    );
  });

  it('restores a clamped height and stays closed while dock chrome is hidden', () => {
    expect(AGENT_DOCK_CHROME_VISIBLE).toBe(false);
    window.localStorage.setItem(
      AGENT_DOCK_STORAGE_KEY,
      JSON.stringify({ height: 9999, isOpen: true }),
    );

    renderDock();

    expect(screen.getByTestId('dock')).toHaveTextContent(
      `closed:${AGENT_DOCK_MAX_HEIGHT}`,
    );

    act(() => {
      latestDock?.setHeight(10);
      latestDock?.close();
    });

    expect(screen.getByTestId('dock')).toHaveTextContent(
      `closed:${AGENT_DOCK_MIN_HEIGHT}`,
    );
    expect(
      JSON.parse(window.localStorage.getItem(AGENT_DOCK_STORAGE_KEY) ?? '{}'),
    ).toEqual({ height: AGENT_DOCK_MIN_HEIGHT, isOpen: false });
  });

  it('ignores unreadable persisted state', () => {
    window.localStorage.setItem(AGENT_DOCK_STORAGE_KEY, '{not json');

    renderDock();

    expect(screen.getByTestId('dock')).toHaveTextContent(
      `closed:${AGENT_DOCK_DEFAULT_HEIGHT}`,
    );
  });

  it('toggles on ⌘J and Ctrl+J while a shell hosts the dock', () => {
    renderDock();

    const event = pressShortcut({ metaKey: true });
    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByTestId('dock')).toHaveTextContent(/^open/);

    pressShortcut({ ctrlKey: true });
    expect(screen.getByTestId('dock')).toHaveTextContent(/^closed/);
  });

  it('leaves ⌘J alone where no dock is hosted, and ignores other chords', () => {
    const { rerender } = renderDock(false);

    const event = pressShortcut({ metaKey: true });
    expect(event.defaultPrevented).toBe(false);
    expect(screen.getByTestId('dock')).toHaveTextContent(/^closed/);

    rerender(
      <AgentDockProvider>
        <DockProbe />
      </AgentDockProvider>,
    );
    pressShortcut({ metaKey: true, shiftKey: true });
    pressShortcut({});
    expect(screen.getByTestId('dock')).toHaveTextContent(/^closed/);
  });

  it('attaches through the registered shell handler and opens the dock', () => {
    renderDock();
    const handler = vi.fn();

    let isAttached = false;
    act(() => {
      isAttached = latestDock?.attachContent(REFERENCE) ?? false;
    });
    expect(isAttached).toBe(false);
    expect(screen.getByTestId('dock')).toHaveTextContent(/^closed/);

    let unregister: () => void = () => undefined;
    act(() => {
      unregister = latestDock?.registerAttachHandler(handler) ?? unregister;
    });
    act(() => {
      isAttached = latestDock?.attachContent(REFERENCE) ?? false;
    });

    expect(isAttached).toBe(true);
    expect(handler).toHaveBeenCalledWith(REFERENCE);
    expect(screen.getByTestId('dock')).toHaveTextContent(/^open/);

    act(() => {
      unregister();
    });
    act(() => {
      isAttached = latestDock?.attachContent(REFERENCE) ?? false;
    });
    expect(isAttached).toBe(false);
  });

  it('opens and closes from its own controls', () => {
    render(
      <AgentDockProvider>
        <DockProbe />
        <ToggleButton />
      </AgentDockProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'toggle' }));
    expect(screen.getByTestId('dock')).toHaveTextContent(/^open/);
    fireEvent.click(screen.getByRole('button', { name: 'toggle' }));
    expect(screen.getByTestId('dock')).toHaveTextContent(/^closed/);
  });
});

function ToggleButton() {
  const dock = useAgentDock();

  return (
    <button type="button" onClick={dock?.toggle}>
      toggle
    </button>
  );
}
