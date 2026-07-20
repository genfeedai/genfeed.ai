import { fireEvent, render, screen } from '@testing-library/react';
import ColorPicker from '@ui/primitives/color-picker';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-color', () => ({
  SketchPicker: ({
    color,
    onChange,
  }: {
    color: string;
    onChange: (result: { hex: string }) => void;
  }) => (
    <button
      data-color={color}
      onClick={() => onChange({ hex: '#abcdef' })}
      type="button"
    >
      Choose test color
    </button>
  ),
}));

describe('ColorPicker', () => {
  it('reflects parent color changes without remounting', () => {
    const { rerender } = render(<ColorPicker value="#111111" />);

    rerender(<ColorPicker value="#222222" />);

    expect(
      screen.getByRole('button', {
        name: 'Select color, current: #222222',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('#222222')).toBeInTheDocument();
  });

  it('emits a user-selected color exactly once', () => {
    const onChange = vi.fn();
    render(<ColorPicker value="#111111" onChange={onChange} />);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Select color, current: #111111',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Choose test color' }));

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith('#abcdef');
  });
});
