import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import TopbarPublic from '@ui/topbars/public/TopbarPublic';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

vi.mock('@ui/topbars/logo/TopbarLogo', () => ({
  default: () => <span>Genfeed</span>,
}));

const DROPDOWNS = [
  {
    footer: {
      description: 'Every audience.',
      href: '/use-cases',
      label: 'Browse all use cases',
    },
    items: [{ href: '/use-cases/creators', label: 'Creators' }],
    label: 'Use Cases',
  },
];

const NAV_LINKS = [
  { href: '/pricing', label: 'Pricing' },
  { href: '/articles', label: 'Blog' },
];

function renderTopbar() {
  render(
    <TopbarPublic
      dropdowns={DROPDOWNS}
      mobileActions={<a href="/login">Log in</a>}
      navLinks={NAV_LINKS}
      rightContent={<a href="/sign-up">Start creating</a>}
    />,
  );

  return screen.getByRole('button', { name: 'Open menu' });
}

function getMobileMenu(): HTMLElement {
  const menu = document.getElementById('topbar-public-mobile-menu');
  if (!menu) {
    throw new Error('mobile menu is not open');
  }
  return menu;
}

describe('TopbarPublic mobile menu', () => {
  it('announces its state and the panel it controls', () => {
    const toggle = renderTopbar();

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute(
      'aria-controls',
      'topbar-public-mobile-menu',
    );

    fireEvent.click(toggle);

    expect(
      screen.getByRole('button', { name: 'Close menu', expanded: true }),
    ).toBeInTheDocument();
  });

  it('leads with the account actions, then Pricing, then the groups', () => {
    fireEvent.click(renderTopbar());

    const links = within(getMobileMenu())
      .getAllByRole('link')
      .map((link) => link.textContent);

    expect(links).toEqual([
      'Log in',
      'Pricing',
      'Blog',
      'Creators',
      'Browse all use cases',
    ]);
  });

  it('sits under the header so the header CTA stays reachable', () => {
    fireEvent.click(renderTopbar());

    const layer = getMobileMenu().parentElement;
    expect(layer).toHaveClass('z-40');
    expect(screen.getByRole('banner')).toHaveClass('z-50');
  });

  it('closes on Escape and returns focus to the menu button', () => {
    const toggle = renderTopbar();
    fireEvent.click(toggle);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(
      document.getElementById('topbar-public-mobile-menu'),
    ).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('TopbarPublic scroll surface', () => {
  function scrollTo(y: number) {
    Object.defineProperty(window, 'scrollY', { configurable: true, value: y });
    fireEvent.scroll(window);
  }

  it('ramps the glass in, then stops restyling once it is fully in', () => {
    renderTopbar();
    const header = screen.getByRole('banner');

    scrollTo(80);
    expect(header.style.getPropertyValue('--topbar-surface')).toBe('0.500');
    expect(header.style.backdropFilter).toBe('blur(12.0px)');

    scrollTo(400);
    expect(header.style.getPropertyValue('--topbar-surface')).toBe('1.000');

    const setProperty = vi.spyOn(header.style, 'setProperty');
    scrollTo(800);
    scrollTo(1200);
    expect(setProperty).not.toHaveBeenCalled();

    scrollTo(0);
    expect(header.style.getPropertyValue('--topbar-surface')).toBe('0.000');
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
  });
});
