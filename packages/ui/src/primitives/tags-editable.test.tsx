import { fireEvent, render, screen } from '@testing-library/react';
import TagsEditable from '@ui/primitives/tags-editable';
import { describe, expect, it, vi } from 'vitest';

describe('TagsEditable', () => {
  it('reflects parent tag changes without remounting', () => {
    const { rerender } = render(
      <TagsEditable label="Topics" value={['alpha']} />,
    );

    rerender(<TagsEditable label="Topics" value={['beta']} />);

    expect(screen.getByText('beta')).toBeInTheDocument();
    expect(screen.queryByText('alpha')).not.toBeInTheDocument();
  });

  it('saves a user-added tag exactly once', () => {
    const onSave = vi.fn();
    render(<TagsEditable label="Topics" value={['alpha']} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit tags' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Add tag' }), {
      target: { value: 'beta' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add tag' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save tags' }));

    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledWith(['alpha', 'beta']);
  });
});
