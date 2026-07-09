import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@hooks/ui/use-theme-logo/use-theme-logo', () => ({
  useThemeLogo: () => 'https://example.com/logo.svg',
}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) =>
    React.createElement('img', props),
}));

import LoginPage from '~components/pages/LoginPage';

describe('LoginPage', () => {
  it('renders without throwing', () => {
    expect(() => render(React.createElement(LoginPage))).not.toThrow();
  });

  it('links users without accounts to free signup', () => {
    render(React.createElement(LoginPage));

    expect(
      screen.getByRole('link', { name: 'Create a free account' }),
    ).toHaveAttribute(
      'href',
      'https://genfeed.ai/sign-up?source=browser-extension',
    );
  });
});
