import { render, screen } from '@testing-library/react';
import * as Module from '@web-components/home/_footer';
import HomeFooter, { WEBSITE_SECTIONS } from '@web-components/home/_footer';
import type { ImgHTMLAttributes, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/image', () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement>) => (
    <span aria-label={props.alt ?? ''} role="img" />
  ),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@genfeedai/services/core/environment.service', () => ({
  EnvironmentService: {
    calendly: 'https://calendly.com/genfeed/demo',
    logoURL: 'https://genfeed.ai/logo.png',
    social: {
      discord: 'https://discord.gg/genfeed',
      instagram: 'https://instagram.com/genfeed',
      substack: 'https://genfeed.substack.com',
      tiktok: 'https://tiktok.com/@genfeed',
      twitter: 'https://x.com/genfeed',
      youtube: 'https://youtube.com/@genfeed',
    },
  },
}));

describe('Footer Component', () => {
  it('exports a default component', () => {
    expect(Module).toHaveProperty('default');
    expect(typeof Module.default).toBe('function');
  });

  it('stays a navigation aid rather than a sitemap', () => {
    const links = WEBSITE_SECTIONS.flatMap((section) => section.links);

    expect(WEBSITE_SECTIONS).toHaveLength(4);
    expect(links.length).toBeLessThanOrEqual(20);
  });

  it('lists every destination exactly once', () => {
    const hrefs = WEBSITE_SECTIONS.flatMap((section) =>
      section.links.map((link) => link.href),
    );

    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('leaves the legal links to the bottom bar', () => {
    const hrefs = WEBSITE_SECTIONS.flatMap((section) =>
      section.links.map((link) => link.href),
    );

    expect(hrefs).not.toContain('/terms');
    expect(hrefs).not.toContain('/privacy');
  });

  it('renders every section destination as a real link', () => {
    render(<HomeFooter />);

    for (const section of WEBSITE_SECTIONS) {
      expect(
        screen.getByRole('heading', { name: section.title }),
      ).toBeInTheDocument();

      for (const link of section.links) {
        expect(screen.getByRole('link', { name: link.label })).toHaveAttribute(
          'href',
          link.href,
        );
      }
    }
  });

  it('keeps the legal links in the bottom bar of the rendered footer', () => {
    render(<HomeFooter />);

    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute(
      'href',
      '/terms',
    );
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute(
      'href',
      '/privacy',
    );
  });
});
