import '@testing-library/jest-dom/vitest';
import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import type { AgentStrategy } from '@services/automation/agent-strategies.service';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AgentWorkflowRunDialog from './AgentWorkflowRunDialog';

const mocks = vi.hoisted(() => ({
  findAll: vi.fn(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({ findAll: mocks.findAll }),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

// Radix Select does not open in jsdom; every choice renders as an option.
vi.mock('@ui/primitives/select', () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: ReactNode }) => (
    <div role="listbox">{children}</div>
  ),
  SelectItem: ({ children }: { children: ReactNode }) => (
    <span aria-selected={false} role="option" tabIndex={0}>
      {children}
    </span>
  ),
  SelectTrigger: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectValue: ({ placeholder }: { placeholder: string }) => (
    <span>{placeholder}</span>
  ),
}));

function strategyFor(brandId: string): AgentStrategy {
  return {
    brandId,
    id: 'agent-1',
    label: 'Weekly agent',
    topics: ['Launch week'],
  } as AgentStrategy;
}

function renderDialog(
  client = createTestQueryClient(),
  strategy = strategyFor('brand-1'),
) {
  return render(
    <AgentWorkflowRunDialog
      binding={null}
      isLoadingBinding={false}
      isOpen
      isSubmitting={false}
      onOpenChange={vi.fn()}
      onSubmit={vi.fn()}
      strategy={strategy}
    />,
    { wrapper: queryClientWrapper(client) },
  );
}

describe('AgentWorkflowRunDialog', () => {
  beforeEach(() => {
    mocks.findAll.mockResolvedValue([
      { id: 'image-1', label: 'Hero shot', url: 'https://cdn.test/hero.png' },
    ]);
  });

  it('lists the brand library images once they load', async () => {
    renderDialog();

    expect(
      await screen.findByRole('option', { name: 'Hero shot' }),
    ).toBeInTheDocument();
  });

  it('lists the cached library images at once when the dialog is reopened', async () => {
    const client = createTestQueryClient();
    const firstOpen = renderDialog(client);
    await screen.findByRole('option', { name: 'Hero shot' });
    firstOpen.unmount();

    mocks.findAll.mockReturnValue(new Promise(() => {}));
    renderDialog(client);

    expect(screen.getByRole('option', { name: 'Hero shot' })).toBeVisible();
    expect(screen.queryByText('Loading library…')).not.toBeInTheDocument();
  });

  it('never lists one brand library images for another brand', async () => {
    const client = createTestQueryClient();
    const firstOpen = renderDialog(client);
    await screen.findByRole('option', { name: 'Hero shot' });
    firstOpen.unmount();

    mocks.findAll.mockReturnValue(new Promise(() => {}));
    renderDialog(client, strategyFor('brand-2'));

    expect(screen.getByText('Loading library…')).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'Hero shot' }),
    ).not.toBeInTheDocument();
  });
});
