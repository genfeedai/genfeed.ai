import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import IngredientsListHeader from '@/features/ingredients/components/list/header/IngredientsListHeader';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

describe('IngredientsListHeader', () => {
  it('hands the bulk tag control to the selection bar', () => {
    render(
      <IngredientsListHeader
        canMerge={false}
        isMerging={false}
        onBulkDelete={vi.fn()}
        onClearSelection={vi.fn()}
        onMerge={vi.fn()}
        selectedCount={2}
        tagAction={<button type="button">Tag</button>}
      />,
    );

    expect(screen.getByRole('button', { name: 'Tag' })).toBeInTheDocument();
  });
});
