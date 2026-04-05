import { render, screen } from '@testing-library/react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@ui/primitives/card';
import { describe, expect, it, vi } from 'vitest';

describe('Card', () => {
  const renderBasicCard = () => {
    return render(
      <Card>
        <CardHeader>
          <CardTitle>Card Title</CardTitle>
          <CardDescription>Card description text</CardDescription>
        </CardHeader>
        <CardContent>Card body content</CardContent>
        <CardFooter>Card footer content</CardFooter>
      </Card>,
    );
  };

  describe('Card Root', () => {
    it('renders without crashing', () => {
      render(<Card>Card content</Card>);
      expect(screen.getByText('Card content')).toBeInTheDocument();
    });

    it('renders children content', () => {
      renderBasicCard();
      expect(screen.getByText('Card Title')).toBeInTheDocument();
      expect(screen.getByText('Card description text')).toBeInTheDocument();
      expect(screen.getByText('Card body content')).toBeInTheDocument();
      expect(screen.getByText('Card footer content')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const { container } = render(
        <Card className="custom-card">Content</Card>,
      );
      const card = container.firstChild;
      expect(card).toHaveClass('custom-card');
    });

    it('preserves default styling with custom className', () => {
      const { container } = render(
        <Card className="custom-card">Content</Card>,
      );
      const card = container.firstChild;
      expect(card).toHaveClass('custom-card');
      expect(card).toHaveClass('transition-all');
    });

    it('has default card styles', () => {
      const { container } = render(<Card>Content</Card>);
      const card = container.firstChild;
      expect(card).toHaveClass('bg-card');
      expect(card).toHaveClass('text-card-foreground');
    });
  });

  describe('CardHeader', () => {
    it('renders header content', () => {
      renderBasicCard();
      expect(screen.getByText('Card Title')).toBeInTheDocument();
      expect(screen.getByText('Card description text')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const { container } = render(
        <Card>
          <CardHeader className="custom-header">Header</CardHeader>
        </Card>,
      );
      const header = container.querySelector('.custom-header');
      expect(header).toBeInTheDocument();
      expect(header).toHaveTextContent('Header');
    });

    it('has default header styles', () => {
      const { container } = render(
        <Card>
          <CardHeader data-testid="header">Header</CardHeader>
        </Card>,
      );
      const header = container.querySelector('[data-testid="header"]');
      expect(header).toHaveClass('flex');
      expect(header).toHaveClass('flex-col');
    });

    it('renders multiple children', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>Title</CardTitle>
            <CardDescription>Description</CardDescription>
          </CardHeader>
        </Card>,
      );
      expect(screen.getByText('Title')).toBeInTheDocument();
      expect(screen.getByText('Description')).toBeInTheDocument();
    });
  });

  describe('CardTitle', () => {
    it('renders title text', () => {
      renderBasicCard();
      expect(screen.getByText('Card Title')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle className="custom-title">Custom Title</CardTitle>
          </CardHeader>
        </Card>,
      );
      const title = screen.getByText('Custom Title');
      expect(title).toHaveClass('custom-title');
    });

    it('has default title styles', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>Title</CardTitle>
          </CardHeader>
        </Card>,
      );
      const title = screen.getByText('Title');
      expect(title).toHaveClass('font-semibold');
    });

    it('renders as heading element', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>Heading Title</CardTitle>
          </CardHeader>
        </Card>,
      );
      const title = screen.getByText('Heading Title');
      expect(title.tagName).toBe('H3');
    });
  });

  describe('CardDescription', () => {
    it('renders description text', () => {
      renderBasicCard();
      expect(screen.getByText('Card description text')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(
        <Card>
          <CardHeader>
            <CardDescription className="custom-desc">
              Custom Description
            </CardDescription>
          </CardHeader>
        </Card>,
      );
      const desc = screen.getByText('Custom Description');
      expect(desc).toHaveClass('custom-desc');
    });

    it('has default description styles', () => {
      render(
        <Card>
          <CardHeader>
            <CardDescription>Description</CardDescription>
          </CardHeader>
        </Card>,
      );
      const desc = screen.getByText('Description');
      expect(desc).toHaveClass('text-sm');
      expect(desc).toHaveClass('text-muted-foreground');
    });

    it('renders as paragraph element', () => {
      render(
        <Card>
          <CardHeader>
            <CardDescription>Paragraph Description</CardDescription>
          </CardHeader>
        </Card>,
      );
      const desc = screen.getByText('Paragraph Description');
      expect(desc.tagName).toBe('P');
    });
  });

  describe('CardContent', () => {
    it('renders content text', () => {
      renderBasicCard();
      expect(screen.getByText('Card body content')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const { container } = render(
        <Card>
          <CardContent className="custom-content">Content</CardContent>
        </Card>,
      );
      const content = container.querySelector('.custom-content');
      expect(content).toBeInTheDocument();
      expect(content).toHaveTextContent('Content');
    });

    it('has default content styles', () => {
      const { container } = render(
        <Card>
          <CardContent data-testid="content">Content</CardContent>
        </Card>,
      );
      const content = container.querySelector('[data-testid="content"]');
      expect(content).toHaveClass('p-6');
    });

    it('renders complex content', () => {
      render(
        <Card>
          <CardContent>
            <div data-testid="complex-content">
              <p>Paragraph 1</p>
              <p>Paragraph 2</p>
            </div>
          </CardContent>
        </Card>,
      );
      expect(screen.getByTestId('complex-content')).toBeInTheDocument();
      expect(screen.getByText('Paragraph 1')).toBeInTheDocument();
      expect(screen.getByText('Paragraph 2')).toBeInTheDocument();
    });
  });

  describe('CardFooter', () => {
    it('renders footer content', () => {
      renderBasicCard();
      expect(screen.getByText('Card footer content')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const { container } = render(
        <Card>
          <CardFooter className="custom-footer">Footer</CardFooter>
        </Card>,
      );
      const footer = container.querySelector('.custom-footer');
      expect(footer).toBeInTheDocument();
      expect(footer).toHaveTextContent('Footer');
    });

    it('has default footer styles', () => {
      const { container } = render(
        <Card>
          <CardFooter data-testid="footer">Footer</CardFooter>
        </Card>,
      );
      const footer = container.querySelector('[data-testid="footer"]');
      expect(footer).toHaveClass('flex');
      expect(footer).toHaveClass('items-center');
    });

    it('renders action buttons', () => {
      render(
        <Card>
          <CardFooter>
            <button>Cancel</button>
            <button>Submit</button>
          </CardFooter>
        </Card>,
      );
      expect(
        screen.getByRole('button', { name: 'Cancel' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Submit' }),
      ).toBeInTheDocument();
    });
  });

  describe('HTML attributes', () => {
    it('forwards id attribute to Card', () => {
      const { container } = render(<Card id="my-card">Content</Card>);
      const card = container.firstChild;
      expect(card).toHaveAttribute('id', 'my-card');
    });

    it('forwards data attributes to Card', () => {
      const { container } = render(
        <Card data-testid="custom-card">Content</Card>,
      );
      expect(screen.getByTestId('custom-card')).toBeInTheDocument();
    });

    it('forwards aria attributes to Card', () => {
      const { container } = render(
        <Card aria-label="Information card">Content</Card>,
      );
      const card = container.firstChild;
      expect(card).toHaveAttribute('aria-label', 'Information card');
    });
  });

  describe('composition', () => {
    it('renders all components together', () => {
      renderBasicCard();
      expect(screen.getByText('Card Title')).toBeInTheDocument();
      expect(screen.getByText('Card description text')).toBeInTheDocument();
      expect(screen.getByText('Card body content')).toBeInTheDocument();
      expect(screen.getByText('Card footer content')).toBeInTheDocument();
    });

    it('works without header', () => {
      render(
        <Card>
          <CardContent>Content only</CardContent>
        </Card>,
      );
      expect(screen.getByText('Content only')).toBeInTheDocument();
    });

    it('works without footer', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>Title</CardTitle>
          </CardHeader>
          <CardContent>Content</CardContent>
        </Card>,
      );
      expect(screen.getByText('Title')).toBeInTheDocument();
      expect(screen.getByText('Content')).toBeInTheDocument();
    });

    it('works with minimal structure', () => {
      render(<Card>Simple card</Card>);
      expect(screen.getByText('Simple card')).toBeInTheDocument();
    });
  });

  describe('styling', () => {
    it('has transition styles', () => {
      const { container } = render(<Card>Content</Card>);
      const card = container.firstChild;
      expect(card).toHaveClass('transition-all');
    });

    it('has duration styles', () => {
      const { container } = render(<Card>Content</Card>);
      const card = container.firstChild;
      expect(card).toHaveClass('duration-300');
    });
  });

  describe('ref forwarding', () => {
    it('forwards ref to card element', () => {
      const ref = vi.fn();
      render(<Card ref={ref}>Content</Card>);

      expect(ref).toHaveBeenCalled();
      const callArg = ref.mock.calls[0][0];
      expect(callArg).toBeInstanceOf(HTMLDivElement);
    });
  });
});
