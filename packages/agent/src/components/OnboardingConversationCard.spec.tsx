import { OnboardingConversationCard } from '@genfeedai/agent/components/OnboardingConversationCard';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const copy: Record<string, string> = {
      description:
        'Paste a site or handle in the prompt, or type what you make. The first reply should be an image.',
      title: 'Tell the agent what you create',
    };
    return copy[key] ?? key;
  },
}));

describe('OnboardingConversationCard', () => {
  it('renders a compact prompt-bar hint without a second input', () => {
    render(<OnboardingConversationCard />);

    expect(
      screen.getByRole('heading', { name: 'Tell the agent what you create' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: 'Website, X, or LinkedIn' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /start with my first image/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/what best describes you/i),
    ).not.toBeInTheDocument();
  });
});
