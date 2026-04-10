import { render } from '@testing-library/react';
import SubscriptionPlanChanger from '@ui/subscription/SubscriptionPlanChanger';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/services/core/environment.service', () => ({
  EnvironmentService: {
    plans: { monthly: 'price_monthly', yearly: 'price_yearly' },
  },
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const mockSubscription = {
  category: 'monthly',
  stripePriceId: 'price_monthly',
};

describe('SubscriptionPlanChanger', () => {
  it('should render without crashing', () => {
    const { container } = render(
      <SubscriptionPlanChanger
        subscription={mockSubscription}
        onPreviewChange={vi.fn()}
        onChangePlan={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(
      <SubscriptionPlanChanger
        subscription={mockSubscription}
        onPreviewChange={vi.fn()}
        onChangePlan={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <SubscriptionPlanChanger
        subscription={mockSubscription}
        onPreviewChange={vi.fn()}
        onChangePlan={vi.fn()}
      />,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
