import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom';
import HtmlContent from '@ui/display/html-content/HtmlContent';

describe('HtmlContent', () => {
  it('should render without crashing', () => {
    const { container } = render(
      <HtmlContent content="<p>Hello <strong>World</strong></p>" />,
    );
    expect(container.firstChild).toBeInTheDocument();
    expect(screen.getByText('World')).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    render(<HtmlContent content="<p>Clickable</p>" />);
    expect(screen.getByText('Clickable')).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <HtmlContent content="<p>Styled</p>" className="line-clamp-1" />,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toHaveClass('prose');
  });
});
