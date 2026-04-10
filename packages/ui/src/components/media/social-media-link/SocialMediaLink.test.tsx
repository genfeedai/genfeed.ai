import { render, screen } from '@testing-library/react';
import SocialMediaLink from '@ui/media/social-media-link/SocialMediaLink';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/helpers/ui/mobile/mobile.helper', () => ({
  getDeepLink: (url: string) => url,
  isMobileDevice: () => false,
}));

vi.mock('@genfeedai/helpers/utm/utm-builder.helper', () => ({
  addUTMParameters: (url: string) => url,
}));

describe('SocialMediaLink', () => {
  it('should render without crashing', () => {
    const { container } = render(
      <SocialMediaLink
        url="https://instagram.com/test"
        icon={<span>IG</span>}
      />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should render a link with the correct url', () => {
    render(
      <SocialMediaLink
        url="https://instagram.com/test"
        icon={<span>IG</span>}
      />,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://instagram.com/test');
  });

  it('should render with tooltip when handle is provided', () => {
    render(
      <SocialMediaLink
        url="https://instagram.com/test"
        handle="testhandle"
        icon={<span>IG</span>}
      />,
    );
    const link = screen.getByRole('link');
    expect(link).toBeInTheDocument();
  });
});
