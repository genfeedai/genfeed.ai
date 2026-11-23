// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ChangeEvent, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import ReleaseCampaignField from './release-campaign-field';

const campaigns = vi.hoisted(() => ({
  current: [
    { id: 'campaign-1', name: 'Launch week' },
    { id: 'campaign-2', name: 'Open source push' },
  ],
}));

vi.mock('@/features/campaigns/hooks/use-campaigns', () => ({
  useCampaigns: () => ({ campaigns: campaigns.current, isLoading: false }),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@ui/primitives/select', () => ({
  SelectField: ({
    children,
    label,
    onChange,
    value,
  }: {
    children: ReactNode;
    label: string;
    onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
    value: string;
  }) => (
    <label>
      {label}
      <select onChange={onChange} value={value}>
        {children}
      </select>
    </label>
  ),
}));

describe('ReleaseCampaignField', () => {
  it('shows the release campaign and lists the brand campaigns', () => {
    render(
      <ReleaseCampaignField
        campaignId="campaign-2"
        isDisabled={false}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Campaign')).toHaveValue('campaign-2');
    expect(
      screen.getAllByRole('option').map((option) => option.textContent),
    ).toEqual(['No campaign', 'Launch week', 'Open source push']);
  });

  it('moves the release into the chosen campaign', () => {
    const onChange = vi.fn();
    render(
      <ReleaseCampaignField
        campaignId={null}
        isDisabled={false}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('Campaign'), {
      target: { value: 'campaign-1' },
    });

    expect(onChange).toHaveBeenCalledWith('campaign-1');
  });

  it('takes the release out of its campaign with null', () => {
    const onChange = vi.fn();
    render(
      <ReleaseCampaignField
        campaignId="campaign-1"
        isDisabled={false}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('Campaign'), {
      target: { value: '' },
    });

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('keeps a campaign that is not in the list selectable instead of showing none', () => {
    render(
      <ReleaseCampaignField
        campaignId="campaign-archived"
        isDisabled={false}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Campaign')).toHaveValue('campaign-archived');
    expect(
      screen.getByRole('option', { name: 'Another campaign' }),
    ).toBeInTheDocument();
  });
});
