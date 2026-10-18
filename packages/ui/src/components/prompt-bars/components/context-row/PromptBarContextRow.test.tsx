import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import PromptBarContextRow from '@ui/prompt-bars/components/context-row/PromptBarContextRow';
import { describe, expect, it, vi } from 'vitest';

const fitMocks = vi.hoisted(() => ({ isCompact: false }));

vi.mock(
  '@hooks/prompt-bar/use-prompt-bar-row-fit/use-prompt-bar-row-fit',
  () => ({
    usePromptBarRowFit: () => ({ isCompact: fitMocks.isCompact }),
  }),
);

describe('PromptBarContextRow', () => {
  it('renders nothing when every group is empty', () => {
    const { container } = render(
      <PromptBarContextRow
        ariaLabel="Suggestions"
        groups={[{ id: 'presets', items: [] }]}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('runs presets and a labelled group on one row and selects or removes chips', () => {
    fitMocks.isCompact = false;
    const onSelect = vi.fn();
    const onRemove = vi.fn();
    render(
      <PromptBarContextRow
        ariaLabel="Suggestions"
        groups={[
          {
            id: 'presets',
            items: [
              {
                id: 'pinned',
                label: 'Banner',
                onRemove,
                onSelect: vi.fn(),
                removeLabel: 'Unpin preset',
              },
              {
                ariaLabel: 'Apply preset Profile picture',
                icon: <span>i</span>,
                id: 'profile',
                label: 'Profile picture',
                onSelect,
              },
            ],
          },
          {
            id: 'recent',
            items: [
              {
                id: 'r1',
                isIconOnly: true,
                label: 'Coastal shoot',
                onSelect: vi.fn(),
                thumbnailUrl: 'https://cdn.example.com/a.jpg',
              },
            ],
            label: 'More like',
          },
        ]}
      />,
    );

    const row = screen.getByRole('toolbar', { name: 'Suggestions' });
    expect(row).toHaveClass('flex-nowrap');
    expect(screen.getByText('More like')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Coastal shoot' }),
    ).toHaveAttribute('title', 'Coastal shoot');

    fireEvent.click(
      screen.getByRole('button', { name: 'Apply preset Profile picture' }),
    );
    expect(onSelect).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Unpin preset' }));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it('drops labels of chips with a glyph and the group lead-in when compact', () => {
    fitMocks.isCompact = true;
    render(
      <PromptBarContextRow
        ariaLabel="Suggestions"
        groups={[
          {
            id: 'actions',
            items: [
              {
                icon: <span>i</span>,
                id: 'animate',
                label: 'Animate',
                onSelect: vi.fn(),
              },
              { id: 'plain', label: 'Plain', onSelect: vi.fn() },
            ],
            label: 'Actions',
          },
        ]}
      />,
    );

    expect(screen.queryByText('Actions')).toBeNull();
    expect(screen.queryByText('Animate')).toBeNull();
    expect(screen.getByRole('button', { name: 'Animate' })).toHaveAttribute(
      'title',
      'Animate',
    );
    expect(screen.getByText('Plain')).toBeInTheDocument();
  });
});
