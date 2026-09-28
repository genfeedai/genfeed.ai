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
    isStartingCampaign: false,
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

  it('shows exactly one primary action — Pause — for a running sequence', () => {
    mockDetail({
      campaignType: CampaignType.MANUAL,
      label: 'Running sequence',
      platform: CampaignPlatform.TWITTER,
      status: CampaignStatus.ACTIVE,
    });

    render(<OutreachCampaignDetail />);

    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Start' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Resume' }),
    ).not.toBeInTheDocument();
  });

  it('shows Resume as the primary action for a paused sequence and surfaces Needs you', () => {
    const handleStartCampaign = vi.fn();
    mockDetail({
      campaignType: CampaignType.MANUAL,
      label: 'Paused sequence',
      platform: CampaignPlatform.TWITTER,
      status: CampaignStatus.PAUSED,
    });
    mockUseOutreachCampaignDetail.mockReturnValue({
      ...mockUseOutreachCampaignDetail(),
      handleStartCampaign,
    });

    render(<OutreachCampaignDetail />);

    expect(
      screen.getByRole('heading', { name: 'Needs you' }),
    ).toBeInTheDocument();
    const resumeButtons = screen.getAllByRole('button', { name: 'Resume' });
    expect(resumeButtons.length).toBeGreaterThan(0);
  });

  it('hides Needs you and carries no primary action once the sequence is completed', () => {
    mockDetail({
      campaignType: CampaignType.MANUAL,
      label: 'Wrapped up sequence',
      platform: CampaignPlatform.TWITTER,
      status: CampaignStatus.COMPLETED,
    });

    render(<OutreachCampaignDetail />);

    expect(
      screen.queryByRole('heading', { name: 'Needs you' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Pause' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Start' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Resume' }),
    ).not.toBeInTheDocument();
  });

  it('renders the known lifecycle facts on one line', () => {
    mockDetail({
      campaignType: CampaignType.MANUAL,
      label: 'X replies',
      platform: CampaignPlatform.TWITTER,
      status: CampaignStatus.ACTIVE,
    });

    render(<OutreachCampaignDetail />);

    const factLine = screen.getByTestId('record-fact-line');
    expect(factLine).toHaveTextContent('Platform');
    expect(factLine).toHaveTextContent('Twitter / X');
    expect(factLine).toHaveTextContent('Status');
    expect(factLine).toHaveTextContent('Active');
  });

  it('disables Resume everywhere while a start call is already in flight', () => {
    mockDetail({
      campaignType: CampaignType.MANUAL,
      label: 'Paused sequence',
      platform: CampaignPlatform.TWITTER,
      status: CampaignStatus.PAUSED,
    });
    mockUseOutreachCampaignDetail.mockReturnValue({
      ...mockUseOutreachCampaignDetail(),
      isStartingCampaign: true,
    });

    render(<OutreachCampaignDetail />);

    for (const button of screen.getAllByRole('button', { name: 'Resume' })) {
      expect(button).toBeDisabled();
    }
  });
});
