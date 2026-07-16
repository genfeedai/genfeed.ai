import { render, screen } from '@testing-library/react';
import HomeCredits from '@web-components/home/_credits';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

describe('HomeCredits', () => {
  it('renders the credit-first heading', () => {
    render(<HomeCredits />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: /pay for output, not access\./i,
      }),
    ).toBeInTheDocument();
  });

  it('does not render subscription plan cards on the homepage', () => {
    render(<HomeCredits />);

    // The homepage credit band deliberately omits plan tiers; /pricing owns them.
    expect(screen.queryByText(/^\$499$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/cloud teams/i)).not.toBeInTheDocument();
  });

  it('links to the full pricing comparison and a demo', () => {
    render(<HomeCredits />);

    expect(
      screen.getByRole('link', { name: /compare plans/i }),
    ).toHaveAttribute('href', '/pricing');
    expect(
      screen.getByRole('link', { name: /book a demo/i }),
    ).toBeInTheDocument();
  });

  it('surfaces credit top-up amounts with their credit totals', () => {
    render(<HomeCredits />);

    expect(screen.getAllByText(/^\$\d/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/credits/i).length).toBeGreaterThan(0);
  });

  it('formats credit amounts deterministically across runtime locales', () => {
    const originalToLocaleString = Number.prototype.toLocaleString;
    const toLocaleStringSpy = vi
      .spyOn(Number.prototype, 'toLocaleString')
      .mockImplementation(function (
        this: number,
        locales?: Intl.LocalesArgument,
        options?: Intl.NumberFormatOptions,
      ) {
        return originalToLocaleString.call(
          this,
          locales ?? 'de-DE',
          options,
        );
      });

    try {
      render(<HomeCredits />);

      expect(screen.getByText('$1,000')).toBeInTheDocument();
      expect(screen.getByText('100,000 credits')).toBeInTheDocument();
    } finally {
      toLocaleStringSpy.mockRestore();
    }
  });

  it('surfaces the launch pricing note', () => {
    render(<HomeCredits />);

    expect(
      screen.getByText(
        /launch pricing \(code earlygenfeed\) — first 12 months, then \$49\/month/i,
      ),
    ).toBeInTheDocument();
  });
});
