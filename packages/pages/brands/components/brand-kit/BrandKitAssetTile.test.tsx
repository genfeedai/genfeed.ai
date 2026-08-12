import BrandKitAssetTile from '@pages/brands/components/brand-kit/BrandKitAssetTile';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  warn: vi.fn(),
}));

vi.mock('next/image', () => ({
  default: ({
    alt,
    onError,
    src,
  }: {
    alt: string;
    onError?: () => void;
    src: string;
  }) => <img alt={alt} src={src} onError={onError} />,
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { warn: mocks.warn },
}));

describe('BrandKitAssetTile', () => {
  it('falls back harmlessly when a Logo.dev preview request fails', () => {
    render(
      <BrandKitAssetTile
        asset={{
          label: 'Website logo',
          role: 'logo',
          sourceType: 'website',
          url: 'https://img.logo.dev/acme.com?token=pk_test',
        }}
      />,
    );

    fireEvent.error(screen.getByRole('img', { name: 'Website logo' }));

    expect(
      screen.queryByRole('img', { name: 'Website logo' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Preview unavailable')).toBeInTheDocument();
    expect(mocks.warn).toHaveBeenCalledWith(
      'Logo.dev brand logo preview unavailable',
      {
        provider: 'logo.dev',
        role: 'logo',
        sourceType: 'website',
      },
    );
  });
});
