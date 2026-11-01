import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import OnboardingProgress from './onboarding-progress';

const LABELS = ['Brand', 'Voice', 'Plan'];

describe('OnboardingProgress', () => {
  it('reports how far along the flow is and marks the current step', () => {
    render(
      <OnboardingProgress
        currentStep={1}
        stepLabels={LABELS}
        totalSteps={LABELS.length}
      />,
    );

    expect(
      screen.getByRole('progressbar', { name: 'Onboarding progress' }),
    ).toHaveAttribute('aria-valuenow', '1');
    expect(screen.getByText('Voice').closest('[aria-current]')).toHaveAttribute(
      'aria-current',
      'step',
    );
  });

  it('lets people go back only to steps that are not disabled', () => {
    const onStepChange = vi.fn();
    render(
      <OnboardingProgress
        currentStep={2}
        disabledSteps={[1]}
        onStepChange={onStepChange}
        stepLabels={LABELS}
        totalSteps={LABELS.length}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Brand' }));
    expect(onStepChange).toHaveBeenCalledWith(0);
    expect(screen.getByRole('button', { name: 'Voice' })).toBeDisabled();
  });
});
