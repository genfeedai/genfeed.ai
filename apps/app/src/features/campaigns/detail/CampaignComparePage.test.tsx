import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CampaignComparePage from '@/features/campaigns/detail/CampaignComparePage';
import '@testing-library/jest-dom/vitest';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('CampaignComparePage', () => {
  it('asks for two Campaign ids before comparing', () => {
    render(<CampaignComparePage />);
    expect(screen.getByText('compareNeedTwo')).toBeInTheDocument();
  });
});
