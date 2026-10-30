import { render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import InsetSurface from './InsetSurface';

describe('InsetSurface', () => {
  it('renders the default shared inset surface treatment', () => {
    const { container } = render(<InsetSurface>Body</InsetSurface>);
    const surface = container.firstElementChild;

    expect(surface).toHaveClass('rounded-2xl');
    expect(surface).toHaveClass('shadow-border');
    expect(surface).toHaveClass('bg-foreground/5');
    expect(surface).not.toHaveClass('bg-white/5');
    expect(surface).toHaveTextContent('Body');
  });

  it('supports tone and density variants', () => {
    const { container } = render(
      <InsetSurface density="compact" tone="contrast">
        Preview
      </InsetSurface>,
    );
    const surface = container.firstElementChild;

    expect(surface).toHaveClass('p-3');
    expect(surface).toHaveClass('bg-card');
    expect(surface).not.toHaveClass('bg-black/20');
  });
});
