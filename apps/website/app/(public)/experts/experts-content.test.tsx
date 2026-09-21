import { render, screen } from '@testing-library/react';
import type { AnchorHTMLAttributes } from 'react';
import { describe, expect, it, vi } from 'vitest';
import ExpertsContent from './experts-content';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apps: {
      app: 'https://app.genfeed.ai',
    },
  },
}));

vi.mock('@web-components/home/_footer', () => ({
  default: () => <footer>Footer</footer>,
}));

describe('ExpertsContent', () => {
  it('renders the Brand OS promise for experts', () => {
    render(<ExpertsContent />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /you supply the truth\. genfeed supplies the system\./i,
      }),
    ).toBeInTheDocument();
  });

  it('renders every step of the six-step path', () => {
    render(<ExpertsContent />);

    expect(
      screen.getByRole('heading', { name: /positioning interview/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /corpus intake/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /voice profile/i }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('heading', { name: /positioning scorecard/i }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole('heading', { name: /first content system/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /weekly digest/i }),
    ).toBeInTheDocument();
  });

  it('breaks the positioning scorecard into its six dimensions', () => {
    render(<ExpertsContent />);

    expect(
      screen.getByRole('heading', { name: /attractive character/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /origin story/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /big domino/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /new opportunity/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /authority signals/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /differentiation/i }),
    ).toBeInTheDocument();
  });

  it('labels the before/after comparison as an illustrative example with a source citation', () => {
    render(<ExpertsContent />);

    expect(
      screen.getByText(/illustrative example — not a real customer post/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/generic ai post/i)).toBeInTheDocument();
    expect(
      screen.getAllByText(/grounded in your corpus/i).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(/source: your 2024 keynote transcript/i),
    ).toBeInTheDocument();
  });

  it('states the approval gate explicitly, without claiming autonomous publishing', () => {
    render(<ExpertsContent />);

    expect(
      screen.getByRole('heading', {
        name: /nothing publishes without your approval/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /publish approval is on by default for every expert account/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/there is no autonomous-publishing mode/i),
    ).toBeInTheDocument();
  });

  it('points every "Build your Brand OS" CTA at sign-up with the Expert account type preselected', () => {
    render(<ExpertsContent />);

    const ctas = screen.getAllByRole('link', {
      name: /build your brand os/i,
    });

    expect(ctas.length).toBeGreaterThan(0);
    for (const cta of ctas) {
      expect(cta).toHaveAttribute(
        'href',
        'https://app.genfeed.ai/sign-up?accountType=EXPERT',
      );
    }
  });

  it('offers a secondary self-host CTA', () => {
    render(<ExpertsContent />);

    const selfHostLinks = screen.getAllByRole('link', {
      name: /self-host genfeed/i,
    });

    expect(selfHostLinks.length).toBeGreaterThan(0);
    for (const link of selfHostLinks) {
      expect(link).toHaveAttribute('href', '/self-hosted');
    }
  });
});
