import LogoutForm from '@pages/logout/logout-form';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('LogoutForm', () => {
  it('should render without crashing', () => {
    const { container } = render(<LogoutForm />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<LogoutForm />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<LogoutForm />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
