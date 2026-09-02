import {
  CampaignPlatform,
  CampaignStatus,
  CampaignType,
} from '@genfeedai/contracts';
import OutreachCampaignDetail from '@pages/agents/campaigns/OutreachCampaignDetail';
import { useOutreachCampaignDetail } from '@pages/agents/campaigns/useOutreachCampaignDetail';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../apps/app/tests/next-intl.stub'
  );

  return { useTranslations: translateFromCatalog };
});

vi.mock('@pages/agents/campaigns/useOutreachCampaignDetail', () => ({
  useOutreachCampaignDetail: vi.fn(),
}));

const mockUseOutreachCampaignDetail = vi.mocked(useOutreachCampaignDetail);

function mockDetail(
  campaign: {
    campaignType: CampaignType;
    description?: string;
    label: string;
    platform: CampaignPlatform;
    status: CampaignStatus;
  } | null,
) {
  mockUseOutreachCampaignDetail.mockReturnValue({
    campaign,
    handleAddDmRecipients: vi.fn(),
    handleAddUrls: vi.fn(),
    handleBack: vi.fn(),
    handleCompleteCampaign: vi.fn(),
    handlePauseCampaign: vi.fn(),
    handleStartCampaign: vi.fn(),
    isAddingUrls: false,
    isLoading: false,
    isRefreshing: false,
    loadCampaign: vi.fn(),
    setUrlInput: vi.fn(),
    targetStats: {
      failed: 0,
      pending: 0,
      processing: 0,
      replied: 0,
      scheduled: 0,
      sent: 0,
      skipped: 0,
      total: 0,
    },
    targets: [],
    urlInput: '',
  } as unknown as ReturnType<typeof useOutreachCampaignDetail>);
}

describe('OutreachCampaignDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a historical unavailable campaign and disables unsafe actions', async () => {
    const user = userEvent.setup();
    const handleStartCampaign = vi.fn();
    const handleAddUrls = vi.fn();
    mockDetail({
      campaignType: CampaignType.MANUAL,
      description: 'Legacy reddit replies',
      label: 'Legacy Reddit',
      platform: CampaignPlatform.REDDIT,
      status: CampaignStatus.DRAFT,
    });
    mockUseOutreachCampaignDetail.mockReturnValue({
      ...mockUseOutreachCampaignDetail(),
      handleAddUrls,
      handleStartCampaign,
    });

    render(<OutreachCampaignDetail />);

    expect(screen.getByText('Legacy Reddit')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      /This platform is not available/i,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      /Reddit and Instagram outreach are not available yet/i,
    );

    const start = screen.getByRole('button', { name: /Start/i });
    expect(start).toHaveAttribute('aria-disabled', 'true');
    expect(start).not.toBeDisabled();
    await user.click(start);
    expect(handleStartCampaign).not.toHaveBeenCalled();

    const addTargets = screen.getByRole('button', { name: /Add Targets/i });
    expect(addTargets).toHaveAttribute('aria-disabled', 'true');
    await user.click(addTargets);
    expect(handleAddUrls).not.toHaveBeenCalled();
  });

  it('keeps Start available for verified X public-reply campaigns', () => {
    mockDetail({
      campaignType: CampaignType.MANUAL,
      label: 'X replies',
      platform: CampaignPlatform.TWITTER,
      status: CampaignStatus.DRAFT,
    });

    render(<OutreachCampaignDetail />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start/i })).not.toHaveAttribute(
      'aria-disabled',
    );
  });

  it('renders the page chrome while the campaign is still loading', () => {
    mockDetail(null);
    mockUseOutreachCampaignDetail.mockReturnValue({
      ...mockUseOutreachCampaignDetail(),
      isLoading: true,
    });

    render(<OutreachCampaignDetail />);

    expect(screen.getByText('Outreach sequence')).toBeInTheDocument();
    expect(screen.getByText('Target Statistics')).toBeInTheDocument();
    expect(
      screen.getByTestId('outreach-campaign-body-skeleton'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Outreach sequence not found'),
    ).not.toBeInTheDocument();
  });
});
