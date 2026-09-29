import { render, screen } from '@testing-library/react';
import Referral from '@ui/content/referral/Referral';
import { describe, expect, it } from 'vitest';

describe('Referral', () => {
  it('links referral traffic directly to signup', () => {
    render(<Referral />);

    expect(
      screen.getByRole('link', { name: 'Create free account' }),
    ).toHaveAttribute('href', 'https://app.genfeed.ai/sign-up?source=referral');
  });
});
