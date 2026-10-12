import { act, render, screen } from '@testing-library/react';
import type { AnchorHTMLAttributes } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LandingTopbar from './LandingTopbar';

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

vi.mock('@ui/topbars/logo/TopbarLogo', () => ({
  default: () => <span>Logo</span>,
}));

describe('LandingTopbar', () => {
  it('renders only the primary CTA when no secondary action is given', () => {
    render(<LandingTopbar ctaHref="/sign-up" ctaLabel="Start free" />);

    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Start free' })).toHaveAttribute(
      'href',
      '/sign-up',
    );
  });

  it('keeps internal agent connection in the current tab', () => {
    render(
      <LandingTopbar ctaHref="/agent#connect" ctaLabel="Connect your agent" />,
    );
    expect(
      screen.getByRole('link', { name: 'Connect your agent' }),
    ).not.toHaveAttribute('target', '_blank');
  });

  it('opens external signup separately', () => {
    render(
      <LandingTopbar
        ctaHref="https://app.genfeed.ai/sign-up"
        ctaLabel="Start free"
      />,
    );
    expect(screen.getByRole('link', { name: 'Start free' })).toHaveAttribute(
      'target',
      '_blank',
    );
  });

  it('renders the secondary CTA alongside the primary one', () => {
    render(
      <LandingTopbar
        ctaHref="/sign-up"
        ctaLabel="Start free"
        secondaryCtaHref="/done-for-you#book"
        secondaryCtaLabel="Book a call"
      />,
    );

    expect(screen.getByRole('link', { name: 'Book a call' })).toHaveAttribute(
      'href',
      '/done-for-you#book',
    );
    expect(screen.getByRole('link', { name: 'Start free' })).toHaveAttribute(
      'href',
      '/sign-up',
    );
  });

  describe('hideActionWhileVisible', () => {
    type ObserverCallback = (entries: { isIntersecting: boolean }[]) => void;
    let notify: ObserverCallback = () => {};
    const disconnect = vi.fn();

    function stubObserver() {
      vi.stubGlobal(
        'IntersectionObserver',
        class {
          constructor(callback: ObserverCallback) {
            notify = callback;
          }
          observe = vi.fn();
          disconnect = disconnect;
        },
      );
    }

    afterEach(() => {
      vi.unstubAllGlobals();
      document.body.innerHTML = '';
    });

    it('hides the CTA below sm while the in-page CTA is on screen, then shows it', () => {
      stubObserver();
      document.body.innerHTML = '<div data-hero-cta></div>';
      render(
        <LandingTopbar
          ctaHref="/sign-up"
          ctaLabel="Start free"
          hideActionWhileVisible="[data-hero-cta]"
        />,
      );
      const group = screen.getByRole('link', { name: 'Start free' })
        .parentElement?.parentElement as HTMLElement;
      expect(group).toHaveClass('max-sm:invisible');

      act(() => notify([{ isIntersecting: false }]));
      expect(group).not.toHaveClass('max-sm:invisible');

      act(() => notify([{ isIntersecting: true }]));
      expect(group).toHaveClass('max-sm:invisible');
    });

    it('keeps the CTA when the in-page CTA is not on the page', () => {
      stubObserver();
      render(
        <LandingTopbar
          ctaHref="/sign-up"
          ctaLabel="Start free"
          hideActionWhileVisible="[data-hero-cta]"
        />,
      );
      const group = screen.getByRole('link', { name: 'Start free' })
        .parentElement?.parentElement as HTMLElement;
      expect(group).not.toHaveClass('max-sm:invisible');
    });

    it('always shows the CTA without the option', () => {
      render(<LandingTopbar ctaHref="/sign-up" ctaLabel="Start free" />);
      const group = screen.getByRole('link', { name: 'Start free' })
        .parentElement?.parentElement as HTMLElement;
      expect(group).not.toHaveClass('max-sm:invisible');
    });
  });
});
