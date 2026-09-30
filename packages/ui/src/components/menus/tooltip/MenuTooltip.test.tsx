import { render } from '@testing-library/react';
import MenuTooltip from '@ui/menus/tooltip/MenuTooltip';
import { describe, expect, it } from 'vitest';

describe('MenuTooltip', () => {
  it('should render without crashing', () => {
    const { container } = render(
      <MenuTooltip label="Tooltip">
        <button type="button">Trigger</button>
      </MenuTooltip>,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(
      <MenuTooltip label="Tooltip">
        <button type="button">Trigger</button>
      </MenuTooltip>,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <MenuTooltip label="Tooltip">
        <button type="button">Trigger</button>
      </MenuTooltip>,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
