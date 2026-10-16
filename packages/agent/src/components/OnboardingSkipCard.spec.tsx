import { OnboardingSkipCard } from '@genfeedai/agent/components/OnboardingSkipCard';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../apps/app/tests/next-intl.stub'
  );

  return { useTranslations: translateFromCatalog };
});

describe('OnboardingSkipCard', () => {
  it('confirms before skipping and leaves the question when the user stays', () => {
    const onSkip = vi.fn();
    render(<OnboardingSkipCard onSkip={onSkip} />);

    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    expect(
      screen.getByRole('dialog', { name: 'Skip this step?' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/makes the posts, images, and videos match you/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Answer it' }));
    expect(onSkip).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip anyway' }));
    expect(onSkip).toHaveBeenCalledOnce();
  });
});
