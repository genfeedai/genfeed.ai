import type { IPostingSet } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PostingSetPicker from './PostingSetPicker';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

function makeSet(overrides: Partial<IPostingSet> = {}): IPostingSet {
  return {
    id: 'set-1',
    isEnabled: true,
    label: 'Shorts + Reels',
    organizationId: 'org-1',
    targets: [],
    userId: 'user-1',
    validation: {
      signatures: [],
      state: 'valid',
      targets: [],
    },
    ...overrides,
  } as IPostingSet;
}

describe('PostingSetPicker', () => {
  it('lets an operator pick a saved posting set', () => {
    const onSelectSet = vi.fn();
    render(
      <PostingSetPicker
        canSave={false}
        onSaveCurrent={vi.fn()}
        onSelectSet={onSelectSet}
        sets={[makeSet()]}
      />,
    );

    fireEvent.click(screen.getByLabelText('Saved posting set'));
    fireEvent.click(screen.getByRole('option', { name: 'Shorts + Reels' }));

    expect(onSelectSet).toHaveBeenCalledWith('set-1');
  });

  it('saves the current selection as a new posting set', () => {
    const onSaveCurrent = vi.fn();
    render(
      <PostingSetPicker
        canSave
        onSaveCurrent={onSaveCurrent}
        onSelectSet={vi.fn()}
        sets={[]}
      />,
    );

    fireEvent.change(screen.getByLabelText('Save current channels as a set'), {
      target: { value: 'Launch kit' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save set' }));

    expect(onSaveCurrent).toHaveBeenCalledWith('Launch kit');
  });

  it('surfaces expand errors without clearing the rest of the picker', () => {
    render(
      <PostingSetPicker
        canSave={false}
        expandError="Instagram is disconnected"
        onSaveCurrent={vi.fn()}
        onSelectSet={vi.fn()}
        sets={[makeSet()]}
      />,
    );

    expect(screen.getByText('Instagram is disconnected')).toBeInTheDocument();
    expect(screen.getByLabelText('Saved posting set')).toBeInTheDocument();
  });
});
