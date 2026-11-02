import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import BrandProfileHeader, {
  hasBrandProfileHeaderOverlap,
} from './BrandProfileHeader';

describe('BrandProfileHeader', () => {
  it('shows the banner and the logo tile together', () => {
    render(
      <BrandProfileHeader
        bannerUrl="https://cdn.example/banner.png"
        label="Genfeed"
        logoUrl="https://cdn.example/logo.png"
      />,
    );

    expect(screen.getByRole('img', { name: 'Genfeed banner' })).toBeTruthy();
    expect(screen.getByTestId('brand-profile-header')).toBeTruthy();
  });

  it('shows the logo initials and no banner when the brand has neither picture', () => {
    render(<BrandProfileHeader label="Genfeed" />);

    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('G')).toBeTruthy();
  });

  it.each([
    ['https://cdn.example/banner.png', true],
    [null, false],
    [undefined, false],
  ])('needs content clearance for banner %s: %s', (bannerUrl, expected) => {
    expect(hasBrandProfileHeaderOverlap(bannerUrl)).toBe(expected);
  });
});
