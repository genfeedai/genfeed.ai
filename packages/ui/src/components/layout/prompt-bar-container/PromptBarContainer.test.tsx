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
    const inner = container.querySelector('[data-layout-mode] > div');
    expect(inner?.firstElementChild).toHaveTextContent('banner');
  });

  it('should render an optional top fade scrim when requested', () => {
    const { container } = render(
      <PromptBarContainer showTopFade>
        <div>content</div>
      </PromptBarContainer>,
    );

    const fade = container.querySelector('[aria-hidden="true"]');
    expect(fade).toBeInTheDocument();
    expect(fade?.className).toContain('bottom-full');
    expect(fade?.className).toContain('bg-gradient-to-t');
  });
});
