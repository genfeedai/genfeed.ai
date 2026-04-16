import { render, screen } from '@testing-library/react';
import Container from '@ui/layout/container/Container';
import { describe, expect, it } from 'vitest';

describe('Container', () => {
  it('should render without crashing', () => {
    const { container } = render(<Container>content</Container>);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<Container>content</Container>);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<Container>content</Container>);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });

  it('renders header tabs alongside header actions', () => {
    render(
      <Container
        label="Test"
        headerTabs={{
          activeTab: 'overview',
          fullWidth: false,
          items: [
            { href: '/test', id: 'overview', label: 'Overview' },
            { href: '/test/details', id: 'details', label: 'Details' },
          ],
          variant: 'pills',
        }}
        right={<button type="button">Refresh</button>}
      >
        content
      </Container>,
    );

    expect(screen.getByRole('link', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });
});
