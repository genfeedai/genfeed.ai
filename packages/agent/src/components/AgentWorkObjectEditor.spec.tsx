import { AgentWorkObjectEditor } from '@genfeedai/agent/components/AgentWorkObjectEditor';
import {
  isWorkObjectGenerationBlocked,
  useAgentWorkObjectGateStore,
} from '@genfeedai/agent/stores/agent-work-object-gate.store';
import type { AgentWorkObject } from '@genfeedai/contracts/interfaces';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../apps/app/tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/brand${path}` }),
}));

function makeObject(overrides: Partial<AgentWorkObject> = {}): AgentWorkObject {
  return {
    id: 'script-1',
    kind: 'table',
    title: 'Shooting script',
    revision: 1,
    columns: [
      { key: 'shot', label: 'Shot' },
      { key: 'script', label: 'Script' },
    ],
    rows: [{ shot: 'Opening', script: 'Welcome' }],
    rowCount: 1,
    viewedInSession: false,
    reviewStatus: 'pending',
    href: '/library?asset=script-1',
    reference: {
      kind: 'ingredient',
      serializer: 'ingredient',
      recordId: 'script-1',
      organizationId: 'org-1',
    },
    ...overrides,
  };
}

beforeEach(() => {
  useAgentWorkObjectGateStore.setState({ threads: {} });
  vi.unstubAllGlobals();
});

describe('durable inline work object', () => {
  it('shows editable rows immediately and sends the changed canonical row', async () => {
    const onAction = vi.fn().mockResolvedValue(undefined);
    const object = makeObject({ viewedInSession: true });
    render(<AgentWorkObjectEditor object={object} onAction={onAction} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Script, row 1'), {
      target: { value: 'New opening' },
    });
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Review the draft' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(onAction).toHaveBeenCalledWith(object, 'edit', {
        body: '',
        rows: [{ shot: 'Opening', script: 'New opening' }],
      }),
    );
  });

  it('does not mark an offscreen mounted artifact viewed, then records real visibility', async () => {
    let observe: IntersectionObserverCallback | undefined;
    const disconnect = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          observe = callback;
        }
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = disconnect;
      },
    );
    const object = makeObject();
    const onAction = vi.fn().mockResolvedValue(undefined);
    render(<AgentWorkObjectEditor object={object} onAction={onAction} />);
    expect(
      screen.getByRole('button', { name: 'Review the draft' }),
    ).toBeDisabled();
    expect(onAction).not.toHaveBeenCalled();
    await act(async () =>
      observe?.(
        [{ isIntersecting: false } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
    );
    expect(onAction).not.toHaveBeenCalled();
    await act(async () =>
      observe?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
    );
    expect(onAction).toHaveBeenCalledWith(object, 'view');
    expect(
      screen.getByRole('button', { name: 'Review the draft' }),
    ).toBeDisabled();
  });

  it('preserves unsaved edits when a same-revision poll returns new row references', () => {
    const object = makeObject();
    const onAction = vi.fn();
    const { rerender } = render(
      <AgentWorkObjectEditor object={object} onAction={onAction} />,
    );
    fireEvent.change(screen.getByLabelText('Script, row 1'), {
      target: { value: 'Unsaved draft' },
    });
    rerender(
      <AgentWorkObjectEditor
        object={{
          ...object,
          rows: [...(object.rows ?? [])],
          viewedInSession: true,
        }}
        onAction={onAction}
      />,
    );
    expect(screen.getByLabelText('Script, row 1')).toHaveValue('Unsaved draft');
  });

  it('keeps a failed draft editable and offers retry or explicit skip', async () => {
    const onAction = vi.fn().mockResolvedValue(undefined);
    const object = makeObject({
      kind: 'brief',
      body: 'A concise brief',
      reviewStatus: 'failed',
      viewedInSession: true,
    });
    render(<AgentWorkObjectEditor object={object} onAction={onAction} />);
    expect(screen.getByLabelText('Shooting script')).toHaveValue(
      'A concise brief',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Skip review' }));
    await waitFor(() =>
      expect(onAction).toHaveBeenCalledWith(object, 'skip', undefined),
    );
  });

  it('Stop sends the cancel action for the actual running review', async () => {
    const onAction = vi.fn().mockResolvedValue(undefined);
    const object = makeObject({
      reviewStatus: 'reviewing',
      viewedInSession: true,
    });
    render(<AgentWorkObjectEditor object={object} onAction={onAction} />);
    expect(screen.getByText('Reviewing the draft…')).toBeInTheDocument();
    expect(screen.getByLabelText('Script, row 1')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await waitFor(() =>
      expect(onAction).toHaveBeenCalledWith(object, 'cancel', undefined),
    );
  });

  it('blocks generation for pending, failed and reviewing objects, and for unsaved edits after pass', () => {
    const store = useAgentWorkObjectGateStore.getState();
    for (const reviewStatus of ['pending', 'reviewing', 'failed'] as const) {
      store.setObjects('thread-1', [makeObject({ reviewStatus })]);
      expect(
        isWorkObjectGenerationBlocked(
          'thread-1',
          useAgentWorkObjectGateStore.getState(),
        ),
      ).toBe(true);
    }
    store.setObjects('thread-1', [makeObject({ reviewStatus: 'passed' })]);
    expect(
      isWorkObjectGenerationBlocked(
        'thread-1',
        useAgentWorkObjectGateStore.getState(),
      ),
    ).toBe(false);
    store.setDirty('thread-1', 'script-1', true);
    expect(
      isWorkObjectGenerationBlocked(
        'thread-1',
        useAgentWorkObjectGateStore.getState(),
      ),
    ).toBe(true);
    store.setDirty('thread-1', 'script-1', false);
    store.setObjects('thread-1', [makeObject({ reviewStatus: 'skipped' })]);
    expect(
      isWorkObjectGenerationBlocked(
        'thread-1',
        useAgentWorkObjectGateStore.getState(),
      ),
    ).toBe(false);
    expect(
      isWorkObjectGenerationBlocked(
        'other-thread',
        useAgentWorkObjectGateStore.getState(),
      ),
    ).toBe(false);
  });
});
