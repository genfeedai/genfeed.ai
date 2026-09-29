import { render, screen } from '@testing-library/react';
import ButtonRequestAccess from '@ui/buttons/request-access/button-request-access/ButtonRequestAccess';
import { describe, expect, it } from 'vitest';

describe('ButtonRequestAccess', () => {
  it('links directly to the free signup flow', () => {
    render(<ButtonRequestAccess />);

    expect(
      screen.getByRole('link', { name: 'Create free account' }),
    ).toHaveAttribute(
      'href',
      'https://app.genfeed.ai/sign-up?source=signup-cta',
    );
  });
});
