import '@agent-tests/media-preview-mocks';
import { IngredientPickerCard } from '@genfeedai/agent/components/IngredientPickerCard';
import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { fireEvent, render, screen } from '@testing-library/react';
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
  it('uses shared media tiles and keeps video sources separate from image posters', () => {
    const { container } = render(<IngredientPickerCard action={action} />);

    expect(screen.getByTestId('masonry-video')).toHaveAttribute(
      'data-url',
      'https://cdn.test/apple.mp4',
    );
    expect(screen.getByTestId('masonry-image')).toHaveAttribute(
      'data-url',
      'https://cdn.test/apple.jpg',
    );
    expect(container.querySelector('button button')).toBeNull();
  });

  it('selects through the shared tile, confirms once, and allows changing the selection', () => {
    const onSelect = vi.fn();
    render(<IngredientPickerCard action={action} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('button', { name: 'Apple video' }));
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Use this ingredient' }),
    );
    expect(onSelect).toHaveBeenCalledExactlyOnceWith({
      id: 'video-1',
      title: 'Apple video',
    });
    expect(screen.queryByTestId('masonry-video')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apple image' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Use this ingredient' }),
    );
    expect(onSelect).toHaveBeenLastCalledWith({
      id: 'image-1',
      title: 'Apple image',
    });
  });
});
