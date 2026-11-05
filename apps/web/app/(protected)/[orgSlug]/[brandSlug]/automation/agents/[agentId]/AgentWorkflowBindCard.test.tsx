import '@testing-library/jest-dom/vitest';
import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import type { AgentStrategy } from '@services/automation/agent-strategies.service';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AgentWorkflowBindCard from './AgentWorkflowBindCard';

const mocks = vi.hoisted(() => ({
  findAll: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    findAll: mocks.findAll,
    update: mocks.update,
  }),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
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

const strategy = {
  brandId: 'brand-1',
  id: 'agent-1',
  preferredWorkflowId: 'workflow-1',
} as AgentStrategy;

function renderCard(client = createTestQueryClient()) {
  return render(
    <AgentWorkflowBindCard
      agentId="agent-1"
      onBound={vi.fn()}
      strategy={strategy}
    />,
    { wrapper: queryClientWrapper(client) },
  );
}

describe('AgentWorkflowBindCard', () => {
  beforeEach(() => {
    mocks.findAll.mockResolvedValue([
      { id: 'workflow-1', label: 'Weekly digest' },
    ]);
  });

  it('shows the loading placeholder while the first read is in flight', () => {
    mocks.findAll.mockReturnValue(new Promise(() => {}));

    renderCard();

    expect(screen.getByText('Loading workflows…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save binding' })).toBeDisabled();
  });

  it('paints the cached workflow choices at once when coming back', async () => {
    const client = createTestQueryClient();
    const firstVisit = renderCard(client);
    expect(
      await screen.findByRole('option', { name: 'Weekly digest' }),
    ).toBeInTheDocument();
    firstVisit.unmount();

    mocks.findAll.mockReturnValue(new Promise(() => {}));
    renderCard(client);

    expect(
      screen.getByRole('option', { name: 'Weekly digest' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Loading workflows…')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save binding' })).toBeEnabled();
  });
});
