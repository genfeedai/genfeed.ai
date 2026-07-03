import { render, screen } from '@testing-library/react';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { describe, expect, it } from 'vitest';

describe('WorkspaceSurface', () => {
  it('renders framed surface styling by default', () => {
    const { container } = render(<WorkspaceSurface>Body</WorkspaceSurface>);
    expect(container.querySelector('section')).toHaveClass('rounded');
    expect(container.querySelector('section')).toHaveClass('ship-ui');
    expect(container.querySelector('section')).toHaveClass('gen-shell-panel');
  });

  it('renders eyebrow, title, and actions', () => {
    render(
      <WorkspaceSurface
        eyebrow="Operations"
        title="Recent Runs"
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
      screen.getByRole('button', { name: 'View all' }),
    ).toBeInTheDocument();
  });

  it('supports muted tone and compact density', () => {
    const { container } = render(
      <WorkspaceSurface tone="muted" density="compact">
        Body
      </WorkspaceSurface>,
    );

    const section = container.querySelector('section');
    expect(section).toHaveClass('ship-ui');
    expect(section).toHaveClass('gen-shell-panel');
    expect(container.querySelector('.px-4')).toBeInTheDocument();
  });

  it('renders the canonical dashboard card surface for the card tone', () => {
    const { container } = render(
      <WorkspaceSurface tone="card">Body</WorkspaceSurface>,
    );

    const section = container.querySelector('section');
    expect(section).toHaveClass('bg-card');
    expect(section).toHaveClass('shadow-border');
    expect(section).toHaveClass('rounded-card');
    expect(section).not.toHaveClass('gen-shell-panel');
  });

  it('does not change the shell-panel treatment of existing tones', () => {
    for (const tone of ['default', 'muted', 'elevated'] as const) {
      const { container, unmount } = render(
        <WorkspaceSurface tone={tone}>Body</WorkspaceSurface>,
      );

      const section = container.querySelector('section');
      expect(section).toHaveClass('gen-shell-panel');
      expect(section).not.toHaveClass('bg-card');
      unmount();
    }
  });

  it('can render without a frame', () => {
    const { container } = render(
      <WorkspaceSurface framed={false}>Body</WorkspaceSurface>,
    );
    expect(container.querySelector('section')).toHaveClass('ship-ui');
    expect(container.querySelector('section')).toHaveClass('border-0');
    expect(container.querySelector('section')).toHaveClass('bg-transparent');
  });
});
