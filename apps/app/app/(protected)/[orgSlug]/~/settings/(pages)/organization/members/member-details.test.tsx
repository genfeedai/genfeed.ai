import '@testing-library/jest-dom/vitest';
import { MemberRole } from '@genfeedai/contracts';
import { Role } from '@models/auth/role.model';
import { User } from '@models/auth/user.model';
import { Brand } from '@models/organization/brand.model';
import { Member } from '@models/organization/member.model';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MemberDetails from './member-details';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});
const mocks = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    updateOrganizationMember: mocks.update,
  }),
}));
const roles = [
  new Role({ id: 'role-user', key: 'user', label: 'User' }),
  new Role({ id: 'role-owner', key: 'owner', label: 'Owner' }),
];
const brand = new Brand({ id: 'brand-1', label: 'Brand One' });
const member = new Member({
  id: 'member-1',
  organizationId: 'org-1',
  roleId: 'role-user',
  roleKey: 'user',
  role: roles[0],
  isActive: true,
  brands: [brand],
  user: new User({
    id: 'user-1',
    firstName: 'Jane',
    email: 'jane@example.com',
  }),
});
const props = {
  member,
  actorRole: MemberRole.OWNER,
  organizationId: 'org-1',
  brands: [brand],
  roles,
  isLoadingRoles: false,
  rolesError: null,
  onLoadRoles: vi.fn(),
  onUpdated: vi.fn(),
};

describe('MemberDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });
  it('keeps ordinary members and admins viewing owners read-only', () => {
    const view = render(
      <MemberDetails {...props} actorRole={MemberRole.USER} />,
    );
    expect(
      screen.queryByRole('button', { name: 'Edit member' }),
    ).not.toBeInTheDocument();
    view.rerender(
      <MemberDetails
        {...props}
        actorRole={MemberRole.ADMIN}
        member={new Member({ ...member, role: roles[1], roleKey: 'owner' })}
      />,
    );
    expect(
      screen.queryByRole('button', { name: 'Edit member' }),
    ).not.toBeInTheDocument();
  });

  it('cancels membership edits without writing', () => {
    render(<MemberDetails {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit member' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Active member' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mocks.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Edit member' }));
    expect(
      screen.getByRole('checkbox', { name: 'Active member' }),
    ).toBeChecked();
  });

  it('persists membership fields together and publishes the response', async () => {
    mocks.update.mockResolvedValue(
      new Member({ ...member, isActive: false, brands: [] }),
    );
    render(<MemberDetails {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit member' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Active member' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Brand One' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith('org-1', 'member-1', {
        roleId: 'role-user',
        brandIds: [],
        isActive: false,
      }),
    );
    await waitFor(() => expect(props.onUpdated).toHaveBeenCalled());
  });

  it('keeps failed drafts and blocks saving when roles cannot load', async () => {
    mocks.update.mockRejectedValue(new Error('Unable to save'));
    const view = render(<MemberDetails {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit member' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Active member' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('alert');
    expect(
      screen.getByRole('checkbox', { name: 'Active member' }),
    ).not.toBeChecked();
    view.rerender(<MemberDetails {...props} rolesError="Roles unavailable" />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry loading roles' }),
    );
    expect(props.onLoadRoles).toHaveBeenCalledTimes(2);
  });
});
