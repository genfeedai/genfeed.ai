import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsMcpApprovalCard from './settings-mcp-approval-card';

const mocks = vi.hoisted(() => ({
  organizationSettings: {} as Record<string, unknown> | null,
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});
vi.mock('@/hooks/data/organization/use-organization/use-organization', () => ({
  useOrganization: () => ({ settings: mocks.organizationSettings }),
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

describe('SettingsMcpApprovalCard', () => {
  beforeEach(() => {
    mocks.organizationSettings = { isMcpApprovalRequired: false };
  });

  it('lets a member turn approvals off once the organization allows it', async () => {
    const onChange = vi.fn();
    render(
      <SettingsMcpApprovalCard
        isRequired
        isSaving={false}
        onChange={onChange}
      />,
    );
    expect(toggle()).toBeChecked();
    await userEvent.click(toggle());
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('shows the stored choice when the organization allows skipping', () => {
    render(
      <SettingsMcpApprovalCard
        isRequired={false}
        isSaving={false}
        onChange={vi.fn()}
      />,
    );
    expect(toggle()).not.toBeChecked();
  });

  it('keeps the switch on and locked while the organization requires approval', async () => {
    mocks.organizationSettings = { isMcpApprovalRequired: true };
    const onChange = vi.fn();
    render(
      <SettingsMcpApprovalCard
        isRequired={false}
        isSaving={false}
        onChange={onChange}
      />,
    );
    expect(toggle()).toBeChecked();
    expect(toggle()).toBeDisabled();
    await userEvent.click(toggle());
    expect(onChange).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Your organization requires approval/),
    ).toBeInTheDocument();
  });

  it('disables the switch while saving', () => {
    render(<SettingsMcpApprovalCard isRequired isSaving onChange={vi.fn()} />);
    expect(toggle()).toBeDisabled();
  });
});
