import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  InputGroup,
  InputGroupAddon,
  inputGroupButtonClassName,
} from './input-group';

describe('InputGroup', () => {
  it('holds an addon and buttons as segments of one control', () => {
    render(
      <InputGroup aria-label="Visibility" data-testid="group">
        <InputGroupAddon>Public</InputGroupAddon>
        <button className={inputGroupButtonClassName} type="button">
          Copy
        </button>
      </InputGroup>,
    );

    const group = screen.getByTestId('group');
    expect(group).toHaveAttribute('aria-label', 'Visibility');
    expect(group).toContainElement(screen.getByText('Public'));
    expect(group).toContainElement(
      screen.getByRole('button', { name: 'Copy' }),
    );
  });

  it('keeps its shared border when a caller adds a class', () => {
    render(<InputGroup className="w-fit" data-testid="group" />);

    const group = screen.getByTestId('group');
    expect(group).toHaveClass('w-fit');
    expect(group).toHaveClass('border');
  });

  it('takes the ring off a button that sits in the group', () => {
    expect(inputGroupButtonClassName).toContain('rounded-none');
  });
});
