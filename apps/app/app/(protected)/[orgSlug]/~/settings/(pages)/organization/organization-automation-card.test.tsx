import '@testing-library/jest-dom/vitest';
import { MemberRole } from '@genfeedai/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OrganizationAutomationCard from './organization-automation-card';

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
vi.mock('@hooks/auth/use-user-role/use-user-role', () => ({
  useUserRole: () => mocks.role,
}));
vi.mock('@hooks/data/organization/use-organization/use-organization', () => ({
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

const toggle = (name: string) => screen.getByRole('switch', { name });

describe('OrganizationAutomationCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isLoading = false;
    mocks.organizationId = 'org-1';
    mocks.role = MemberRole.OWNER;
    mocks.settings = {};
    mocks.updateSettings.mockResolvedValue(undefined);
  });

  it('shows all three opt-ins off for an organization that never chose them', () => {
    render(<OrganizationAutomationCard />);
    expect(screen.getAllByRole('switch')).toHaveLength(3);
    for (const name of [
      'Breakout responses',
      'Breakout auto-publish',
      'Brand vision checks',
    ])
      expect(toggle(name)).not.toBeChecked();
  });

  it('shows the vision cost note: about $0.005 per image, charged in credits', () => {
    render(<OrganizationAutomationCard />);
    expect(
      screen.getByText('Costs about $0.005 per image, charged in credits.'),
    ).toBeInTheDocument();
  });

  it('reflects the stored values', () => {
    mocks.settings = {
      isBrandVisionChecksEnabled: true,
      isBreakoutAutoPublishEnabled: false,
      isBreakoutResponsesEnabled: true,
    };
    render(<OrganizationAutomationCard />);
    expect(toggle('Breakout responses')).toBeChecked();
    expect(toggle('Breakout auto-publish')).not.toBeChecked();
    expect(toggle('Brand vision checks')).toBeChecked();
  });

  it.each([
    ['Breakout responses', 'isBreakoutResponsesEnabled'],
    ['Brand vision checks', 'isBrandVisionChecksEnabled'],
  ])('lets an owner turn %s on', async (name, key) => {
    render(<OrganizationAutomationCard />);
    await userEvent.click(toggle(name));
    await waitFor(() =>
      expect(mocks.updateSettings).toHaveBeenCalledWith(key, true),
    );
    expect(await screen.findByText('Setting saved.')).toBeInTheDocument();
  });

  it('lets an admin turn a setting off again', async () => {
    mocks.role = MemberRole.ADMIN;
    mocks.settings = { isBrandVisionChecksEnabled: true };
    render(<OrganizationAutomationCard />);
    await userEvent.click(toggle('Brand vision checks'));
    await waitFor(() =>
      expect(mocks.updateSettings).toHaveBeenCalledWith(
        'isBrandVisionChecksEnabled',
        false,
      ),
    );
  });

  it('keeps auto-publish unavailable until breakout responses are on', async () => {
    render(<OrganizationAutomationCard />);
    expect(toggle('Breakout auto-publish')).toBeDisabled();
    expect(
      screen.getByText('Turn on breakout responses first.'),
    ).toBeInTheDocument();
    await userEvent.click(toggle('Breakout auto-publish'));
    expect(mocks.updateSettings).not.toHaveBeenCalled();
  });

  it('lets an owner turn auto-publish on once breakout responses are on', async () => {
    mocks.settings = { isBreakoutResponsesEnabled: true };
    render(<OrganizationAutomationCard />);
    expect(toggle('Breakout auto-publish')).toBeEnabled();
    await userEvent.click(toggle('Breakout auto-publish'));
    await waitFor(() =>
      expect(mocks.updateSettings).toHaveBeenCalledWith(
        'isBreakoutAutoPublishEnabled',
        true,
      ),
    );
  });

  it.each([MemberRole.CREATOR, MemberRole.USER, MemberRole.ANALYTICS, null])(
    'offers no usable switch to %s',
    async (role) => {
      mocks.role = role;
      mocks.settings = { isBreakoutResponsesEnabled: true };
      render(<OrganizationAutomationCard />);
      for (const item of screen.getAllByRole('switch')) {
        expect(item).toBeDisabled();
        await userEvent.click(item);
      }
      expect(mocks.updateSettings).not.toHaveBeenCalled();
      expect(
        screen.getByText('Only owners and admins can change these settings.'),
      ).toBeInTheDocument();
    },
  );

  it('does nothing while the settings are loading or missing', async () => {
    mocks.isLoading = true;
    mocks.settings = null;
    render(<OrganizationAutomationCard />);
    for (const item of screen.getAllByRole('switch'))
      expect(item).toBeDisabled();
    expect(screen.getByText('Loading settings…')).toBeInTheDocument();
  });

  it('reports a failed save and logs it', async () => {
    mocks.updateSettings.mockRejectedValue(new Error('403'));
    render(<OrganizationAutomationCard />);
    await userEvent.click(toggle('Breakout responses'));
    expect(
      await screen.findByText('Could not save the setting. Try again.'),
    ).toBeInTheDocument();
    expect(mocks.loggerError).toHaveBeenCalled();
    expect(toggle('Breakout responses')).toBeEnabled();
  });
});
