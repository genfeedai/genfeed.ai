import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './button';

describe('Button loading state', () => {
  it('shows a plain spinner, never the animated brand mark', () => {
    const { container } = render(<Button isLoading label="Move 1 brand" />);

    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    expect(container.querySelector('.genfeed-loader-root')).toBeNull();
    expect(container.querySelector('.genfeed-loader-trace')).toBeNull();
    expect(screen.getByRole('button')).toHaveTextContent('Move 1 brand');
  });
});
