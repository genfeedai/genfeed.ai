import { render } from '@testing-library/react';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import { describe, expect, it } from 'vitest';

describe('SimpleTooltip', () => {
  it('should render without crashing', () => {
    const { container } = render(
      <SimpleTooltip label="Test tooltip">
        <button>Hover me</button>
      </SimpleTooltip>,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should render children element', () => {
    const { container } = render(
      <SimpleTooltip label="Test tooltip">
        <button>Hover me</button>
      </SimpleTooltip>,
    );
    const button = container.querySelector('button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Hover me');
  });

  it('should render only children when disabled', () => {
    const { container } = render(
      <SimpleTooltip label="Test tooltip" isDisabled>
        <button>Hover me</button>
      </SimpleTooltip>,
    );
    const button = container.querySelector('button');
    expect(button).toBeInTheDocument();
  });

  it('should render only children when label is empty', () => {
    const { container } = render(
      <SimpleTooltip label="">
        <button>Hover me</button>
      </SimpleTooltip>,
    );
    const button = container.querySelector('button');
    expect(button).toBeInTheDocument();
  });
});
