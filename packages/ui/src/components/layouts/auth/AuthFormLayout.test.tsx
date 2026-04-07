import { render, screen } from '@testing-library/react';
import AuthFormLayout from '@ui/layouts/auth/AuthFormLayout';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    blurDataURL: _blurDataURL,
    fill: _fill,
    priority: _priority,
    ...props
  }: Record<string, unknown>) => (
    <img src={src as string} alt={alt as string} {...props} />
  ),
}));

vi.mock('@hooks/ui/use-theme-logo/use-theme-logo', () => ({
  useThemeLogo: () => '/mock-logo.png',
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    LOGO_ALT: 'Test Logo',
  },
}));

describe('AuthFormLayout', () => {
  it('should render children', () => {
    render(
      <AuthFormLayout>
        <div data-testid="child">Child Content</div>
      </AuthFormLayout>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.getByText('Child Content')).toBeInTheDocument();
  });

  it('should render the logo', () => {
    render(
      <AuthFormLayout>
        <div>Content</div>
      </AuthFormLayout>,
    );
    const logo = screen.getByRole('img');
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute('alt', 'Test Logo');
  });

  it('should apply correct layout styles', () => {
    const { container } = render(
      <AuthFormLayout>
        <div>Content</div>
      </AuthFormLayout>,
    );
    const rootElement = container.firstChild as HTMLElement;

    expect(rootElement).toHaveClass('min-h-screen');
    expect(rootElement).toHaveClass('flex');
    expect(rootElement).toHaveClass('flex-col');
    expect(rootElement).toHaveClass('justify-center');
    expect(rootElement).toHaveClass('items-center');
  });

  it('should render logo from mocked hook', () => {
    render(
      <AuthFormLayout>
        <div>Content</div>
      </AuthFormLayout>,
    );

    const logo = screen.getByRole('img');
    expect(logo).toHaveAttribute('src', '/mock-logo.png');
  });
});
