import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
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

  // Callers pass stored post and article content straight through, so the
  // component sanitizes rather than trusting each call site to remember.
  it('should sanitize the content before parsing it into elements', () => {
    const { container } = render(
      <HtmlContent content='<p>Safe</p><img src="x" onerror="alert(1)"><iframe src="https://evil.example"></iframe>' />,
    );

    expect(screen.getByText('Safe')).toBeInTheDocument();
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('img')?.getAttribute('onerror')).toBeNull();
  });

  it('should drop a javascript: link while keeping its text', () => {
    const { container } = render(
      <HtmlContent content='<a href="javascript:alert(1)">click</a>' />,
    );

    expect(screen.getByText('click')).toBeInTheDocument();
    expect(container.querySelector('a')?.getAttribute('href')).toBeNull();
  });
});
