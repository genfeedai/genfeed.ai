import { readFileSync } from 'node:fs';
import { getPageMarketingAsset } from '@data/page-marketing-assets.data';
import TurboContent, { TURBO_SIGNUP_HREF } from '@public/turbo/turbo-content';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const COPY = [
  'Tell Genfeed about your business once. Turbo drafts images, video and captions that sound like you.',
  'No credit card needed.',
  'Sign up',
  'Create your Genfeed account in a minute.',
  'Tell us about your business',
  "Your website, what you sell, who it's for and how you talk.",
  'Get your first posts',
  'Turbo drafts on-brand images, video and captions, ready to review.',
  'Swipe to approve',
  "Keep what fits, skip what doesn't, schedule the rest.",
  'Every draft waits for your approval. Reject one and tell us why; the next batch learns from it.',
  'Turbo learns from what you approve and what performs, so each batch fits your brand better.',
  'Do I need a credit card?',
  'No. Create your account and your first posts come with it.',
  'What if my website says little about my business?',
  "Turbo asks a few quick questions before generating, so drafts aren't generic.",
  'Which platforms?',
  'Drafts follow the platforms in your brand strategy; you choose where to schedule.',
  'Does anything post automatically?',
  'No. You approve every post.',
];

describe('TurboContent', () => {
  it('renders the settled copy and every section', () => {
    render(<TurboContent />);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Your brand in. On-brand content out.',
      }),
    ).toBeInTheDocument();
    for (const title of [
      'How it works',
      'Nothing posts without you.',
      'Gets sharper every batch.',
      'Frequently asked questions',
      'Ready when you are.',
    ]) {
      expect(
        screen.getByRole('heading', { level: 2, name: title }),
      ).toBeInTheDocument();
    }
    for (const copy of COPY)
      expect(screen.getAllByText(copy).length).toBeGreaterThan(0);
    expect(screen.getByText('Turbo')).toBeInTheDocument();
  });

  it('sends every CTA to signup with UTM parameters and keeps only the pricing exception', () => {
    render(<TurboContent />);
    const signup = new URL(TURBO_SIGNUP_HREF);
    expect(signup.pathname).toBe('/sign-up');
    expect(signup.searchParams.get('utm_source')).toBe('website');
    expect(signup.searchParams.get('utm_campaign')).toBe('turbo');
    const ctas = screen.getAllByRole('link', { name: 'Start with Turbo' });
    expect(ctas).toHaveLength(3);
    for (const cta of ctas)
      expect(cta).toHaveAttribute('href', TURBO_SIGNUP_HREF);
    const otherLinks = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href') !== TURBO_SIGNUP_HREF);
    expect(otherLinks).toHaveLength(1);
    expect(otherLinks[0]).toHaveAttribute('href', '/pricing');
    expect(
      screen.queryByRole('button', { name: /connect.*agent/i }),
    ).not.toBeInTheDocument();
  });

  it('tracks every signup button through the existing conversion mechanism', () => {
    const listener = vi.fn();
    window.addEventListener('genfeed:marketing:button-click', listener);
    render(<TurboContent />);
    for (const cta of screen.getAllByRole('link', { name: 'Start with Turbo' }))
      fireEvent.click(cta);
    expect(listener).toHaveBeenCalledTimes(3);
    for (const [event] of listener.mock.calls)
      expect(event.detail).toEqual({
        trackingData: { action: 'start_signup' },
        trackingName: 'turbo_signup_click',
      });
    window.removeEventListener('genfeed:marketing:button-click', listener);
  });

  it('reuses Studio artwork and contains no public service or agent connection imports', () => {
    expect(getPageMarketingAsset('/turbo')).toEqual(
      getPageMarketingAsset('/studio'),
    );
    const source = readFileSync('app/(public)/turbo/turbo-content.tsx', 'utf8');
    expect(source).not.toMatch(
      /@services\/external\/public\.service|PublicService|AgentFirstActions|ConnectAgent/,
    );
    expect(source).not.toMatch(/use client/);
  });
});
