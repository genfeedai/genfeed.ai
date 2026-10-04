import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LibraryTagChip from './LibraryTagChip';

describe('LibraryTagChip', () => {
  it('shows the label as text with the chosen colors', () => {
    render(
      <LibraryTagChip
        tag={{
          backgroundColor: '#000000',
          id: 't1',
          label: 'S1E12',
          textColor: '#ffffff',
        }}
      />,
    );

    const chip = screen.getByText('S1E12').parentElement;
    expect(chip).toHaveStyle({
      backgroundColor: 'rgb(0, 0, 0)',
      color: 'rgb(255, 255, 255)',
    });
  });

  it('keeps the text readable on a background it was not chosen for', () => {
    render(
      <LibraryTagChip
        tag={{
          backgroundColor: '#ffff00',
          id: 't1',
          label: 'Mood',
          textColor: '#ffffff',
        }}
      />,
    );

    expect(screen.getByText('Mood').parentElement).toHaveStyle({
      color: 'rgb(0, 0, 0)',
    });
  });

  it('falls back to the theme surface for a color it cannot read', () => {
    render(
      <LibraryTagChip
        tag={{ backgroundColor: 'teal', id: 't1', label: 'Odd' }}
      />,
    );

    const chip = screen.getByText('Odd').parentElement;
    expect(chip).toHaveClass('bg-foreground/10');
    expect(chip?.getAttribute('style')).toBeNull();
  });

  it('has no remove control unless asked for', () => {
    render(<LibraryTagChip tag={{ id: 't1', label: 'Plain' } as never} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('removes the tag from a keyboard-operable button', () => {
    const onRemove = vi.fn();
    const tag = { id: 't1', label: 'Launch' };

    render(
      <LibraryTagChip
        onRemove={onRemove}
        removeLabel="Remove tag Launch"
        tag={tag as never}
      />,
    );

    const button = screen.getByRole('button', { name: 'Remove tag Launch' });
    expect(button.tagName).toBe('BUTTON');
    fireEvent.click(button);

    expect(onRemove).toHaveBeenCalledWith(tag);
  });
});
