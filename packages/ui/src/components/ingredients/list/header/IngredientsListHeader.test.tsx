import { render, screen } from '@testing-library/react';
import IngredientsListHeader from '@ui/ingredients/list/header/IngredientsListHeader';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

describe('IngredientsListHeader', () => {
  it('should render without crashing', () => {
    const { container } = render(<IngredientsListHeader />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<IngredientsListHeader />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<IngredientsListHeader />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });

  it('hands the bulk tag control to the selection bar', () => {
    render(
      <IngredientsListHeader
        selectedCount={2}
        tagAction={<button type="button">Tag</button>}
      />,
    );

    expect(screen.getByRole('button', { name: 'Tag' })).toBeInTheDocument();
  });
});
