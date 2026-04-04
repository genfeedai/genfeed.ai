import { fireEvent, render, screen } from '@testing-library/react';
import ListRowSound from '@ui/lists/row-sound/ListRowSound';
import { describe, expect, it, vi } from 'vitest';

const mockIngredient = {
  id: 'test-id',
  isPlaying: false,
  metadata: {
    description: 'A test sound description',
    label: 'Test Sound',
  },
  provider: 'elevenlabs',
};

describe('ListRowSound', () => {
  it('renders legacy ingredient content without crashing', () => {
    const { container } = render(
      <ListRowSound ingredient={mockIngredient} index={0} />,
    );
    expect(container.firstChild).toBeInTheDocument();
    expect(screen.getByText('Test Sound')).toBeInTheDocument();
  });

  it('handles legacy row click interactions', () => {
    const mockOnClick = vi.fn();
    const mockOnPlay = vi.fn();
    const { container } = render(
      <ListRowSound
        ingredient={mockIngredient}
        index={0}
        onClick={mockOnClick}
        onPlay={mockOnPlay}
      />,
    );
    const listItem = container.firstChild as HTMLElement;
    fireEvent.click(listItem);
    expect(mockOnClick).toHaveBeenCalledWith('test-id');
  });

  it('renders slot-based content and active state', () => {
    const { container } = render(
      <ListRowSound
        actions={<button type="button">Action</button>}
        badges={<span>Catalog</span>}
        isActive={true}
        metaPrimary="English"
        stats="12K"
        subtitle="Narration"
        title="Rachel"
      />,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
    expect(rootElement.className).toContain('bg-white/[0.06]');
    expect(screen.getByText('Rachel')).toBeInTheDocument();
    expect(screen.getByText('Narration')).toBeInTheDocument();
    expect(screen.getByText('Action')).toBeInTheDocument();
  });
});
