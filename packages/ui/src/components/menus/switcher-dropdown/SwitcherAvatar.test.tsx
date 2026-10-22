import { fireEvent, render, screen } from '@testing-library/react';
import SwitcherAvatar from '@ui/menus/switcher-dropdown/SwitcherAvatar';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/image', () => ({
  default: ({ alt, onError, src }: import('react').ComponentProps<'input'>) => (
    <input alt={alt} onError={onError} src={src} type="image" />
  ),
}));

const props = {
  alt: 'Genfeed',
  fallbackClassName: 'fallback',
  imageWrapperClassName: 'image',
  letter: 'G',
};

describe('SwitcherAvatar', () => {
  it('renders the logo when it has a URL', () => {
    render(<SwitcherAvatar {...props} imageUrl="https://cdn.test/logo.png" />);

    expect(screen.getByAltText('Genfeed')).toBeTruthy();
    expect(screen.queryByText('G')).toBeNull();
  });

  it('renders the letter when there is no URL', () => {
    render(<SwitcherAvatar {...props} />);

    expect(screen.getByText('G')).toBeTruthy();
  });

  it('falls back to the letter when the logo fails to load', () => {
    render(<SwitcherAvatar {...props} imageUrl="https://cdn.test/logo.png" />);

    fireEvent.error(screen.getByAltText('Genfeed'));

    expect(screen.queryByAltText('Genfeed')).toBeNull();
    expect(screen.getByText('G')).toBeTruthy();
  });

  it('tells the owner when the logo fails and shows a fresh URL again', () => {
    const onImageError = vi.fn();
    const { rerender } = render(
      <SwitcherAvatar
        {...props}
        imageUrl="https://cdn.test/logo.png?sig=old"
        onImageError={onImageError}
      />,
    );

    fireEvent.error(screen.getByAltText('Genfeed'));
    expect(onImageError).toHaveBeenCalledTimes(1);

    rerender(
      <SwitcherAvatar
        {...props}
        imageUrl="https://cdn.test/logo.png?sig=new"
        onImageError={onImageError}
      />,
    );

    expect(screen.getByAltText('Genfeed')).toBeTruthy();
  });
});
