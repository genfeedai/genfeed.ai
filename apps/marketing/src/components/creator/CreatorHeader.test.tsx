import type { CreatorHeaderProps } from '@props/content/creator.props';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CreatorHeader from './CreatorHeader';

vi.mock('./ViewTracker', () => ({ default: () => null }));
vi.mock('./SupportCreatorButton', () => ({
  default: ({ label }: { label?: string }) => (
    <button type="button">{label}</button>
  ),
}));
vi.mock('./CreatorAccounts', () => ({ default: () => null }));

const brand = {
  description: 'Living my best life',
  id: 'brand-1',
  label: 'Shayla Monroe',
  logoUrl: 'https://cdn.example.com/logo.jpg',
} as CreatorHeaderProps['brand'];

function renderHeader(overrides: Partial<CreatorHeaderProps> = {}) {
  return render(
    <CreatorHeader
      brand={brand}
      handle="shayla"
      hasBanner
      profileUrl="https://genfeed.ai/@shayla"
      referralCode={null}
      {...overrides}
    />,
  );
}

/** True when the element or any ancestor is pulled up with a negative margin. */
function isPulledUp(element: HTMLElement): boolean {
  for (
    let node: HTMLElement | null = element;
    node;
    node = node.parentElement
  ) {
    if (/(^|\s)(sm:)?-mt-/.test(node.className)) {
      return true;
    }
  }
  return false;
}

describe('CreatorHeader', () => {
  it('keeps the name out of the part that overlaps the banner', () => {
    renderHeader();

    // The banner paints over anything pulled up under it, which once hid the
    // name. Only the picture may carry the negative margin.
    expect(
      isPulledUp(screen.getByRole('heading', { name: 'Shayla Monroe' })),
    ).toBe(false);
    expect(isPulledUp(screen.getByText('Living my best life'))).toBe(false);
    expect(isPulledUp(screen.getAllByText('SM')[0])).toBe(true);
  });

  it('does not pull the picture up when there is no banner', () => {
    renderHeader({ hasBanner: false });

    expect(isPulledUp(screen.getAllByText('SM')[0])).toBe(false);
  });

  it('has one sign-up link, then Subscribe, Support and the copy link', () => {
    renderHeader();

    expect(screen.getByRole('link', { name: 'Join Genfeed' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Subscribe' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Support' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeVisible();
  });
});
