import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const organizationService = vi.hoisted(() => ({
  getMyOrganizations: vi.fn(),
  switchOrganization: vi.fn(),
}));
const store = vi.hoisted(() => ({
  activeRunStatus: 'idle',
  isGenerating: false,
  resetActiveConversationState: vi.fn(),
  setActiveThread: vi.fn(),
  upsertThread: vi.fn(),
}));
const api = vi.hoisted(() => ({
  createThreadEffect: vi.fn(),
  getThreadEffect: vi.fn(),
  updateThreadContextEffect: vi.fn(),
}));

const brands = [
  {
    id: 'brand-a',
    label: 'Brand A',
    organization: { id: 'org-1', slug: 'acme' },
    slug: 'brand-a',
  },
  {
    id: 'brand-b',
    label: 'Brand B',
    organization: { id: 'org-1', slug: 'acme' },
    slug: 'brand-b',
  },
];

vi.mock('@genfeedai/agent', () => ({
  runAgentApiEffect: (effect: Promise<unknown>) => effect,
  useAgentChatStore: (selector: (state: typeof store) => unknown) =>
    selector(store),
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-a',
    brands,
    organizationId: 'org-1',
  }),
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => organizationService,
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

vi.mock('@/lib/workspace-shell/workspace-shell-registry', () => ({
  resolveWorkspaceShellRoute: () => ({ mode: 'canvas' }),
}));

vi.mock('@ui/menus/switcher-dropdown/SwitcherDropdown', () => ({
  default: ({
    items,
    onSelect,
    renderTrigger,
  }: {
    items: { id: string; label: string }[];
    onSelect: (id: string) => void;
    renderTrigger: (state: { isOpen: boolean }) => ReactNode;
  }) => (
    <div>
      {renderTrigger({ isOpen: false })}
      {items.map((item) => (
        <button key={item.id} onClick={() => onSelect(item.id)} type="button">
          Select {item.label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    ariaLabel,
    children,
    isDisabled,
    onClick,
  }: {
    ariaLabel?: string;
    children?: ReactNode;
    isDisabled?: boolean;
    onClick?: () => void;
  }) => (
    <button
      aria-label={ariaLabel}
      disabled={isDisabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  ),
}));

vi.mock('@ui/primitives/dialog', () => ({
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
  DialogFooter: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

import { useConversationScopeControls } from './use-conversation-scope-controls';

const activeThread = {
  brandId: 'brand-a',
  contextVersion: 3,
  createdAt: '2026-07-13T00:00:00.000Z',
  id: 'thread-1',
  organizationId: 'org-1',
  status: 'active',
  updatedAt: '2026-07-13T00:00:00.000Z',
} as const;

function Harness() {
  const state = useConversationScopeControls({
    activeThread: activeThread as never,
    apiService: api as never,
    currentDraftScopeKey: 'acme:thread-1:3',
    pathname: '/acme/brand-a/library/images',
    searchParams: new URLSearchParams('thread=thread-1'),
  });

  return (
    <div>
      <span>{state.contextLabel}</span>
      <span>{state.isConsequentiallyBlocked ? 'blocked' : 'ready'}</span>
      {state.scopeControls}
      {state.inspectorScope}
    </div>
  );
}

describe('useConversationScopeControls', () => {
  beforeEach(() => {
    store.activeRunStatus = 'idle';
    store.isGenerating = false;
    store.upsertThread.mockReset();
    router.push.mockReset();
    router.replace.mockReset();
    organizationService.getMyOrganizations.mockResolvedValue([
      { id: 'org-1', isActive: true, label: 'Acme', slug: 'acme' },
      { id: 'org-2', isActive: false, label: 'Other', slug: 'other' },
    ]);
    api.updateThreadContextEffect.mockResolvedValue({
      ...activeThread,
      brandId: 'brand-b',
      contextVersion: 4,
    });
    api.getThreadEffect.mockResolvedValue(activeThread);
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it('mutates only authoritative thread context when an authorized brand is selected', async () => {
    render(<Harness />);

    expect(await screen.findByText('Acme · Brand A')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Select Brand B' }));

    await waitFor(() =>
      expect(api.updateThreadContextEffect).toHaveBeenCalledWith('thread-1', {
        brandId: 'brand-b',
        expectedContextVersion: 3,
      }),
    );
    expect(store.upsertThread).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: 'brand-b', contextVersion: 4 }),
    );
    expect(router.push).toHaveBeenCalledWith(
      '/acme/brand-b/library/images?thread=thread-1',
    );
  });

  it('blocks consequential controls after another tab publishes a newer version', async () => {
    api.getThreadEffect.mockResolvedValue({
      ...activeThread,
      brandId: 'brand-b',
      contextVersion: 4,
    });
    render(<Harness />);

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'genfeed:agent-thread-context:v1:thread-1',
        newValue: JSON.stringify({
          brandId: 'brand-b',
          contextVersion: 4,
          organizationId: 'org-1',
          threadId: 'thread-1',
        }),
      }),
    );

    expect(await screen.findByText('blocked')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Synchronize scope' }));

    await waitFor(() => expect(screen.getByText('ready')).toBeInTheDocument());
    expect(router.replace).toHaveBeenCalledWith(
      '/acme/brand-b/library/images?thread=thread-1',
    );
  });

  it('requires active work to stop before organization scope can change', async () => {
    store.activeRunStatus = 'running';
    render(<Harness />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Select Other' }),
    );

    expect(
      screen.getByText('Stop active work before switching scope'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Start clean thread' }),
    ).toBeDisabled();
    expect(organizationService.switchOrganization).not.toHaveBeenCalled();
  });
});
