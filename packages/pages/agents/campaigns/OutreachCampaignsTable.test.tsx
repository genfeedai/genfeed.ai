import {
  ContextSidebarOutlet,
  ContextSidebarProvider,
} from '@contexts/ui/context-sidebar-context';
import {
  CampaignPlatform,
  CampaignStatus,
  CampaignType,
} from '@genfeedai/contracts';
import OutreachCampaignsTable from '@pages/agents/campaigns/OutreachCampaignsTable';
import type { OutreachCampaign } from '@services/automation/outreach-campaigns.service';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../apps/app/tests/next-intl.stub'
  );

  return { useTranslations: translateFromCatalog };
});

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/brand${path}` }),
}));

const campaign = {
  campaignType: CampaignType.DM_OUTREACH,
  id: 'camp-1',
  label: 'Launch DMs',
  platform: CampaignPlatform.TWITTER,
  status: CampaignStatus.ACTIVE,
  totalFailed: 1,
  totalSkipped: 2,
  totalSuccessful: 3,
  totalTargets: 10,
} as OutreachCampaign;

function renderTable() {
  return render(
    <ContextSidebarProvider>
      <OutreachCampaignsTable
        campaigns={[campaign]}
        isLoading={false}
        onComplete={vi.fn()}
        onConfigure={vi.fn()}
        onDelete={vi.fn()}
        onPause={vi.fn()}
        onStart={vi.fn()}
      />
      <ContextSidebarOutlet testId="rail" />
    </ContextSidebarProvider>,
  );
}

describe('OutreachCampaignsTable', () => {
  it('links the sequence name to its page', () => {
    renderTable();

    expect(
      screen.getByRole('link', { name: 'Open Launch DMs' }),
    ).toHaveAttribute('href', '/acme/brand/messages/outreach/camp-1');
  });

  it('opens the sequence summary in the sidebar on row click', () => {
    renderTable();

    fireEvent.click(screen.getByText('10 total'));

    const rail = within(screen.getByTestId('rail'));
    expect(rail.getByText('Replied')).toBeInTheDocument();
    expect(rail.getByRole('link', { name: 'Open' })).toHaveAttribute(
      'href',
      '/acme/brand/messages/outreach/camp-1',
    );
  });
});
