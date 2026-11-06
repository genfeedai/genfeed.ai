import '@testing-library/jest-dom/vitest';
import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import { ModalEnum } from '@genfeedai/contracts';
import {
  closeModal,
  openModal,
} from '@genfeedai/helpers/ui/modal/modal.helper';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ModalMember from './ModalMember';

const mocks = vi.hoisted(() => ({
  findRoles: vi.fn(),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brands: [] }),
}));

vi.mock('@services/organization/roles.service', () => ({
  RolesService: {
    getInstance: () => ({ findAll: mocks.findRoles }),
  },
}));

vi.mock('@services/organization/organizations.service', () => ({
  OrganizationsService: { getInstance: () => ({}) },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ error: vi.fn(), success: vi.fn() }),
  },
}));

const ROLES = [
  { id: 'role-admin', key: 'admin', label: 'Admin' },
  { id: 'role-user', key: 'user', label: 'Member' },
];

function renderInviteModal(client = createTestQueryClient()) {
  return render(<ModalMember onConfirm={vi.fn()} organizationId="org-1" />, {
    wrapper: queryClientWrapper(client),
  });
}

describe('ModalMember', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findRoles.mockResolvedValue(ROLES);
    act(() => openModal(ModalEnum.MEMBER));
  });

  afterEach(() => {
    act(() => closeModal(ModalEnum.MEMBER));
  });

  it('loads the roles and picks the member role by default', async () => {
    renderInviteModal();

    await waitFor(() => {
      expect(screen.getByLabelText('roleId')).toHaveValue('role-user');
    });
    expect(screen.getByRole('combobox')).toHaveTextContent('Member');
    expect(screen.getByRole('combobox')).toBeEnabled();
  });

  it('paints the cached roles at once when the invite dialog reopens', async () => {
    const client = createTestQueryClient();
    const firstOpen = renderInviteModal(client);
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toHaveTextContent('Member');
    });
    firstOpen.unmount();

    mocks.findRoles.mockReturnValue(new Promise(() => {}));
    renderInviteModal(client);

    expect(screen.getByRole('combobox')).toBeEnabled();
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toHaveTextContent('Member');
    });
  });

  it('shows the roles error only when no roles were ever loaded', async () => {
    mocks.findRoles.mockRejectedValue(new Error('offline'));
    renderInviteModal();

    expect(await screen.findByText('Failed to load roles')).toBeInTheDocument();
  });

  it('keeps the cached roles usable when a refresh fails', async () => {
    const client = createTestQueryClient();
    const firstOpen = renderInviteModal(client);
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toHaveTextContent('Member');
    });
    firstOpen.unmount();

    mocks.findRoles.mockRejectedValue(new Error('offline'));
    renderInviteModal(client);
    // Let the failed refresh settle.
    await waitFor(() => expect(mocks.findRoles).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(client.isFetching()).toBe(0));

    expect(screen.getByRole('combobox')).toBeEnabled();
    expect(screen.getByRole('combobox')).toHaveTextContent('Member');
    expect(screen.queryByText('Failed to load roles')).not.toBeInTheDocument();
  });

  it('clears a chosen role that a refresh no longer lists', async () => {
    const client = createTestQueryClient();
    renderInviteModal(client);
    await waitFor(() => {
      expect(screen.getByLabelText('roleId')).toHaveValue('role-user');
    });

    // The member role was deleted elsewhere; only Admin is left.
    mocks.findRoles.mockResolvedValue([ROLES[0]]);
    await act(() => client.invalidateQueries());

    await waitFor(() => {
      expect(screen.getByLabelText('roleId')).toHaveValue('');
    });
  });
});
