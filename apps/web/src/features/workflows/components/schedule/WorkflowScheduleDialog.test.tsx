import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import type { QueryClient } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowScheduleDialog } from './WorkflowScheduleDialog';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  updateSchedule: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

vi.mock('@/features/workflows/services/workflow-api', () => ({
  createWorkflowApiService: () => ({
    get: mocks.get,
    updateSchedule: mocks.updateSchedule,
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => async () =>
    factory('test-token'),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

vi.mock('@ui/primitives/dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
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

// Radix Select does not open in jsdom; the trigger is all these tests read.
vi.mock('@ui/primitives/select', () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectContent: () => null,
  SelectItem: () => null,
  SelectTrigger: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectValue: ({ placeholder }: { placeholder: string }) => (
    <span>{placeholder}</span>
  ),
}));

const dialogSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'WorkflowScheduleDialog.tsx'),
  'utf8',
);

function renderDialog(client: QueryClient) {
  return render(
    <WorkflowScheduleDialog
      isOpen
      onOpenChange={vi.fn()}
      workflowId="workflow-1"
    />,
    { wrapper: queryClientWrapper(client) },
  );
}

describe('WorkflowScheduleDialog', () => {
  it('reads the custom schedule placeholder from the schedule catalog', async () => {
    const { translateFromCatalog } = await import('@/../tests/next-intl.stub');
    const translate = translateFromCatalog(
      'common.automation.workflows.schedule',
    );

    expect(dialogSource).toContain(
      "placeholder={translate('custom.placeholder')}",
    );
    expect(translate('custom.placeholder')).toBe(
      'e.g. weekdays at 9am → 0 9 * * 1-5',
    );
  });

  it('paints the cached schedule at once when reopened', async () => {
    mocks.get.mockResolvedValue({
      id: 'workflow-1',
      isScheduleEnabled: true,
      label: 'Daily digest',
      nextRunAt: null,
      schedule: '0 9 * * *',
      timezone: 'UTC',
    });
    const client = createTestQueryClient();
    const firstOpen = renderDialog(client);
    expect(
      await screen.findByText(
        'Run “Daily digest” automatically on a recurring cadence.',
      ),
    ).toBeInTheDocument();
    firstOpen.unmount();

    mocks.get.mockReturnValue(new Promise(() => {}));
    renderDialog(client);

    expect(
      screen.getByText(
        'Run “Daily digest” automatically on a recurring cadence.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Loading schedule…')).not.toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Recurring schedule' }),
    ).toBeChecked();
    expect(
      screen.getByRole('button', { name: 'Remove schedule' }),
    ).toBeInTheDocument();
  });

  it('seeds the form from a schedule paused elsewhere and saves only after re-reading it', async () => {
    const schedule = {
      id: 'workflow-1',
      isScheduleEnabled: true,
      label: 'Daily digest',
      nextRunAt: null,
      schedule: '0 9 * * *',
      timezone: 'UTC',
    };
    mocks.get.mockResolvedValue(schedule);
    const client = createTestQueryClient();
    const firstOpen = renderDialog(client);
    expect(
      await screen.findByRole('switch', { name: 'Recurring schedule' }),
    ).toBeChecked();
    firstOpen.unmount();

    mocks.get.mockResolvedValue({ ...schedule, isScheduleEnabled: false });
    renderDialog(client);

    expect(
      screen.getByRole('button', { name: 'Save schedule' }),
    ).toBeDisabled();
    await waitFor(() => {
      expect(
        screen.getByRole('switch', { name: 'Recurring schedule' }),
      ).not.toBeChecked();
    });
    expect(screen.getByRole('button', { name: 'Save schedule' })).toBeEnabled();
  });
});
