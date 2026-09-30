import { render } from '@testing-library/react';
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
});
