import { render, screen } from '@testing-library/react';
import AuthShowcase from '@ui/layouts/auth/AuthShowcase';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    fill: _fill,
    priority: _priority,
    sizes: _sizes,
    ...props
  }: Record<string, unknown>) => (
    <img src={src as string} alt={alt as string} {...props} />
  ),
}));

const COPY = {
  pauseLabel: 'Pause',
  playLabel: 'Play',
  description: 'Create, review and publish.',
  headline: 'From brief to published.',
  steps: ['Create', 'Review', 'Publish'],
};

function mockReducedMotion(isReduced: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      addEventListener: vi.fn(),
      matches: isReduced,
      removeEventListener: vi.fn(),
    }),
  );
}

describe('AuthShowcase', () => {
  it.each(['wall', 'rotator', 'bento'] as const)(
    'renders the value line and steps for the %s variant',
    (variant) => {
      render(<AuthShowcase variant={variant} {...COPY} />);

      expect(
        screen.getByRole('heading', { name: COPY.headline }),
      ).toBeInTheDocument();
      expect(screen.getByText(COPY.description)).toBeInTheDocument();
      expect(screen.getAllByRole('listitem')).toHaveLength(3);
    },
  );

  it('keeps media decorative', () => {
    const { container } = render(<AuthShowcase variant="wall" {...COPY} />);

    const images = Array.from(container.querySelectorAll('img'));
    expect(images.length).toBeGreaterThan(0);
    for (const image of images) {
      expect(image).toHaveAttribute('alt', '');
    }
  });

  it('plays the video variant with a pause control', () => {
    mockReducedMotion(false);
    const { container } = render(<AuthShowcase variant="video" {...COPY} />);

    expect(container.querySelector('video')?.muted).toBe(true);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('keeps the video variant to its poster under reduced motion', () => {
    mockReducedMotion(true);
    const { container } = render(<AuthShowcase variant="video" {...COPY} />);

    expect(container.querySelector('video')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
