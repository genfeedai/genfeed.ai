import {
  AdDetailSummaryCard,
  AdsSearchResultsCard,
  CampaignLaunchPrepCard,
} from '@cloud/agent/components/AdsAgentCards';
import type { AgentUiAction } from '@cloud/agent/models/agent-chat.model';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('AdsAgentCards', () => {
  it('renders ads search results with item metadata and links', () => {
    const action: AgentUiAction = {
      ctas: [{ href: '/research/ads/meta', label: 'Open Meta ads' }],
      description: 'Top public and connected ads for the current niche.',
      id: 'ads-search-1',
      items: [
        {
          id: 'ad-1',
          platform: 'meta',
          title: 'Hook-heavy Meta ad',
          type: 'public',
        },
        {
          id: 'ad-2',
          platform: 'google',
          title: 'High intent search ad',
          type: 'my_accounts',
        },
      ],
      title: 'Ads search results',
      type: 'ads_search_results_card',
    };

    render(<AdsSearchResultsCard action={action} />);

    expect(screen.getByText('Hook-heavy Meta ad')).toBeTruthy();
    expect(screen.getByText('meta / public')).toBeTruthy();
    expect(screen.getByText('High intent search ad')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open Meta ads' })).toHaveAttribute(
      'href',
      '/research/ads/meta',
    );
  });

  it('renders ad detail summary copy', () => {
    const action: AgentUiAction = {
      data: {
        explanation: 'The offer is specific and the proof is immediate.',
        headline: 'Meta winner with clear proof',
      },
      id: 'ad-detail-1',
      title: 'Ad detail summary',
      type: 'ad_detail_summary_card',
    };

    render(<AdDetailSummaryCard action={action} />);

    expect(screen.getByText('Meta winner with clear proof')).toBeTruthy();
    expect(
      screen.getByText('The offer is specific and the proof is immediate.'),
    ).toBeTruthy();
  });

  it('renders launch prep review state', () => {
    const action: AgentUiAction = {
      ctas: [{ href: '/workflows/wf-ads-1', label: 'Open workflow' }],
      data: {
        channel: 'youtube',
        platform: 'google',
      },
      description: 'Prepared as a paused draft for human review.',
      id: 'launch-prep-1',
      title: 'Campaign launch prep',
      type: 'campaign_launch_prep_card',
    };

    render(<CampaignLaunchPrepCard action={action} />);

    expect(screen.getByText('Platform: google')).toBeTruthy();
    expect(screen.getByText('Channel: youtube')).toBeTruthy();
    expect(
      screen.getByText('Review required before any publish action.'),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open workflow' })).toHaveAttribute(
      'href',
      '/workflows/wf-ads-1',
    );
  });
});
