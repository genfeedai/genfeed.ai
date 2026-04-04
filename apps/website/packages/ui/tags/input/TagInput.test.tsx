import { act, fireEvent, render, screen } from '@testing-library/react';
import TagInput from '@ui/tags/input/TagInput';
import { describe, expect, it, vi } from 'vitest';

describe('TagInput', () => {
  it('should render without crashing', () => {
    const { container } = render(
      <TagInput tags={[]} onAddTag={vi.fn()} onRemoveTag={vi.fn()} />,
    );
    expect(container.firstChild).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Add tags...')).toBeInTheDocument();
  });

  it('should handle user interactions correctly', async () => {
    const onAddTag = vi.fn().mockResolvedValue(undefined);
    render(<TagInput tags={[]} onAddTag={onAddTag} onRemoveTag={vi.fn()} />);
    const input = screen.getByPlaceholderText('Add tags...');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'New Tag' } });
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(onAddTag).toHaveBeenCalledWith('New Tag');
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <TagInput tags={[]} onAddTag={vi.fn()} onRemoveTag={vi.fn()} />,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
    expect(rootElement).toHaveClass('flex');
  });
});
