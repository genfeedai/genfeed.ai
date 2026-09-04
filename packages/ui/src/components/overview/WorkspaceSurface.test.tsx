import { render, screen } from '@testing-library/react';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { describe, expect, it } from 'vitest';

function body(container: HTMLElement): Element | null {
  return container.querySelector('[data-slot="workspace-surface-body"]');
}

describe('WorkspaceSurface', () => {
  it('renders framed surface styling by default', () => {
    const { container } = render(<WorkspaceSurface>Body</WorkspaceSurface>);
    expect(body(container)).toHaveClass('rounded-card');
    expect(body(container)).toHaveClass('bg-card');
    expect(body(container)).toHaveClass('shadow-border');
  });

  it('renders eyebrow, title, description, and actions on a title row', () => {
    const { container } = render(
      <WorkspaceSurface
        eyebrow="Operations"
        title="Recent Runs"
        description="Latest agent work across the workspace."
        actions={<button type="button">View all</button>}
      >
        Body
      </WorkspaceSurface>,
    );

    expect(screen.getByText('Operations')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Recent Runs' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Latest agent work across the workspace.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'View all' }),
    ).toBeInTheDocument();
    // Actions share a one-line title row (items-start + flex-nowrap), not a
    // stacked/centered column under the description.
    expect(container.querySelector('.flex-nowrap')).toBeInTheDocument();
    expect(container.querySelector('.items-start')).toBeInTheDocument();
  });

  it('supports muted tone and compact density', () => {
    const { container } = render(
      <WorkspaceSurface tone="muted" density="compact">
        Body
      </WorkspaceSurface>,
    );

    const section = body(container);
    expect(section).toHaveClass('bg-card');
    expect(section).toHaveClass('rounded-card');
    expect(section).toHaveClass('shadow-border');
    expect(container.querySelector('.px-4')).toBeInTheDocument();
  });

  it('renders the header outside the framed body', () => {
    const { container } = render(
      <WorkspaceSurface title="Recent Runs">Body</WorkspaceSurface>,
    );

    const heading = screen.getByRole('heading', { name: 'Recent Runs' });
    expect(body(container)).not.toContainElement(heading);
    expect(body(container)).toHaveTextContent('Body');
  });

  it('drops body padding when flush', () => {
    const { container } = render(
      <WorkspaceSurface density="compact" flush>
        Body
      </WorkspaceSurface>,
    );

    expect(body(container)).toHaveClass('overflow-hidden');
    expect(body(container)).not.toHaveClass('px-4');
    expect(body(container)).toHaveClass('rounded-card');
  });

  it('renders the canonical dashboard card surface for the card tone', () => {
    const { container } = render(
      <WorkspaceSurface tone="card">Body</WorkspaceSurface>,
    );

    const section = body(container);
    expect(section).toHaveClass('bg-card');
    expect(section).toHaveClass('shadow-border');
    expect(section).toHaveClass('rounded-card');
    expect(section).not.toHaveClass('rounded-md');
  });

  it('uses the canonical frame treatment for every non-elevated tone', () => {
    for (const tone of ['default', 'muted', 'card'] as const) {
      const { container, unmount } = render(
        <WorkspaceSurface tone={tone}>Body</WorkspaceSurface>,
      );

      const section = body(container);
      expect(section).toHaveClass('bg-card');
      expect(section).toHaveClass('rounded-card');
      expect(section).toHaveClass('shadow-border');
      expect(section).not.toHaveClass('rounded-md');
      unmount();
    }
  });

  it('keeps elevated tone on the same frame with stronger containment', () => {
    const { container } = render(
      <WorkspaceSurface tone="elevated">Body</WorkspaceSurface>,
    );

    const section = body(container);
    expect(section).toHaveClass('bg-card');
    expect(section).toHaveClass('rounded-card');
    expect(section).toHaveClass('shadow-border-strong');
    expect(section).not.toHaveClass('rounded-md');
  });

  it('does not render legacy rounded treatment for any tone', () => {
    for (const tone of ['default', 'muted', 'elevated'] as const) {
      const { container, unmount } = render(
        <WorkspaceSurface tone={tone}>Body</WorkspaceSurface>,
      );

      const section = body(container);
      expect(section).toHaveClass('rounded-card');
      expect(section).not.toHaveClass('rounded-md');
      unmount();
    }
  });

  it('can render without a frame', () => {
    const { container } = render(
      <WorkspaceSurface framed={false}>Body</WorkspaceSurface>,
    );
    expect(body(container)).toHaveClass('border-0');
    expect(body(container)).toHaveClass('bg-transparent');
  });
});
