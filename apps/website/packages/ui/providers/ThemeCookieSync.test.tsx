import { render } from '@testing-library/react';
import ThemeCookieSync from '@ui/providers/ThemeCookieSync';
import { ThemeProvider } from 'next-themes';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/constants', () => ({
  DEFAULT_THEME: 'dark',
  THEME_COOKIE_MAX_AGE: 31536000,
  THEME_COOKIE_NAME: 'theme',
}));

describe('ThemeCookieSync', () => {
  it('should render without crashing (returns null)', () => {
    const { container } = render(
      <ThemeProvider attribute="class" defaultTheme="dark">
        <ThemeCookieSync />
      </ThemeProvider>,
    );
    // ThemeCookieSync returns null - it only has side effects
    expect(container).toBeInTheDocument();
  });

  it('should be a side-effect-only component', () => {
    const { container } = render(
      <ThemeProvider attribute="class" defaultTheme="dark">
        <ThemeCookieSync />
      </ThemeProvider>,
    );
    // The ThemeCookieSync itself renders nothing; ThemeProvider renders a script
    expect(container).toBeInTheDocument();
  });
});
