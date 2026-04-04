import SignUpForm from '@pages/sign-up/sign-up-form';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: Record<string, unknown>) => (
    <img src={src as string} alt={alt as string} {...props} />
  ),
}));

vi.mock('@clerk/nextjs', () => ({
  SignUp: () => <div>Sign Up Component</div>,
}));

vi.mock('@hooks/ui/use-theme-logo/use-theme-logo', () => ({
  useThemeLogo: () => '/mock-logo.png',
}));

describe('SignUpForm', () => {
  it('should render without crashing', () => {
    const { container } = render(<SignUpForm />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should render the SignUp component', () => {
    render(<SignUpForm />);
    expect(screen.getByText('Sign Up Component')).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<SignUpForm />);
    const rootElement = container.firstChild as HTMLElement;

    expect(rootElement).toHaveClass('min-h-screen');
    expect(rootElement).toHaveClass('flex');
    expect(rootElement).toHaveClass('flex-col');
    expect(rootElement).toHaveClass('justify-center');
    expect(rootElement).toHaveClass('items-center');
  });
});
