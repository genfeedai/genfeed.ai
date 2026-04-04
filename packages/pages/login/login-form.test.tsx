import LoginForm from '@pages/login/login-form';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: Record<string, unknown>) => (
    <img src={src as string} alt={alt as string} {...props} />
  ),
}));

vi.mock('@clerk/nextjs', () => ({
  SignIn: () => <div>Sign In Component</div>,
}));

vi.mock('@hooks/ui/use-theme-logo/use-theme-logo', () => ({
  useThemeLogo: () => '/mock-logo.png',
}));

describe('LoginForm', () => {
  it('should render without crashing', () => {
    const { container } = render(<LoginForm />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should render the SignIn component', () => {
    render(<LoginForm />);
    expect(screen.getByText('Sign In Component')).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<LoginForm />);
    const rootElement = container.firstChild as HTMLElement;

    expect(rootElement).toHaveClass('min-h-screen');
    expect(rootElement).toHaveClass('flex');
    expect(rootElement).toHaveClass('flex-col');
    expect(rootElement).toHaveClass('justify-center');
    expect(rootElement).toHaveClass('items-center');
  });
});
