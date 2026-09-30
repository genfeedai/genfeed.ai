import { render, screen } from '@testing-library/react';
import MediaCanvasShell from '@ui/shell/media-canvas/MediaCanvasShell';
import { describe, expect, it } from 'vitest';

describe('MediaCanvasShell', () => {
  it('renders the canvas children', () => {
    render(
      <MediaCanvasShell>
        <div data-testid="canvas-content">content</div>
      </MediaCanvasShell>,
    );
    expect(screen.getByTestId('canvas-content')).toBeInTheDocument();
  });

  it('renders the title and meta inside the floating pill', () => {
    render(
      <MediaCanvasShell title="Mood board" meta="showing first 60">
        <div>content</div>
      </MediaCanvasShell>,
    );
    expect(screen.getByText('Mood board')).toBeInTheDocument();
    expect(screen.getByText('showing first 60')).toBeInTheDocument();
  });

  it('renders trailing actions', () => {
    render(
      <MediaCanvasShell
        title="Canvas"
        actions={<button type="button">Close</button>}
      >
        <div>content</div>
      </MediaCanvasShell>,
    );
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('prefers startSlot over the default title pill', () => {
    render(
      <MediaCanvasShell
        title="Ignored title"
        startSlot={<span>Custom leading</span>}
      >
        <div>content</div>
      </MediaCanvasShell>,
    );
    expect(screen.getByText('Custom leading')).toBeInTheDocument();
    expect(screen.queryByText('Ignored title')).not.toBeInTheDocument();
  });

  it('applies the cinematic texture by default and omits it when disabled', () => {
    const { container, rerender } = render(
      <MediaCanvasShell>
        <div>content</div>
      </MediaCanvasShell>,
    );
    expect(container.firstChild).toHaveClass('gen-grain');
    expect(container.firstChild).toHaveClass('gen-vignette');

    rerender(
      <MediaCanvasShell hasTexture={false}>
        <div>content</div>
      </MediaCanvasShell>,
    );
    expect(container.firstChild).not.toHaveClass('gen-grain');
  });

  it('renders the ambient wash only when a colour is supplied', () => {
    const { container, rerender } = render(
      <MediaCanvasShell>
        <div>content</div>
      </MediaCanvasShell>,
    );
    expect(
      container.querySelector('.gen-ambient-wash'),
    ).not.toBeInTheDocument();

    rerender(
      <MediaCanvasShell ambientColor="rgb(10 20 30)">
        <div>content</div>
      </MediaCanvasShell>,
    );
    expect(container.querySelector('.gen-ambient-wash')).toBeInTheDocument();
  });
});
