import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ProfileEmptyState from './ProfileEmptyState';

describe('ProfileEmptyState', () => {
  it('tells the visitor the profile has nothing to show yet', () => {
    render(<ProfileEmptyState handle="acme" />);

    expect(
      screen.getByRole('heading', { name: /nothing here yet/i }),
    ).toBeTruthy();
    expect(screen.getByText(/@acme has not shared/i)).toBeTruthy();
  });
});
