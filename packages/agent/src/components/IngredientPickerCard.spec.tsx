import { IngredientPickerCard } from '@genfeedai/agent/components/IngredientPickerCard';
import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const action: AgentUiAction = {
  id: 'pick-1',
  type: 'ingredient_picker_card',
  title: 'Choose an ingredient',
  ingredients: [
    {
      id: 'video-1',
      type: 'video',
      title: 'Apple video',
      url: 'https://cdn.test/apple.mp4',
      thumbnailUrl: 'https://cdn.test/apple-poster.jpg',
    },
    {
      id: 'image-1',
      type: 'image',
      title: 'Apple image',
      url: 'https://cdn.test/apple.jpg',
    },
  ],
};

describe('IngredientPickerCard', () => {
  it('lays the ingredients out in the shared Library grid, with video posters as images', () => {
    render(<IngredientPickerCard action={action} />);

    const grid = screen.getByRole('listbox', { name: 'Choose an ingredient' });
    expect(
      within(grid).getByRole('option', { name: 'Apple video' }),
    ).toBeInTheDocument();
    expect(
      within(grid).getByRole('option', { name: 'Apple image' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Use this ingredient' }),
    ).not.toBeInTheDocument();
  });

  it('selects through the shared tile, confirms once, and allows changing the selection', () => {
    const onSelect = vi.fn();
    render(<IngredientPickerCard action={action} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('option', { name: 'Apple video' }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('option', { name: 'Apple video' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Use this ingredient' }),
    );
    expect(onSelect).toHaveBeenCalledExactlyOnceWith({
      id: 'video-1',
      title: 'Apple video',
    });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    fireEvent.click(screen.getByRole('option', { name: 'Apple image' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Use this ingredient' }),
    );
    expect(onSelect).toHaveBeenLastCalledWith({
      id: 'image-1',
      title: 'Apple image',
    });
  });
});
