import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, expect, it, vi } from 'vitest';
import SelectedAvatarPreview from './SelectedAvatarPreview';

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <img alt={alt} src={src} />
  ),
}));

describe('SelectedAvatarPreview', () => {
  it('renders shared avatar preview content', () => {
    render(
      <SelectedAvatarPreview
        description="Used as fallback."
        imageAlt="Brand avatar"
        imageUrl="/avatar.png"
        title="Primary Avatar"
      />,
    );

    expect(screen.getByText('Primary Avatar')).toBeInTheDocument();
    expect(screen.getByText('Used as fallback.')).toBeInTheDocument();
    expect(screen.getByAltText('Brand avatar')).toHaveAttribute(
      'src',
      '/avatar.png',
    );
  });
});
