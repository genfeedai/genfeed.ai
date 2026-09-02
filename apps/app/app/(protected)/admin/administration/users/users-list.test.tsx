import '@testing-library/jest-dom/vitest';
import { PlatformRole } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { IUser } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UsersList from './users-list';

const mocks = vi.hoisted(() => ({
  findAll: vi.fn(),
  impersonateUser: vi.fn(),
  loggerError: vi.fn(),
  notificationsError: vi.fn(),
  refetch: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock('@ui/buttons/refresh/button-refresh/ButtonRefresh', () => ({
  default: ({ onClick }: { onClick: () => void }) => (
    <button type="button" onClick={onClick}>
      Refresh
    </button>
  ),
}));

vi.mock('@genfeedai/auth-client', () => ({
  authClient: {
    admin: {
      impersonateUser: mocks.impersonateUser,
    },
  },
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => async () =>
    factory('token-1'),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: mocks.loggerError,
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: mocks.notificationsError,
    }),
  },
}));

vi.mock('@services/organization/users.service', () => ({
  UsersService: {
    getInstance: () => ({
      findAll: mocks.findAll,
    }),
  },
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: {
    queryFn: () => Promise<unknown>;
    queryKey: unknown[];
  }) => mocks.useQuery(options),
}));

vi.mock('@ui/display/table/Table', () => ({
  default: ({
    actions,
    columns,
    items,
    emptyLabel,
    getRowKey,
  }: {
    actions: Array<{
      isVisible?: (item: IUser) => boolean;
      onClick?: (item: IUser) => void;
      tooltip: string;
    }>;
    columns: Array<{
      header: string;
      key: string;
      render?: (item: IUser) => ReactNode;
    }>;
    emptyLabel: string;
    getRowKey: (item: IUser, index: number) => string;
    items: IUser[];
  }) => {
    if (items.length === 0) {
      return <div>{emptyLabel}</div>;
    }
    return (
      <div>
        {columns.map((column) => (
          <span key={column.key}>{column.header}</span>
        ))}
        {items.map((item, index) => (
          <div key={getRowKey(item, index)}>
            {columns.map((column) => (
              <span key={column.key} data-testid={`${item.id}-${column.key}`}>
                {column.render?.(item) ??
                  String(
                    (item as unknown as Record<string, unknown>)[column.key] ??
                      '',
                  )}
              </span>
            ))}
            {actions
              .filter((action) => action.isVisible?.(item) ?? true)
              .map((action) => (
                <button
                  key={action.tooltip}
                  type="button"
                  aria-label={`${action.tooltip} ${item.email}`}
                  onClick={() => action.onClick?.(item)}
                >
                  {action.tooltip}
                </button>
              ))}
          </div>
        ))}
      </div>
    );
  },
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({ children, right }: { children: ReactNode; right: ReactNode }) => (
    <section>
      {right}
      {children}
    </section>
  ),
}));

const regularUser = {
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  email: 'jane@example.com',
  firstName: 'Jane',
  id: 'user-1',
  lastName: 'Doe',
  platformRole: PlatformRole.USER,
} as unknown as IUser;

const superAdminUser = {
  createdAt: new Date('2026-01-02T00:00:00.000Z'),
  email: 'operator@example.com',
  firstName: 'Op',
  id: 'user-2',
  lastName: 'Erator',
  platformRole: PlatformRole.SUPERADMIN,
} as unknown as IUser;

const betterAuthUser = {
  createdAt: '2026-08-29T11:55:29.273Z',
  email: 'new-user@example.com',
  firstName: null,
  id: 'user-3',
  lastActiveAt: '2026-08-29T11:55:29.729Z',
  lastName: null,
  name: 'New Better Auth User',
  platformRole: PlatformRole.USER,
} as unknown as IUser;

const originalLocation = window.location;

describe('UsersList', () => {
  const locationAssign = vi.fn();

  beforeEach(() => {
    mocks.findAll.mockReset();
    mocks.impersonateUser.mockReset();
    mocks.loggerError.mockReset();
    mocks.notificationsError.mockReset();
    mocks.refetch.mockReset();
    mocks.useQuery.mockReset();
    locationAssign.mockReset();
    mocks.useQuery.mockReturnValue({
      data: [regularUser, superAdminUser],
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: mocks.refetch,
    });
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, assign: locationAssign },
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
      writable: true,
    });
  });

  it('offers Impersonate only for non-superadmin users', () => {
    render(<UsersList />);

    expect(
      screen.getByRole('button', { name: 'Impersonate jane@example.com' }),
    ).toBeInTheDocument();
    // The admin plugin rejects impersonating admins — the action is hidden.
    expect(
      screen.queryByRole('button', {
        name: 'Impersonate operator@example.com',
      }),
    ).not.toBeInTheDocument();
  });

  it('shows Better Auth names plus valid joined and last-connected dates', () => {
    mocks.useQuery.mockReturnValue({
      data: [betterAuthUser],
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: mocks.refetch,
    });

    render(<UsersList />);

    expect(screen.getByText('Last connected')).toBeInTheDocument();
    expect(screen.getByTestId('user-3-name')).toHaveTextContent(
      'New Better Auth User',
    );
    expect(screen.getByTestId('user-3-createdAt')).not.toHaveTextContent(
      'Invalid Date',
    );
    expect(screen.getByTestId('user-3-lastActiveAt')).not.toHaveTextContent(
      'Invalid Date',
    );
  });

  it('shows Never when the user has not connected yet', () => {
    mocks.useQuery.mockReturnValue({
      data: [{ ...betterAuthUser, lastActiveAt: null }],
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: mocks.refetch,
    });

    render(<UsersList />);

    expect(screen.getByTestId('user-3-lastActiveAt')).toHaveTextContent(
      'Never',
    );
  });

  it('impersonates the user and reloads into their account', async () => {
    mocks.impersonateUser.mockResolvedValue({ data: {}, error: null });

    render(<UsersList />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Impersonate jane@example.com' }),
    );

    await waitFor(() => {
      expect(mocks.impersonateUser).toHaveBeenCalledWith({
        userId: 'user-1',
      });
      expect(locationAssign).toHaveBeenCalledWith(APP_ROUTES.ROOT);
    });
    expect(mocks.notificationsError).not.toHaveBeenCalled();
  });

  it('surfaces a notification when impersonation is rejected', async () => {
    mocks.impersonateUser.mockResolvedValue({
      data: null,
      error: { message: 'not allowed' },
    });

    render(<UsersList />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Impersonate jane@example.com' }),
    );

    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'Failed to impersonate user',
        expect.any(Error),
      );
      expect(mocks.notificationsError).toHaveBeenCalledWith(
        'Failed to impersonate user',
      );
    });
    expect(locationAssign).not.toHaveBeenCalled();
  });
});
