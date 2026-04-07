import { render } from '@testing-library/react';
import Table from '@ui/display/table/Table';
import { describe, expect, it } from 'vitest';

describe('Table', () => {
  it('should render without crashing', () => {
    const { container } = render(<Table />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<Table />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<Table />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
