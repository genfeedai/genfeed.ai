import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import BrandAvatar from './BrandAvatar';

describe('BrandAvatar', () => {
  it('shows the first letter of the brand while no logo has loaded', () => {
    render(
      <BrandAvatar name="genfeedai" logoUrl="https://cdn.test/logo.png" />,
    );

    expect(screen.getByText('G')).toBeInTheDocument();
  });

  it('shows the first letter when the brand has no logo', () => {
    render(<BrandAvatar name="  moonrise" logoUrl={null} />);

    expect(screen.getByText('M')).toBeInTheDocument();
  });

  it('falls back to a dash for an empty name', () => {
    render(<BrandAvatar name="" />);

    expect(screen.getByText('-')).toBeInTheDocument();
  });
});
