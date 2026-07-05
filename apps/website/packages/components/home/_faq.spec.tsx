import { render, screen } from '@testing-library/react';
import HomeFAQ from '@web-components/home/_faq';
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

describe('HomeFAQ', () => {
  it('renders the section heading', () => {
    render(<HomeFAQ />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: /common questions, answered\./i,
      }),
    ).toBeInTheDocument();
  });

  it('links to the full FAQ page', () => {
    render(<HomeFAQ />);

    expect(screen.getByRole('link', { name: /see all faqs/i })).toHaveAttribute(
      'href',
      '/faq',
    );
  });
});
