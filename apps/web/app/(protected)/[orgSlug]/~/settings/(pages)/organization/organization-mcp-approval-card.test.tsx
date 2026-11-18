import '@testing-library/jest-dom/vitest';
import { MemberRole } from '@genfeedai/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OrganizationMcpApprovalCard from './organization-mcp-approval-card';

const mocks = vi.hoisted(() => ({
  isLoading: false,
  loggerError: vi.fn(),
  organizationId: 'org-1',
  role: 'owner' as string | null,
  settings: {} as Record<string, unknown> | null,
  updateSettings: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});
vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ organizationId: mocks.organizationId }),
}));
vi.mock('@/hooks/auth/use-user-role/use-user-role', () => ({
  useUserRole: () => mocks.role,
}));
vi.mock('@/hooks/data/organization/use-organization/use-organization', () => ({
  useOrganization: () => ({
    isLoading: mocks.isLoading,
    settings: mocks.settings,
    updateSettings: mocks.updateSettings,
  }),
}));
vi.mock('@services/core/logger.service', () => ({
  logger: { error: mocks.loggerError },
}));
vi.mock('@ui/card/Card', () => ({
  default: ({ children, label }: { children: ReactNode; label?: string }) => (
    <section>
      <h2>{label}</h2>
      {children}
    </section>
  ),
}));

const toggle = () =>
  screen.getByRole('switch', { name: 'Require approval for MCP requests' });

describe('OrganizationMcpApprovalCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isLoading = false;
    mocks.organizationId = 'org-1';
    mocks.role = MemberRole.OWNER;
    mocks.settings = {};
    mocks.updateSettings.mockResolvedValue(undefined);
  });

  it('does not require approval for an organization that never chose', () => {
    render(<OrganizationMcpApprovalCard />);
    expect(toggle()).not.toBeChecked();
  });

  it('explains the credit risk while approvals are off', () => {
    render(<OrganizationMcpApprovalCard />);
    expect(screen.getByText(/spend your organization's credits/)).toBeVisible();
  });

  it('lets an owner turn approvals on', async () => {
    const { rerender } = render(<OrganizationMcpApprovalCard />);
    await userEvent.click(toggle());
    await waitFor(() =>
      expect(mocks.updateSettings).toHaveBeenCalledWith(
        'isMcpApprovalRequired',
        true,
      ),
    );
    expect(await screen.findByText('Setting saved.')).toBeInTheDocument();

    mocks.settings = { isMcpApprovalRequired: true };
    rerender(<OrganizationMcpApprovalCard />);
    expect(toggle()).toBeChecked();
    expect(
      screen.queryByText(/spend your organization's credits/),
    ).not.toBeInTheDocument();
  });

  it('lets an admin turn approvals back off', async () => {
    mocks.role = MemberRole.ADMIN;
    mocks.settings = { isMcpApprovalRequired: true };
    render(<OrganizationMcpApprovalCard />);
    await userEvent.click(toggle());
    await waitFor(() =>
      expect(mocks.updateSettings).toHaveBeenCalledWith(
        'isMcpApprovalRequired',
        false,
      ),
    );
  });

  it.each([MemberRole.CREATOR, MemberRole.USER, MemberRole.ANALYTICS, null])(
    'offers no usable switch to %s',
    async (role) => {
      mocks.role = role;
      render(<OrganizationMcpApprovalCard />);
      expect(toggle()).toBeDisabled();
      await userEvent.click(toggle());
      expect(mocks.updateSettings).not.toHaveBeenCalled();
      expect(
        screen.getByText('Only owners and admins can change this setting.'),
      ).toBeInTheDocument();
    },
  );

  it('does nothing while the settings are loading or missing', () => {
    mocks.isLoading = true;
    mocks.settings = null;
    render(<OrganizationMcpApprovalCard />);
    expect(toggle()).toBeDisabled();
    expect(screen.getByText('Loading settings…')).toBeInTheDocument();
  });

  it('reports a failed save and logs it', async () => {
    mocks.updateSettings.mockRejectedValue(new Error('403'));
    render(<OrganizationMcpApprovalCard />);
    await userEvent.click(toggle());
    expect(
      await screen.findByText('Could not save the setting. Try again.'),
    ).toBeInTheDocument();
    expect(mocks.loggerError).toHaveBeenCalled();
    expect(toggle()).toBeEnabled();
  });
});
