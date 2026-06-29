import { fireEvent, render, screen } from '@testing-library/react';
import type { AnchorHTMLAttributes, ImgHTMLAttributes, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import BrandOSContent from './brand-os-content';

vi.mock('next/image', () => ({
  default: ({
    fill: _fill,
    priority: _priority,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & {
    fill?: boolean;
    priority?: boolean;
  }) => (
    <span
      aria-label={props.alt ?? ''}
      data-src={typeof props.src === 'string' ? props.src : undefined}
      role="img"
    />
  ),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apps: {
      app: 'https://app.genfeed.ai',
    },
  },
}));

vi.mock('@web-components/home/_footer', () => ({
  default: () => <footer>Footer</footer>,
}));

vi.mock('@ui/buttons/tracked/ButtonTracked', () => ({
  default: ({
    asChild: _asChild,
    children,
  }: {
    asChild?: boolean;
    children: ReactNode;
  }) => <>{children}</>,
}));

describe('BrandOSContent', () => {
  it('renders the public Brand OS CTA and preview states', () => {
    render(<BrandOSContent />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /turn source evidence into a usable brand system/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/public website url/i)).toHaveValue(
      'genfeed.ai',
    );
    expect(screen.getByTestId('brand-os-preview')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ready/i })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /save in genfeed/i }),
    ).toHaveAttribute('href', 'https://app.genfeed.ai/sign-up?source=brand-os');
  });

  it('updates the preview status from the visitor input', () => {
    render(<BrandOSContent />);

    fireEvent.change(screen.getByLabelText(/public website url/i), {
      target: { value: 'https://example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /ready/i }));

    expect(screen.getByText(/preview ready: example.com/i)).toBeInTheDocument();
  });

  it('submits the Refresh Preview form on first load without typing https://', () => {
    render(<BrandOSContent />);

    // Input starts with bare "genfeed.ai" (no scheme) — form must fire without
    // browser native-URL-validation blocking it.
    const submitButton = screen.getByRole('button', {
      name: /refresh preview/i,
    });
    const form = submitButton.closest('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);

    // After submit the preview transitions away from idle; with guidance present
    // (initial state has guidance) it should move to "ready".
    expect(screen.getByText(/preview ready:/i)).toBeInTheDocument();
  });
});
