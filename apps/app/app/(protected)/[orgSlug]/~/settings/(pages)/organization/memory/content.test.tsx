import '@testing-library/jest-dom/vitest';
import { MemberRole } from '@genfeedai/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsOrganizationMemoryPage from './content';

const mocks = vi.hoisted(() => ({
  archive: vi.fn(),
  hasOrganizationBillingHint: vi.fn(),
  listOrganization: vi.fn(),
  loggerError: vi.fn(),
  notificationsError: vi.fn(),
  notificationsSuccess: vi.fn(),
  promote: vi.fn(),
  reject: vi.fn(),
  useUserRole: vi.fn(),
}));

vi.mock('@genfeedai/config/license', () => ({
  hasOrganizationBillingHint: () => mocks.hasOrganizationBillingHint(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => async () =>
    factory('test-token'),
}));

vi.mock('@hooks/auth/use-user-role/use-user-role', () => ({
  useUserRole: () => mocks.useUserRole(),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    orgHref: (path: string) => `/org-123/~${path}`,
  }),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: mocks.loggerError },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: mocks.notificationsError,
      success: mocks.notificationsSuccess,
    }),
  },
}));

vi.mock('@services/automation/agent-memories.service', () => ({
  AgentMemoriesService: {
    getInstance: () => ({
      archive: mocks.archive,
      listOrganization: mocks.listOrganization,
      promote: mocks.promote,
      reject: mocks.reject,
    }),
  },
}));

vi.mock('@helpers/formatting/date/date.helper', () => ({
  formatDate: () => 'Jan 1, 2026',
}));

vi.mock('next/link', () => ({
  default: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock('lucide-react', () => ({
  Archive: () => null,
  Lock: () => null,
  Sparkles: () => null,
  X: () => null,
}));

vi.mock('@ui/primitives/badge', () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock('@ui/card/empty/CardEmpty', () => ({
  default: ({ label }: { label?: string }) => <div>{label}</div>,
}));

vi.mock('@ui/display/table/Table', () => ({
  default: ({
    actions,
    emptyLabel,
    isLoading,
    items,
    label,
  }: {
    actions: Array<{
      isVisible?: (item: Record<string, unknown>) => boolean;
      onClick?: (item: Record<string, unknown>) => void;
      tooltip: string | ((item: Record<string, unknown>) => string);
    }>;
    emptyLabel: string;
    isLoading?: boolean;
    items: Array<Record<string, unknown>>;
    label?: string;
  }) => {
    if (isLoading) {
      return <div>Loading memory</div>;
    }
    if (items.length === 0) {
      return <div>{emptyLabel}</div>;
    }
    return (
      <div>
        {label ? <h3>{label}</h3> : null}
        {items.map((item) => (
          <div key={String(item.id)}>
            <span>{String(item.summary ?? item.id)}</span>
            {actions
              .filter((action) => action.isVisible?.(item) ?? true)
              .map((action) => {
                const tooltip =
                  typeof action.tooltip === 'function'
                    ? action.tooltip(item)
                    : action.tooltip;
                return (
                  <button
                    key={tooltip}
                    type="button"
                    aria-label={tooltip}
                    onClick={() => action.onClick?.(item)}
                  >
                    {tooltip}
                  </button>
                );
              })}
          </div>
        ))}
      </div>
    );
  },
}));

describe('SettingsOrganizationMemoryPage', () => {
  beforeEach(() => {
    mocks.archive.mockReset();
    mocks.hasOrganizationBillingHint.mockReturnValue(true);
    mocks.listOrganization.mockReset();
    mocks.promote.mockReset();
    mocks.reject.mockReset();
    mocks.useUserRole.mockReturnValue(MemberRole.ADMIN);
  });

  it('lists shared memory and promotes an entry', async () => {
    mocks.listOrganization.mockResolvedValue([
      {
        id: 'mem-1',
        scope: 'brand',
        summary: 'Lead with the pain',
        user: { id: 'user-1', name: 'Ada' },
      },
    ]);
    mocks.promote.mockResolvedValue({
      id: 'mem-1',
      promotedSkillId: 'skill-1',
    });

    render(<SettingsOrganizationMemoryPage />);

    expect(await screen.findByText('Lead with the pain')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Promote to skill' }));
    await waitFor(() => {
      expect(mocks.promote).toHaveBeenCalledWith('mem-1');
    });
  });

  it('hides billed memory when organization billing is off', () => {
    mocks.hasOrganizationBillingHint.mockReturnValue(false);
    render(<SettingsOrganizationMemoryPage />);
    expect(
      screen.getByText('Organization memory is a billed feature'),
    ).toBeInTheDocument();
  });
});
