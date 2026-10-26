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
  description: 'Create, review and publish.',
  headline: 'From brief to published.',
  steps: ['Create', 'Review', 'Publish'],
};

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
});
