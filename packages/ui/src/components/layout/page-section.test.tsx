import { render, screen } from '@testing-library/react';
import { PageSection } from '@ui/layout/page-section';
import { describe, expect, it, vi } from 'vitest';

describe('PageSection', () => {
  it('renders title, description, and actions together', () => {
    render(
      <PageSection
        title="Complete Section"
        description="With description"
        actions={<button type="button">Action</button>}
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

  it('preserves default styling with custom className', () => {
    const { container } = render(
      <PageSection className="custom-section">Content</PageSection>,
    );
    const section = container.querySelector('section');
    expect(section).toHaveClass('custom-section');
    expect(section).toHaveClass('space-y-4');
  });

  describe('title rendering', () => {
    it('has correct title styles', () => {
      render(<PageSection title="Title">Content</PageSection>);
      const title = screen.getByRole('heading');
      expect(title).toHaveClass('text-lg');
      expect(title).toHaveClass('font-semibold');
      expect(title).toHaveClass('text-foreground');
    });
  });

  describe('description rendering', () => {
    it('has correct description styles', () => {
      render(<PageSection description="Description">Content</PageSection>);
      const desc = screen.getByText('Description');
      expect(desc).toHaveClass('text-sm');
      expect(desc).toHaveClass('text-foreground/60');
    });
  });

  describe('actions rendering', () => {
    it('renders multiple actions', () => {
      render(
        <PageSection
          actions={
            <>
              <button type="button">Action 1</button>
              <button type="button">Action 2</button>
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
