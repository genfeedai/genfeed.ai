import { render } from '@testing-library/react';
import PromptBarContainer from '@ui/layout/prompt-bar-container/PromptBarContainer';
import { describe, expect, it } from 'vitest';

describe('PromptBarContainer', () => {
  it('should render without crashing', () => {
    const { container } = render(
      <PromptBarContainer>
        <div>content</div>
      </PromptBarContainer>,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should use fixed mode by default', () => {
    const { container } = render(
      <PromptBarContainer>
        <div>content</div>
      </PromptBarContainer>,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement.className).toContain('fixed');
    expect(rootElement.className).toContain('bottom-0');
  });

  it('should support inflow mode', () => {
    const { container } = render(
      <PromptBarContainer layoutMode="inflow">
        <div>content</div>
      </PromptBarContainer>,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement.className).toContain('relative');
    expect(rootElement.className).toContain('w-full');
  });

  it('should support inflow desktop mode', () => {
    const { container } = render(
      <PromptBarContainer layoutMode="inflow-desktop">
        <div>content</div>
      </PromptBarContainer>,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement.className).toContain('fixed');
    expect(rootElement.className).toContain('md:static');
  });

  it('should support surface-fixed mode', () => {
    const { container } = render(
      <div className="relative">
        <PromptBarContainer layoutMode="surface-fixed" maxWidth="full">
          <div>content</div>
        </PromptBarContainer>
      </div>,
    );
    const rootElement = container.querySelector(
      '[data-layout-mode="surface-fixed"]',
    ) as HTMLElement;
    expect(rootElement.className).toContain('absolute');
    expect(rootElement.className).toContain('bottom-0');
    expect(rootElement.dataset.maxWidth).toBe('full');
  });

  it('should render top content above children', () => {
    const { container, getByText } = render(
      <PromptBarContainer topContent={<div>banner</div>}>
        <div>content</div>
      </PromptBarContainer>,
    );

    expect(getByText('banner')).toBeInTheDocument();
    expect(getByText('content')).toBeInTheDocument();
    const inner = container.querySelector('[data-composer-stack]');
    expect(inner?.firstElementChild).toHaveTextContent('banner');
  });

  it('docks top cards flush against the prompt bar at full width', () => {
    const { container } = render(
      <PromptBarContainer topContent={<div>banner</div>}>
        <div>content</div>
      </PromptBarContainer>,
    );

    const inner = container.querySelector('[data-composer-stack]');
    expect(inner?.className).toContain('gap-0');
    expect(inner?.className).not.toContain('gap-2');

    const topStack = container.querySelector('[data-composer-top-stack]');
    expect(topStack).toHaveClass('w-full');
    expect(topStack).not.toHaveClass('w-[90%]');
    expect(topStack).toHaveTextContent('banner');
  });

  it('leaves the prompt slot transparent so the glass surface can sample the canvas', () => {
    const { container } = render(
      <PromptBarContainer>
        <div>content</div>
      </PromptBarContainer>,
    );

    const block = container.querySelector('[data-composer-bg-block]');
    expect(block).not.toBeInTheDocument();
  });

  it('does not insert opaque blocks between attached content and the prompt bar', () => {
    const { container } = render(
      <PromptBarContainer topContent={<div>banner</div>}>
        <div>content</div>
      </PromptBarContainer>,
    );

    expect(
      container.querySelector('[data-layout-mode] > [data-composer-bg-block]'),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-composer-prompt-slot] > [data-composer-bg-block]',
      ),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-composer-top-stack] [data-composer-bg-block]',
      ),
    ).toBeNull();
  });

  it('should render an optional top fade scrim when requested', () => {
    const { container } = render(
      <PromptBarContainer showTopFade>
        <div>content</div>
      </PromptBarContainer>,
    );

    const fade = container.querySelector('[data-composer-top-fade]');
    expect(fade).toBeInTheDocument();
    expect(fade?.className).toContain('bottom-full');
    expect(fade?.className).toContain('bg-gradient-to-t');
    expect(fade?.className).toContain('from-background');
    expect(fade?.className).toContain('to-transparent');
    expect(fade?.className).not.toContain('h-28');
    expect(fade?.className).not.toContain('via-background/55');
  });

  it('does not paint a dark block below the prompt', () => {
    const { container } = render(
      <PromptBarContainer showTopFade>
        <div>content</div>
      </PromptBarContainer>,
    );

    const scrim = container.querySelector('[data-composer-bottom-scrim]');
    expect(scrim).not.toBeInTheDocument();
  });
});
