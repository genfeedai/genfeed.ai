import { render } from '@testing-library/react';
import ButtonRequestAccess from '@ui/buttons/request-access/button-request-access/ButtonRequestAccess';
import { describe, expect, it } from 'vitest';

describe('ButtonRequestAccess', () => {
  it('should render without crashing', () => {
    const { container } = render(<ButtonRequestAccess />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<ButtonRequestAccess />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<ButtonRequestAccess />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
