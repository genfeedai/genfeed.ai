import OutreachCampaignWizard from '@pages/agents/campaigns/OutreachCampaignWizard';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    credentials: [
      {
        externalHandle: 'genfeed',
        id: 'cred-1',
        platform: 'twitter',
      },
    ],
    organizationId: 'org-123',
  })),
}));

const postCampaign = vi.fn();

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => async () => ({
    post: postCampaign,
  })),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: vi.fn(() => ({
    push: vi.fn(),
  })),
  useSearchParams: vi.fn(() => ({
    get: vi.fn(() => null),
  })),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../apps/app/tests/next-intl.stub'
  );

  return { useTranslations: translateFromCatalog };
});

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => ({
      error: vi.fn(),
      success: vi.fn(),
    })),
  },
}));

describe('OutreachCampaignWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    postCampaign.mockResolvedValue({ id: 'campaign-1' });
  });

  it('enables verified X pairs and exposes stable reasons for unavailable ones', async () => {
    const user = userEvent.setup();
    render(<OutreachCampaignWizard />);

    const twitter = screen.getByRole('button', { name: /Twitter \/ X/i });
    const reddit = screen.getByRole('button', { name: /Reddit/i });
    const instagram = screen.getByRole('button', { name: /Instagram/i });
    const scheduled = screen.getByRole('button', { name: /Scheduled Blast/i });
    const dm = screen.getByRole('button', { name: /DM Outreach/i });

    expect(twitter).toHaveAttribute('aria-pressed', 'true');
    expect(twitter).not.toHaveAttribute('aria-disabled');
    expect(reddit).toHaveAttribute('aria-disabled', 'true');
    expect(instagram).toHaveAttribute('aria-disabled', 'true');
    expect(scheduled).not.toHaveAttribute('aria-disabled');
    expect(reddit).toHaveAccessibleDescription(
      /Reddit and Instagram outreach are not available yet/i,
    );

    await user.click(reddit);
    expect(twitter).toHaveAttribute('aria-pressed', 'true');
    expect(reddit).not.toHaveAttribute('aria-pressed', 'true');

    await user.click(dm);
    expect(dm).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: /^Manual/i }),
    ).not.toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps unavailable platform choices keyboard-accessible', () => {
    render(<OutreachCampaignWizard />);
    const reddit = screen.getByRole('button', { name: /Reddit/i });

    expect(reddit).not.toBeDisabled();
    reddit.focus();
    expect(reddit).toHaveFocus();
  });

  it('defaults to an executable X public-reply pair', () => {
    render(<OutreachCampaignWizard />);

    expect(
      screen.getByRole('button', { name: /Twitter \/ X/i }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^Manual/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /Next/i })).not.toBeDisabled();
  });

  it('requires a delivery time and timezone before creating a Scheduled Blast', async () => {
    const user = userEvent.setup();
    render(<OutreachCampaignWizard />);

    await user.click(screen.getByRole('button', { name: /Scheduled Blast/i }));
    expect(
      screen.getByRole('button', { name: /Scheduled Blast/i }),
    ).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: /Next/i }));

    expect(screen.getByText('Delivery time')).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: /Timezone/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: /Timezone/i }),
    ).not.toBeDisabled();
    expect(screen.getByLabelText('Date')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Next/i })).toBeDisabled();
  });
});
