import CampaignNewPage from '@app/(protected)/[orgSlug]/[brandSlug]/automation/campaigns/new/page';
import WorkflowNewPage from '@app/(protected)/[orgSlug]/[brandSlug]/automation/workflows/new/page';
import OutreachNewPage from '@app/(protected)/[orgSlug]/[brandSlug]/messages/outreach/new/page';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  organizationId: 'org-1',
  settingsLoading: false,
  settings: { hasOrganizationBilling: true, moduleOverrides: {} } as Record<
    string,
    unknown
  > | null,
  refreshSettings: vi.fn(),
  mounted: vi.fn(),
  create: vi.fn(),
}));
vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => state,
}));
vi.mock('@genfeedai/hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ orgHref: (path: string) => `/acme/~${path}` }),
}));
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});
vi.mock('@pages/agents', () => {
  function CreationWizard() {
    state.mounted();
    return (
      <button type="button" onClick={state.create}>
        Create new work
      </button>
    );
  }
  return {
    AgentCampaignNewPage: CreationWizard,
    OutreachCampaignWizard: CreationWizard,
  };
});
vi.mock(
  '@app/(protected)/[orgSlug]/[brandSlug]/automation/workflows/new/WorkflowNewPageClient',
  () => ({
    default: () => {
      state.mounted();
      return (
        <button type="button" onClick={state.create}>
          Create new work
        </button>
      );
    },
  }),
);
const routes = [
  ['campaign', 'automation', CampaignNewPage],
  ['workflow', 'automation', WorkflowNewPage],
  ['outreach', 'messages', OutreachNewPage],
] as const;

beforeEach(() => {
  state.organizationId = 'org-1';
  state.settingsLoading = false;
  state.settings = { hasOrganizationBilling: true, moduleOverrides: {} };
  state.mounted.mockClear();
  state.create.mockClear();
});

describe.each(routes)(
  '%s creation admission presentation',
  (_label, moduleId, Page) => {
    it('does not mount a wizard under the disabled cloud default', () => {
      render(<Page />);
      expect(state.mounted).not.toHaveBeenCalled();
      expect(
        screen.queryByRole('button', { name: 'Create new work' }),
      ).toBeNull();
      expect(
        screen.getByRole('link', { name: 'Organization modules' }),
      ).toHaveAttribute('href', '/acme/~/settings/general');
    });
    it('requires a verified paid subscription even when the preference is on', () => {
      state.settings = {
        hasOrganizationBilling: true,
        hasPaidModuleSubscription: false,
        moduleOverrides: { [moduleId]: true },
      };
      render(<Page />);
      expect(state.mounted).not.toHaveBeenCalled();
      expect(
        screen.getByRole('link', { name: 'Manage subscription' }),
      ).toHaveAttribute('href', '/acme/~/settings/subscription');
    });
    it.each([null, undefined])(
      'keeps an unknown paid grant (%s) unavailable',
      (paid) => {
        state.settings = {
          hasOrganizationBilling: true,
          hasPaidModuleSubscription: paid,
          moduleOverrides: { [moduleId]: true },
          isSubscriptionGated: false,
          isAdmin: true,
          credits: 100000,
        };
        render(<Page />);
        expect(state.mounted).not.toHaveBeenCalled();
        expect(
          screen.getByRole('button', { name: 'Retry loading' }),
        ).toBeVisible();
      },
    );
    it('mounts paid enabled work and removes it on grant revocation', () => {
      state.settings = {
        hasOrganizationBilling: true,
        hasPaidModuleSubscription: true,
        moduleOverrides: { [moduleId]: true },
      };
      const { rerender } = render(<Page />);
      fireEvent.click(screen.getByRole('button', { name: 'Create new work' }));
      expect(state.create).toHaveBeenCalledTimes(1);
      state.settings = { ...state.settings, hasPaidModuleSubscription: false };
      rerender(<Page />);
      expect(
        screen.queryByRole('button', { name: 'Create new work' }),
      ).toBeNull();
      expect(
        screen.getByRole('link', { name: 'Manage subscription' }),
      ).toBeVisible();
    });
    it('preserves self-hosted access from verified server billing configuration', () => {
      state.settings = { hasOrganizationBilling: false, moduleOverrides: {} };
      render(<Page />);
      fireEvent.click(screen.getByRole('button', { name: 'Create new work' }));
      expect(state.create).toHaveBeenCalledTimes(1);
    });
  },
);
