import { render, screen } from '@testing-library/react';
import { PageSection } from '@ui/layout/page-section';
import { describe, expect, it, vi } from 'vitest';

describe('PageSection', () => {
  it('renders without crashing', () => {
    render(<PageSection>Content</PageSection>);
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('renders children content', () => {
    render(<PageSection>Section content here</PageSection>);
    expect(screen.getByText('Section content here')).toBeInTheDocument();
  });

  it('renders as section element', () => {
    const { container } = render(<PageSection>Content</PageSection>);
    expect(container.querySelector('section')).toBeInTheDocument();
  });

  it('renders title when provided', () => {
    render(<PageSection title="Section Title">Content</PageSection>);
    expect(
      screen.getByRole('heading', { name: 'Section Title' }),
    ).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(
      <PageSection title="Title" description="Section description">
        Content
      </PageSection>,
    );
    expect(screen.getByText('Section description')).toBeInTheDocument();
  });

  it('renders actions when provided', () => {
    render(
      <PageSection actions={<button>Action Button</button>}>
        Content
      </PageSection>,
    );
    expect(
      screen.getByRole('button', { name: 'Action Button' }),
    ).toBeInTheDocument();
  });

  it('renders title, description, and actions together', () => {
    render(
      <PageSection
        title="Complete Section"
        description="With description"
        actions={<button>Action</button>}
      >
        Content
      </PageSection>,
    );

    expect(
      screen.getByRole('heading', { name: 'Complete Section' }),
    ).toBeInTheDocument();
    expect(screen.getByText('With description')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <PageSection className="custom-section">Content</PageSection>,
    );
    expect(container.querySelector('section')).toHaveClass('custom-section');
  });

  it('preserves default styling with custom className', () => {
    const { container } = render(
      <PageSection className="custom-section">Content</PageSection>,
    );
    const section = container.querySelector('section');
    expect(section).toHaveClass('custom-section');
    expect(section).toHaveClass('space-y-4');
  });

  describe('title rendering', () => {
    it('renders string title', () => {
      render(<PageSection title="String Title">Content</PageSection>);
      expect(screen.getByRole('heading')).toHaveTextContent('String Title');
    });

    it('renders ReactNode title', () => {
      render(
        <PageSection
          title={<span data-testid="custom-title">Custom Title</span>}
        >
          Content
        </PageSection>,
      );
      expect(screen.getByTestId('custom-title')).toBeInTheDocument();
    });

    it('title renders as h3', () => {
      render(<PageSection title="Title">Content</PageSection>);
      const title = screen.getByRole('heading');
      expect(title.tagName).toBe('H3');
    });

    it('has correct title styles', () => {
      render(<PageSection title="Title">Content</PageSection>);
      const title = screen.getByRole('heading');
      expect(title).toHaveClass('text-lg');
      expect(title).toHaveClass('font-semibold');
      expect(title).toHaveClass('text-foreground');
    });
  });

  describe('description rendering', () => {
    it('renders string description', () => {
      render(
        <PageSection description="String description">Content</PageSection>,
      );
      expect(screen.getByText('String description')).toBeInTheDocument();
    });

    it('renders ReactNode description', () => {
      render(
        <PageSection
          description={
            <span data-testid="custom-desc">Custom Description</span>
          }
        >
          Content
        </PageSection>,
      );
      expect(screen.getByTestId('custom-desc')).toBeInTheDocument();
    });

    it('description renders as paragraph', () => {
      render(<PageSection description="Description">Content</PageSection>);
      const desc = screen.getByText('Description');
      expect(desc.tagName).toBe('P');
    });

    it('has correct description styles', () => {
      render(<PageSection description="Description">Content</PageSection>);
      const desc = screen.getByText('Description');
      expect(desc).toHaveClass('text-sm');
      expect(desc).toHaveClass('text-foreground/60');
    });
  });

  describe('actions rendering', () => {
    it('renders single action', () => {
      render(
        <PageSection actions={<button>Single Action</button>}>
          Content
        </PageSection>,
      );
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('renders multiple actions', () => {
      render(
        <PageSection
          actions={
            <>
              <button>Action 1</button>
              <button>Action 2</button>
            </>
          }
        >
          Content
        </PageSection>,
      );
      expect(
        screen.getByRole('button', { name: 'Action 1' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Action 2' }),
      ).toBeInTheDocument();
    });
  });

  describe('header rendering', () => {
    it('does not render header when no title, description, or actions', () => {
      const { container } = render(<PageSection>Content only</PageSection>);
      const headers = container.querySelectorAll('.flex.flex-wrap');
      expect(headers.length).toBe(0);
    });

    it('renders header when title is provided', () => {
      const { container } = render(
        <PageSection title="Title">Content</PageSection>,
      );
      const header = container.querySelector('.flex.flex-wrap');
      expect(header).toBeInTheDocument();
    });

    it('renders header when description is provided', () => {
      const { container } = render(
        <PageSection description="Description">Content</PageSection>,
      );
      const header = container.querySelector('.flex.flex-wrap');
      expect(header).toBeInTheDocument();
    });

    it('renders header when actions are provided', () => {
      const { container } = render(
        <PageSection actions={<button>Action</button>}>Content</PageSection>,
      );
      const header = container.querySelector('.flex.flex-wrap');
      expect(header).toBeInTheDocument();
    });
  });

  describe('HTML attributes', () => {
    it('forwards id attribute', () => {
      const { container } = render(
        <PageSection id="custom-section">Content</PageSection>,
      );
      expect(container.querySelector('section')).toHaveAttribute(
        'id',
        'custom-section',
      );
    });

    it('forwards data attributes', () => {
      render(<PageSection data-testid="custom-section">Content</PageSection>);
      expect(screen.getByTestId('custom-section')).toBeInTheDocument();
    });

    it('forwards aria attributes', () => {
      const { container } = render(
        <PageSection aria-label="Main section">Content</PageSection>,
      );
      expect(container.querySelector('section')).toHaveAttribute(
        'aria-label',
        'Main section',
      );
    });
  });

  describe('ref forwarding', () => {
    it('forwards ref to section element', () => {
      const ref = vi.fn();
      render(<PageSection ref={ref}>Content</PageSection>);

      expect(ref).toHaveBeenCalled();
      const callArg = ref.mock.calls[0][0];
      expect(callArg).toBeInstanceOf(HTMLElement);
      expect(callArg.tagName).toBe('SECTION');
    });
  });

  describe('styling', () => {
    it('has default spacing', () => {
      const { container } = render(<PageSection>Content</PageSection>);
      expect(container.querySelector('section')).toHaveClass('space-y-4');
    });

    it('header has flex layout', () => {
      const { container } = render(
        <PageSection title="Title">Content</PageSection>,
      );
      const header = container.querySelector('.flex.flex-wrap');
      expect(header).toHaveClass('items-start');
      expect(header).toHaveClass('justify-between');
    });
  });
});
