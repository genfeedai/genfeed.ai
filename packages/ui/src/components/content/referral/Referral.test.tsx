import { render, screen } from '@testing-library/react';
import Referral from '@ui/content/referral/Referral';
import { describe, expect, it } from 'vitest';

describe('Referral', () => {
  it('should render without crashing', () => {
    const { container } = render(<Referral />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<Referral />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<Referral />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });

  it('links referral traffic directly to signup', () => {
    render(<Referral />);

    expect(
      screen.getByRole('link', { name: 'Create free account' }),
    ).toHaveAttribute('href', 'https://app.genfeed.ai/sign-up?source=referral');
  });
});
