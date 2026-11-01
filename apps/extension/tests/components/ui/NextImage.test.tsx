import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import NextImage from '~components/ui/NextImage';

describe('NextImage', () => {
  it('loads the image from its own address, without the Next optimizer', () => {
    render(
      <NextImage
        alt="Ada"
        src="https://pbs.twimg.com/profile_images/1/a.jpg"
        width={40}
        height={40}
        unoptimized
      />,
    );

    const image = screen.getByRole('img', { name: 'Ada' });
    expect(image).toHaveAttribute(
      'src',
      'https://pbs.twimg.com/profile_images/1/a.jpg',
    );
    expect(image).toHaveAttribute('referrerpolicy', 'no-referrer');
  });

  it('accepts an imported image object', () => {
    render(<NextImage alt="Logo" src={{ src: '/logo.svg' }} />);

    expect(screen.getByRole('img', { name: 'Logo' })).toHaveAttribute(
      'src',
      '/logo.svg',
    );
  });
});
